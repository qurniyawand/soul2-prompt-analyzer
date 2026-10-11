import { getApiKeys } from "./apiKeys";
import {
  ApiCallError,
  callWithKeyRotation,
  readProviderJson,
} from "./retry";
import { type ClaudeModelId } from "./modelCatalog";

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

type ClaudeResponse = {
  model?: string;
  stop_reason?: string;
  content?: Array<{
    type: string;
    text?: string;
  }>;
  usage?: unknown;
};

// Extended thinking Claude bersifat opt-in — sebelumnya param `thinking`
// TIDAK PERNAH dikirim ke LLMsRelay sama sekali, jadi Sonnet 5 selama ini
// jalan TANPA reasoning apapun. budget_tokens dikasih ruang buat mikir,
// dan max_tokens WAJIB lebih besar dari budget_tokens (syarat API
// Anthropic) supaya masih ada ruang buat jawaban akhir setelah reasoning
// selesai. Catatan: ini lewat gateway pihak ketiga (LLMsRelay), jadi
// perlu dites — kalau gateway-nya belum mendukung passthrough parameter
// `thinking`, request akan gagal atau parameter ini diabaikan begitu saja.
const CLAUDE_THINKING_BUDGET_TOKENS = 8_000;
const CLAUDE_MAX_TOKENS = 12_000;

// Sama seperti Gemini: tidak ada lagi rotasi MODEL di sini (user memilih
// satu model spesifik dari UI) — cuma rotasi API KEY kalau kena rate
// limit. Timeout dinaikkan karena thinking menambah waktu proses.
const ATTEMPT_TIMEOUT_MS = 100_000;
const TOTAL_TIMEOUT_MS = 112_000;
const MAX_ATTEMPTS = 2;

export async function callClaude(
  model: ClaudeModelId,
  systemInstruction: string,
  content: AnthropicContentBlock[]
): Promise<{
  text: string;
  usage: unknown;
  modelUsed: string;
}> {
  const keys = getApiKeys("LLMSRELAY_API_KEYS", "LLMSRELAY_API_KEY");

  const baseUrl = (
    process.env.LLMSRELAY_BASE_URL || "https://api.llmsrelay.com"
  ).replace(/\/+$/, "");

  if (new URL(baseUrl).protocol !== "https:") {
    throw new ApiCallError("LLMSRELAY_BASE_URL harus memakai HTTPS.");
  }

  return callWithKeyRotation(
    keys,
    async (key, signal) => {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        signal,
        cache: "no-store",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: CLAUDE_MAX_TOKENS,
          system: systemInstruction,
          thinking: {
            type: "enabled",
            budget_tokens: CLAUDE_THINKING_BUDGET_TOKENS,
          },
          messages: [{ role: "user", content }],
        }),
      });

      const data = await readProviderJson<ClaudeResponse>(res, "LLMsRelay");

      if (data.stop_reason === "max_tokens") {
        throw new ApiCallError(
          "Jawaban Claude terpotong oleh batas token.",
          422
        );
      }

      if (data.stop_reason !== "end_turn") {
        throw new ApiCallError(
          "Claude tidak menyelesaikan jawaban secara normal.",
          422
        );
      }

      // Blok "thinking" (kalau ada) otomatis ke-skip di sini karena
      // filter hanya mengambil block.type === "text".
      const text = (data.content ?? [])
        .filter(
          (block) => block.type === "text" && typeof block.text === "string"
        )
        .map((block) => block.text ?? "")
        .join("\n")
        .trim();

      if (!text) {
        throw new ApiCallError("Claude mengembalikan jawaban kosong.", 502);
      }

      return {
        text,
        usage: data.usage ?? null,
        modelUsed: data.model || model,
      };
    },
    {
      label: `LLMsRelay (${model})`,
      maxAttempts: MAX_ATTEMPTS,
      totalTimeoutMs: TOTAL_TIMEOUT_MS,
      attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    }
  );
}
