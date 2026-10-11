import {
  MAX_IMAGE_BYTES,
  MAX_SOURCE_FILE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_SOURCE_PIXELS,
} from "@/lib/uploadLimits";

export interface CompressedImage {
  base64: string;
  mediaType: "image/jpeg";
  sizeBytes: number;
}

const ALLOWED_INPUT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => {
      reject(new Error("Gambar tidak dapat dibaca. Gunakan JPEG, PNG, atau WebP."));
    };

    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Browser gagal mengompres gambar."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Hasil pembacaan gambar tidak valid."));
        return;
      }

      const separator = reader.result.indexOf(",");

      if (separator < 0) {
        reject(new Error("Format data gambar tidak valid."));
        return;
      }

      resolve(reader.result.slice(separator + 1));
    };

    reader.onerror = () => {
      reject(new Error("Gagal membaca hasil kompresi."));
    };

    reader.onabort = () => {
      reject(new Error("Pembacaan gambar dibatalkan."));
    };

    reader.readAsDataURL(blob);
  });
}

export async function compressImageFile(
  file: File
): Promise<CompressedImage> {
  if (!ALLOWED_INPUT_TYPES.has(file.type)) {
    throw new Error("Format tidak didukung. Gunakan JPEG, PNG, atau WebP.");
  }

  if (file.size === 0) {
    throw new Error("File gambar kosong.");
  }

  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error("Ukuran file asli maksimal 20 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");

  try {
    const img = await loadImage(objectUrl);

    const sourceWidth = img.naturalWidth;
    const sourceHeight = img.naturalHeight;

    if (!sourceWidth || !sourceHeight) {
      throw new Error("Dimensi gambar tidak valid.");
    }

    if (sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
      throw new Error(
        "Resolusi gambar terlalu besar. Kecilkan gambar ke maksimal 40 megapiksel."
      );
    }

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight)
    );

    let width = Math.max(1, Math.round(sourceWidth * scale));
    let height = Math.max(1, Math.round(sourceHeight * scale));

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas tidak didukung di browser ini.");
    }

    const qualities = [0.9, 0.85, 0.8, 0.75];

    // Jumlah putaran dibatasi agar proses tidak berjalan tanpa akhir.
    for (let round = 0; round < 24; round++) {
      canvas.width = width;
      canvas.height = height;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // JPEG tidak mendukung transparansi.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, quality);

        if (blob.size <= MAX_IMAGE_BYTES) {
          return {
            base64: await blobToBase64(blob),
            mediaType: "image/jpeg",
            sizeBytes: blob.size,
          };
        }
      }

      const nextWidth = Math.max(1, Math.floor(width * 0.85));
      const nextHeight = Math.max(1, Math.floor(height * 0.85));

      if (nextWidth === width && nextHeight === height) {
        break;
      }

      width = nextWidth;
      height = nextHeight;
    }

    throw new Error(
      "Gambar belum bisa dikompres ke batas ukuran. Coba gambar lain."
    );
  } finally {
    URL.revokeObjectURL(objectUrl);

    // Lepaskan backing buffer canvas setelah selesai.
    canvas.width = 0;
    canvas.height = 0;
  }
}
