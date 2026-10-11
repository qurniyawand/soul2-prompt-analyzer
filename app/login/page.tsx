"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data: unknown = await res.json().catch(() => null);

      const payload =
        typeof data === "object" && data !== null
          ? data as Record<string, unknown>
          : null;

      if (!res.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : `Gagal login (HTTP ${res.status}).`
        );
      }

      if (payload?.ok !== true) {
        throw new Error("Respons login tidak valid.");
      }

      router.replace("/");
      router.refresh();
    } catch (err: unknown) {
      setError(
        controller.signal.aborted
          ? "Waktu tunggu login habis."
          : err instanceof Error
            ? err.message
            : "Gagal menghubungi server."
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Masuk</h1>
        <p className="text-sm text-ink/60">
          Masukkan password untuk mengakses Photo Prompt Analyzer.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-ink/20 px-3 py-2 outline-none focus:border-clay"
          autoFocus
          required
          maxLength={512}
          autoComplete="current-password"
          aria-label="Password"
          disabled={loading}
        />
        {error && <p className="text-sm text-clay">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-lg bg-ink py-2 text-paper transition hover:bg-ink/90 disabled:opacity-50"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
