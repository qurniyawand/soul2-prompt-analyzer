export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");

  // Request non-browser mungkin tidak membawa Origin.
  // Autentikasi tetap wajib diperiksa oleh endpoint privat.
  if (!origin) return;

  const expectedOrigin = new URL(
    process.env.APP_ORIGIN || req.url
  ).origin;

  if (origin !== expectedOrigin) {
    throw new HttpError("Origin request tidak diizinkan.", 403);
  }
}

export async function readJsonLimited(
  req: Request,
  maxBytes: number
): Promise<unknown> {
  const contentType = req.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new HttpError("Content-Type harus application/json.", 415);
  }

  const contentLength = req.headers.get("content-length");

  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);

    if (
      !Number.isFinite(declaredBytes) ||
      declaredBytes < 0
    ) {
      throw new HttpError("Content-Length tidak valid.", 400);
    }

    if (declaredBytes > maxBytes) {
      throw new HttpError("Ukuran request terlalu besar.", 413);
    }
  }

  const reader = req.body?.getReader();

  if (!reader) {
    throw new HttpError("Body request kosong.", 400);
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError("Ukuran request terlalu besar.", 413);
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError("Body JSON tidak valid.", 400);
  }
}
