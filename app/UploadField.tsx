"use client";

import { useEffect, useId, useRef, useState } from "react";
import { compressImageFile } from "@/lib/imageCompress";
import type { CompressedImage } from "@/lib/imageCompress";

type UploadFieldProps = {
  label: string;
  value: CompressedImage | null;
  onChange: (img: CompressedImage | null) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
};

export default function UploadField({
  label,
  value,
  onChange,
  onBusyChange,
  disabled = false,
}: UploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const jobId = useRef(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      // Abaikan hasil kompresi yang selesai setelah komponen dilepas.
      jobId.current += 1;
      onBusyChange(false);
    };
  }, [onBusyChange]);

  function clearFile() {
    jobId.current += 1;

    setBusy(false);
    setError("");
    onBusyChange(false);
    onChange(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;

    const currentJob = ++jobId.current;

    setError("");
    setBusy(true);
    onBusyChange(true);

    // Jangan biarkan foto lama dipakai ketika foto baru masih diproses.
    onChange(null);

    try {
      const compressed = await compressImageFile(file);

      if (currentJob !== jobId.current) return;

      onChange(compressed);
    } catch (err: unknown) {
      if (currentJob !== jobId.current) return;

      setError(
        err instanceof Error
          ? err.message
          : "Gagal memproses gambar."
      );
    } finally {
      if (currentJob === jobId.current) {
        setBusy(false);
        onBusyChange(false);

        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    }
  }

  return (
    <div className="space-y-2" aria-busy={busy}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium"
      >
        {label}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || busy}
        onChange={(e) => {
          void handleFile(e.target.files?.[0] ?? null);
        }}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-paper disabled:opacity-50"
      />

      {busy && (
        <p role="status" className="text-xs text-ink/50">
          Mengompres foto...
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-clay">
          {error}
        </p>
      )}

      {value && !busy && (
        <div className="flex items-center gap-3">
          <img
            src={`data:${value.mediaType};base64,${value.base64}`}
            alt={`Pratinjau ${label}`}
            className="h-20 w-20 rounded-lg object-cover"
          />

          <span className="text-xs text-ink/50">
            {(value.sizeBytes / 1024).toFixed(0)} KB setelah kompresi
          </span>
        </div>
      )}

      {(value || busy) && (
        <button
          type="button"
          onClick={clearFile}
          disabled={disabled}
          className="text-xs text-clay underline disabled:opacity-50"
        >
          {busy ? "Batalkan pilihan foto" : "Hapus foto"}
        </button>
      )}
    </div>
  );
}
