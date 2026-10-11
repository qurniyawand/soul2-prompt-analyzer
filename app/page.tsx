"use client";

import { useEffect, useRef, useState } from "react";
import UploadField from "./UploadField";
import type { CompressedImage } from "@/lib/imageCompress";
import {
  HAIRSTYLE_PRESETS,
  TARGET_IMAGE_MODELS,
  type PromptMode,
  type TargetImageModel,
} from "@/lib/promptInstructions";
import {
  CLAUDE_MODELS,
  GEMINI_MODELS,
  type AnalyzeModelId,
} from "@/lib/modelCatalog";

export default function HomePage() {
  const [aiModel, setAiModel] = useState<AnalyzeModelId>("gemini-3.8-flash");
  const [targetImageModel, setTargetImageModel] =
    useState<TargetImageModel>("soul2");
  const [promptMode, setPromptMode] =
    useState<PromptMode>("text-only");
  const [mainPhoto, setMainPhoto] = useState<CompressedImage | null>(null);
  const [followClothing, setFollowClothing] = useState(true);
  const [referenceClothing, setReferenceClothing] = useState<CompressedImage | null>(null);
  const [followLocation, setFollowLocation] = useState(true);
  const [referenceLocation, setReferenceLocation] = useState<CompressedImage | null>(null);
  const [followHairstyle, setFollowHairstyle] = useState(true);
  const [hairstylePreset, setHairstylePreset] = useState("");
  const [subjectPlacement, setSubjectPlacement] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [resultModel, setResultModel] = useState("");
  const [copied, setCopied] = useState(false);

  const [mainBusy, setMainBusy] = useState(false);
  const [clothingBusy, setClothingBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);

  const generatingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCompressing =
    mainBusy ||
    (!followClothing && clothingBusy) ||
    (!followLocation && locationBusy);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();

      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function handleGenerate() {
    if (generatingRef.current) return;

    setError("");

    if (isCompressing) {
      setError("Tunggu sampai semua foto selesai dikompres.");
      return;
    }

    if (!mainPhoto) {
      setError("Upload foto utama dulu.");
      return;
    }

    if (!followClothing && !referenceClothing) {
      setError("Upload foto referensi pakaian atau aktifkan ikuti foto utama.");
      return;
    }

    if (!followLocation && !referenceLocation) {
      setError("Upload foto referensi lokasi atau aktifkan ikuti foto utama.");
      return;
    }

    if (!followHairstyle && !hairstylePreset) {
      setError("Pilih gaya rambut atau aktifkan ikuti foto utama.");
      return;
    }

    generatingRef.current = true;
    setLoading(true);
    setResult("");
    setResultModel("");
    setCopied(false);

    const controller = new AbortController();
    requestRef.current = controller;

    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 115_000);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mainPhoto,
          referenceClothing: followClothing ? null : referenceClothing,
          referenceLocation: followLocation ? null : referenceLocation,
          subjectPlacement: subjectPlacement.trim() || undefined,
          hairstylePreset: followHairstyle ? null : hairstylePreset,
          model: aiModel,
          targetImageModel,
          promptMode,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }

      const data: unknown = await res.json().catch(() => null);

      const payload =
        typeof data === "object" && data !== null
          ? data as Record<string, unknown>
          : null;

      if (!res.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : res.status === 413
              ? "Ukuran upload melebihi batas server."
              : `Gagal generate (HTTP ${res.status}).`
        );
      }

      if (
        typeof payload?.prompt !== "string" ||
        !payload.prompt.trim()
      ) {
        throw new Error("Server mengembalikan prompt kosong atau tidak valid.");
      }

      setResult(payload.prompt.trim());
      setResultModel(
        typeof payload.model === "string" ? payload.model : ""
      );
    } catch (err: unknown) {
      // Abort karena halaman dilepas tidak perlu ditampilkan.
      if (controller.signal.aborted && !timedOut) return;

      setError(
        timedOut
          ? "Waktu tunggu habis. Silakan coba lagi."
          : err instanceof Error
            ? err.message
            : "Gagal menghubungi server."
      );
    } finally {
      clearTimeout(timer);
      generatingRef.current = false;

      if (requestRef.current === controller) {
        requestRef.current = null;
      }

      if (!controller.signal.aborted || timedOut) {
        setLoading(false);
      }
    }
  }

  async function handleCopy() {
    if (!result) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard tidak tersedia.");
      }

      await navigator.clipboard.writeText(result);
      setCopied(true);

      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
      setError(
        "Gagal menyalin otomatis. Gunakan HTTPS/localhost atau salin teks secara manual."
      );
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-8 px-5 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Photo Prompt Analyzer</h1>
        <p className="mt-1 text-sm text-ink/60">
          Upload foto, atur override kalau perlu, lalu generate prompt siap pakai.
        </p>
      </header>

      <fieldset
        disabled={loading}
        className="min-w-0 space-y-6 disabled:opacity-60"
      >
        <legend className="sr-only">Pengaturan analisis foto</legend>

      <section>
        <label
          htmlFor="ai-model"
          className="mb-1.5 block text-sm font-medium text-ink/70"
        >
          Model AI
        </label>
        <select
          id="ai-model"
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value as AnalyzeModelId)}
          className="w-full rounded-lg border border-ink/20 px-3 py-2"
        >
          <optgroup label="Claude">
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Gemini">
            {GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>
      </section>

      <section aria-label="Target image model">
        <p className="mb-2 text-sm font-medium text-ink/70">
          Target Prompt
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TARGET_IMAGE_MODELS.map((target) => (
            <button
              key={target.id}
              type="button"
              aria-pressed={targetImageModel === target.id}
              onClick={() => setTargetImageModel(target.id)}
              className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                targetImageModel === target.id
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/20 bg-white text-ink/70"
              }`}
            >
              Target: {target.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="mb-1.5 block text-sm font-medium text-ink/70">
          Mode Prompt
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPromptMode("text-only")}
            className={`rounded-xl border py-3 text-sm font-medium transition ${
              promptMode === "text-only"
                ? "border-ink bg-ink text-paper"
                : "border-ink/20 bg-white text-ink/70"
            }`}
          >
            Teks Saja
          </button>
          <button
            type="button"
            onClick={() => setPromptMode("with-reference-photo")}
            className={`rounded-xl border py-3 text-sm font-medium transition ${
              promptMode === "with-reference-photo"
                ? "border-ink bg-ink text-paper"
                : "border-ink/20 bg-white text-ink/70"
            }`}
          >
            + Foto Referensi
          </button>
        </div>
        {promptMode === "with-reference-photo" && (
          <p className="mt-2 text-xs text-ink/60">
            Pose, ekspresi, angle kamera, dan framing tidak dijabarkan ulang
            dalam teks. Lampirkan foto utama yang sama ke model image tujuan
            bersama prompt ini. Detail override pakaian, lokasi, dan penataan
            rambut tetap dituliskan dalam prompt.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-ink/10 bg-white p-5">
        <UploadField
          label="Foto utama (wajib)"
          value={mainPhoto}
          onChange={setMainPhoto}
          onBusyChange={setMainBusy}
          disabled={loading}
        />
      </section>

      {/* Pakaian */}
      <section className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5">
        <ToggleRow
          label="Ikuti pakaian dari foto utama?"
          value={followClothing}
          onChange={setFollowClothing}
        />
        {!followClothing && (
          <UploadField
            label="Foto referensi pakaian"
            value={referenceClothing}
            onChange={setReferenceClothing}
            onBusyChange={setClothingBusy}
            disabled={loading}
          />
        )}
      </section>

      {/* Lokasi */}
      <section className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5">
        <ToggleRow
          label="Ikuti lokasi/background dari foto utama?"
          value={followLocation}
          onChange={setFollowLocation}
        />
        {!followLocation && (
          <UploadField
            label="Foto referensi lokasi/background"
            value={referenceLocation}
            onChange={setReferenceLocation}
            onBusyChange={setLocationBusy}
            disabled={loading}
          />
        )}
      </section>

      {/* Gaya rambut */}
      <section className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5">
        <ToggleRow
          label="Ikuti gaya rambut dari foto utama?"
          value={followHairstyle}
          onChange={setFollowHairstyle}
        />
        {!followHairstyle && (
          <div className="space-y-2">
            <label
              htmlFor="hairstyle-preset"
              className="block text-sm font-medium text-ink/70"
            >
              Preset penataan rambut
            </label>

            <select
              id="hairstyle-preset"
              value={hairstylePreset}
              onChange={(e) => setHairstylePreset(e.target.value)}
              className="w-full rounded-lg border border-ink/20 px-3 py-2"
            >
              <option value="">— Pilih penataan rambut —</option>

              <optgroup label="Rambut Gerai">
                {HAIRSTYLE_PRESETS.gerai.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </optgroup>

              <optgroup label="Ikatan, Sanggul, dan Kepangan">
                {HAIRSTYLE_PRESETS.ikatan.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </optgroup>
            </select>

            <p className="text-xs text-ink/60">
              Preset mengatur susunan dan posisi rambut tanpa menentukan jenis
              atau warna rambut. Pilih preset "face-crossing" untuk bagian
              rambut yang jatuh di depan wajah.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <label htmlFor="subject-placement" className="block text-sm font-medium">
          Penempatan subjek di background{" "}
          <span className="font-normal text-ink/60">(opsional)</span>
        </label>
        <textarea
          id="subject-placement"
          value={subjectPlacement}
          onChange={(e) => setSubjectPlacement(e.target.value.slice(0, 600))}
          maxLength={600}
          rows={3}
          placeholder="Contoh: duduk di kursi yang sudah ada di lokasi, badan serong ke kiri, tangan kanan di atas meja."
          className="w-full rounded-lg border border-ink/20 px-3 py-2"
        />
        <p className="text-xs text-ink/60">
          Hanya mengatur posisi & tumpuan subjek. Struktur dan tata letak
          background tetap dipertahankan. {subjectPlacement.length}/600
        </p>
      </section>

      </fieldset>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || isCompressing}
        className="w-full rounded-xl bg-clay py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {loading
          ? "Menganalisa..."
          : isCompressing
            ? "Menunggu kompresi foto..."
            : "Generate Prompt"}
      </button>

      {error && <p className="text-sm text-clay">{error}</p>}

      {result && (
        <section className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              Hasil prompt {resultModel && <span className="text-ink/40">({resultModel})</span>}
            </h2>
            <button onClick={handleCopy} className="text-sm text-clay underline">
              {copied ? "Tersalin!" : "Salin"}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{result}</p>
        </section>
      )}
    </main>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>

      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`h-6 w-11 shrink-0 rounded-full transition ${
          value ? "bg-moss" : "bg-ink/20"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
