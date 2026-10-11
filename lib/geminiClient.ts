import { getApiKeys } from "./apiKeys";
import {
  ApiCallError,
  callWithKeyRotation,
  readProviderJson,
} from "./retry";
import { type GeminiModelId } from "./modelCatalog";

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiResponse = {
  modelVersion?: string;
  promptFeedback?: {
    blockReason?: string;
  };
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
  }>;
  usageMetadata?: unknown;
};

// Timeout khusus panggilan Gemini. Model 3.x-flash melakukan reasoning
// ("thinking") sebelum menjawab, jadi butuh jendela waktu yang cukup
// panjang per percobaan. Tidak ada lagi rotasi MODEL di sini (user
// memilih satu model spesifik dari UI) — cuma rotasi API KEY kalau kena
// rate limit, supaya seluruh budget waktu terpakai untuk model pilihan
// user, bukan habis dicicil ke beberapa model sekaligus.
const ATTEMPT_TIMEOUT_MS = 100_000;
const TOTAL_TIMEOUT_MS = 112_000;
const MAX_ATTEMPTS = 2;

export async function callGemini(
  model: GeminiModelId,
  systemInstruction: string,
  parts: GeminiPart[]
): Promise<{
  text: string;
  usage: unknown;
  modelUsed: string;
}> {
  const keys = getApiKeys("GEMINI_API_KEYS", "GEMINI_API_KEY");

  return callWithKeyRotation(
    keys,
    async (key, signal) => {
      const endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        `${encodeURIComponent(model)}:generateContent`;

      const res = await fetch(endpoint, {
        method: "POST",
        signal,
        cache: "no-store",
        headers: {
          "x-goog-api-key": key,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [{ role: "user", parts }],
          generationConfig: {
            maxOutputTokens: 4096,
          },
        }),
      });

      const data = await readProviderJson<GeminiResponse>(res, "Gemini");

      if (data.promptFeedback?.blockReason) {
        throw new ApiCallError(
          "Permintaan tidak dapat diproses oleh kebijakan provider.",
          422
        );
      }

      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new ApiCallError(
          "Gemini tidak mengembalikan kandidat jawaban.",
          502
        );
      }

      if (candidate.finishReason === "MAX_TOKENS") {
        throw new ApiCallError(
          "Jawaban Gemini terpotong oleh batas token.",
          422
        );
      }

      if (candidate.finishReason !== "STOP") {
        throw new ApiCallError(
          "Gemini tidak menyelesaikan jawaban secara normal.",
          422
        );
      }

      const text = (candidate.content?.parts ?? [])
        .filter(
          (part) => part.thought !== true && typeof part.text === "string"
        )
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new ApiCallError("Gemini mengembalikan jawaban kosong.", 502);
      }

      return {
        text,
        usage: data.usageMetadata ?? null,
        modelUsed: data.modelVersion || model,
      };
    },
    {
      label: `Gemini (${model})`,
      maxAttempts: MAX_ATTEMPTS,
      totalTimeoutMs: TOTAL_TIMEOUT_MS,
      attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    }
  );
}
