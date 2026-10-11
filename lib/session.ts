const COOKIE_NAME = "ppa_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET harus berisi minimal 32 karakter acak."
    );
  }

  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Base64url tidak valid.");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - normalized.length % 4) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (toBase64Url(bytes) !== value) {
    throw new Error("Encoding sesi tidak canonical.");
  }

  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionCookieValue(): Promise<string> {
  const payload = JSON.stringify({
    v: 1,
    issuedAt: Date.now(),
    nonce: crypto.randomUUID(),
  });

  const encodedPayload = toBase64Url(
    new TextEncoder().encode(payload)
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    await getKey(),
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionCookieValue(
  cookieValue: string | undefined
): Promise<boolean> {
  if (!cookieValue || cookieValue.length > 1024) {
    return false;
  }

  try {
    const segments = cookieValue.split(".");

    if (segments.length !== 2) return false;

    const [encodedPayload, encodedSignature] = segments;
    const signature = fromBase64Url(encodedSignature);

    if (signature.byteLength !== 32) return false;

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await getKey(),
      new Uint8Array(signature),
      new TextEncoder().encode(encodedPayload)
    );

    if (!validSignature) return false;

    const payload: unknown = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload))
    );

    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return false;
    }

    const value = payload as Record<string, unknown>;

    if (
      value.v !== 1 ||
      typeof value.issuedAt !== "number" ||
      !Number.isSafeInteger(value.issuedAt) ||
      typeof value.nonce !== "string" ||
      !value.nonce
    ) {
      return false;
    }

    const ageMs = Date.now() - value.issuedAt;

    // Toleransi selisih clock kecil antarserver.
    return (
      ageMs >= -30_000 &&
      ageMs < MAX_AGE_SECONDS * 1000
    );
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
