// Baca API key dari env variable. Mendukung banyak key dipisah koma
// (mis. GEMINI_API_KEYS="key1,key2,key3") untuk rotasi kalau salah satu
// kena rate limit. Tetap kompatibel dengan env variable lama yang cuma
// isi 1 key (GEMINI_API_KEY).

export function getApiKeys(pluralEnvName: string, singularEnvName: string): string[] {
  const plural = process.env[pluralEnvName];
  if (plural && plural.trim()) {
    return plural
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  const single = process.env[singularEnvName];
  return single && single.trim() ? [single.trim()] : [];
}
