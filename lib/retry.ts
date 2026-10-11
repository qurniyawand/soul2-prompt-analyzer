export class ApiCallError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

const RETRYABLE_STATUS = new Set([
  408, 429, 500, 502, 503, 504,
]);

function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiCallError) {
    return (
      err.status !== undefined &&
      RETRYABLE_STATUS.has(err.status)
    );
  }

  return (
    err instanceof TypeError ||
    (
      err instanceof Error &&
      (
        err.name === "AbortError" ||
        err.name === "TimeoutError"
      )
    )
  );
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);

  return Number.isFinite(date)
    ? Math.max(0, date - Date.now())
    : undefined;
}

export async function readProviderJson<T>(
  res: Response,
  label: string
): Promise<T> {
  let data: unknown;

  try {
    data = JSON.parse(await res.text()) as unknown;
  } catch {
    throw new ApiCallError(
      `${label} mengembalikan respons non-JSON.`,
      res.ok ? 502 : res.status,
      parseRetryAfter(res.headers.get("retry-after"))
    );
  }

  if (!res.ok) {
    // Jangan teruskan body error provider mentah ke browser.
    throw new ApiCallError(
      `${label} gagal (HTTP ${res.status}).`,
      res.status,
      parseRetryAfter(res.headers.get("retry-after"))
    );
  }

  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    throw new ApiCallError(
      `${label} mengembalikan struktur respons tidak valid.`,
      502
    );
  }

  return data as T;
}

// Status yang TIDAK boleh memicu pindah model — ini kegagalan permanen
// (konfigurasi/kunci/input), bukan tanda model sedang overload/bermasalah.
const NON_FALLBACK_STATUS = new Set([400, 401, 413, 422]);

function shouldFallbackToNextModel(err: unknown): boolean {
  if (err instanceof ApiCallError) {
    return err.status === undefined || !NON_FALLBACK_STATUS.has(err.status);
  }

  // Error non-ApiCallError (network/timeout) juga layak dicoba di model lain.
  return true;
}

/**
 * Coba serangkaian model secara berurutan. Untuk tiap model, rotasi API key
 * seperti biasa (callWithKeyRotation). Kalau SEMUA key untuk model itu sudah
 * dicoba dan tetap gagal karena alasan yang masuk akal untuk fallback
 * (rate limit, overload, timeout, error provider), baru pindah ke model
 * berikutnya dalam daftar. Kegagalan permanen (401/400/413/422) langsung
 * dilempar tanpa mencoba model lain, karena bukan masalah model.
 */
export async function callWithModelRotation<T>(
  models: string[],
  keys: string[],
  attempt: (
    model: string,
    key: string,
    signal: AbortSignal
  ) => Promise<T>,
  opts: {
    label?: string;
    maxAttemptsPerModel?: number;
    totalTimeoutMs?: number;
    attemptTimeoutMs?: number;
  } = {}
): Promise<T> {
  const uniqueModels = [
    ...new Set(models.map((m) => m.trim()).filter(Boolean)),
  ];

  const label = opts.label ?? "Provider AI";

  if (uniqueModels.length === 0) {
    throw new ApiCallError(`Model ${label} belum dikonfigurasi.`);
  }

  const deadline = Date.now() + (opts.totalTimeoutMs ?? 90_000);

  let lastError: unknown;

  for (const model of uniqueModels) {
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      throw lastError ?? new ApiCallError("Waktu tunggu AI habis.", 504);
    }

    try {
      return await callWithKeyRotation(
        keys,
        (key, signal) => attempt(model, key, signal),
        {
          label: `${label} (${model})`,
          maxAttempts: opts.maxAttemptsPerModel ?? 3,
          totalTimeoutMs: remainingMs,
          attemptTimeoutMs: opts.attemptTimeoutMs,
        }
      );
    } catch (err: unknown) {
      lastError = err;

      if (!shouldFallbackToNextModel(err)) {
        throw err;
      }
      // else lanjut ke model berikutnya dalam loop
    }
  }

  throw lastError ?? new ApiCallError(`${label} tidak dapat dipanggil.`, 502);
}

export async function callWithKeyRotation<T>(
  keys: string[],
  attempt: (key: string, signal: AbortSignal) => Promise<T>,
  opts: {
    label?: string;
    maxAttempts?: number;
    totalTimeoutMs?: number;
    attemptTimeoutMs?: number;
  } = {}
): Promise<T> {
  const uniqueKeys = [...new Set(
    keys.map((key) => key.trim()).filter(Boolean)
  )];

  const label = opts.label ?? "Provider AI";

  if (uniqueKeys.length === 0) {
    throw new ApiCallError(
      `API key ${label} belum dikonfigurasi.`
    );
  }

  const maxAttempts = opts.maxAttempts ?? 3;
  const deadline = Date.now() + (opts.totalTimeoutMs ?? 90_000);
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? 40_000;

  const rejectedKeys = new Set<string>();

  let lastError: unknown;
  let keyCursor = 0;

  for (let index = 0; index < maxAttempts; index++) {
    const availableKeys = uniqueKeys.filter(
      (key) => !rejectedKeys.has(key)
    );

    if (availableKeys.length === 0) break;

    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      throw new ApiCallError("Waktu tunggu AI habis.", 504);
    }

    const key = availableKeys[keyCursor % availableKeys.length];
    keyCursor += 1;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(attemptTimeoutMs, remainingMs)
    );

    let shouldWait = false;

    try {
      return await attempt(key, controller.signal);
    } catch (err: unknown) {
      const normalizedError = controller.signal.aborted
        ? new ApiCallError("Provider AI melewati batas waktu.", 504)
        : err;

      lastError = normalizedError;

      if (
        normalizedError instanceof ApiCallError &&
        normalizedError.status === 401
      ) {
        rejectedKeys.add(key);
      } else {
        if (!isRetryableError(normalizedError)) {
          throw normalizedError;
        }

        shouldWait = true;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (index === maxAttempts - 1) break;

    if (shouldWait) {
      const providerWait =
        lastError instanceof ApiCallError
          ? lastError.retryAfterMs
          : undefined;

      const waitMs =
        providerWait ??
        (1000 * 2 ** index + Math.floor(Math.random() * 300));

      if (Date.now() + waitMs >= deadline) {
        throw (
          lastError ??
          new ApiCallError("Waktu tunggu AI habis.", 504)
        );
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }

  throw (
    lastError ??
    new ApiCallError(`${label} tidak dapat dipanggil.`, 502)
  );
}
