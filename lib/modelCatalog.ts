// Katalog model yang bisa dipilih user secara manual dari UI.
// Sengaja dipisah jadi file sendiri berisi konstanta murni (tanpa fetch,
// API key, atau kode server lain) supaya aman diimport dari client
// component (dropdown di page.tsx) maupun dari server (validasi &
// pemanggilan API), tanpa menyeret kode server ke bundle browser.

export const CLAUDE_MODELS = [
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
] as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"];

export const GEMINI_MODELS = [
  { id: "gemini-3.8-flash", label: "3.8 Flash" },
  { id: "gemini-3.7-flash", label: "3.7 Flash" },
  { id: "gemini-3.6-flash", label: "3.6 Flash" },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

export type AnalyzeModelId = ClaudeModelId | GeminiModelId;

const CLAUDE_MODEL_IDS = new Set<string>(CLAUDE_MODELS.map((m) => m.id));
const GEMINI_MODEL_IDS = new Set<string>(GEMINI_MODELS.map((m) => m.id));

export function isClaudeModelId(value: unknown): value is ClaudeModelId {
  return typeof value === "string" && CLAUDE_MODEL_IDS.has(value);
}

export function isGeminiModelId(value: unknown): value is GeminiModelId {
  return typeof value === "string" && GEMINI_MODEL_IDS.has(value);
}

export function isAnalyzeModelId(value: unknown): value is AnalyzeModelId {
  return isClaudeModelId(value) || isGeminiModelId(value);
}
