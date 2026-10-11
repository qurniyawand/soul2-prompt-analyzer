import { Buffer } from "node:buffer";
import { HttpError, isRecord } from "@/lib/http";
import { MAX_IMAGE_BYTES } from "@/lib/uploadLimits";
import {
  HAIRSTYLE_PRESETS,
  isTargetImageModel,
  type PromptMode,
  type TargetImageModel,
} from "@/lib/promptInstructions";
import {
  isAnalyzeModelId,
  type AnalyzeModelId,
} from "@/lib/modelCatalog";

type InputPhoto = {
  base64: string;
  mediaType: "image/jpeg";
};

export type AnalyzeInput = {
  mainPhoto: InputPhoto;
  referenceClothing: InputPhoto | null;
  referenceLocation: InputPhoto | null;
  subjectPlacement?: string;
  hairstylePreset: string | null;
  model: AnalyzeModelId;
  targetImageModel: TargetImageModel;
  promptMode: PromptMode;
};

const MAX_SUBJECT_PLACEMENT_LENGTH = 600;

function parseSubjectPlacement(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value !== "string") {
    throw new HttpError("Format catatan penempatan subjek tidak valid.", 400);
  }

  const cleaned = value
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

  if (!cleaned) return undefined;

  if (cleaned.length > MAX_SUBJECT_PLACEMENT_LENGTH) {
    throw new HttpError(
      `Catatan penempatan subjek maksimal ${MAX_SUBJECT_PLACEMENT_LENGTH} karakter.`,
      400
    );
  }

  return cleaned;
}

const validHairstyles = new Set<string>([
  ...HAIRSTYLE_PRESETS.gerai,
  ...HAIRSTYLE_PRESETS.ikatan,
]);

function parsePhoto(
  value: unknown,
  label: string,
  required: boolean
): InputPhoto | null {
  if (value === null || value === undefined) {
    if (required) {
      throw new HttpError(`${label} wajib diupload.`, 400);
    }

    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.base64 !== "string" ||
    value.mediaType !== "image/jpeg"
  ) {
    throw new HttpError(`${label} tidak valid.`, 400);
  }

  const base64 = value.base64;
  const maxBase64Length = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);

  if (!base64 || base64.length > maxBase64Length) {
    throw new HttpError(`${label} kosong atau terlalu besar.`, 413);
  }

  if (
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    throw new HttpError(`Base64 ${label} tidak valid.`, 400);
  }

  const bytes = Buffer.from(base64, "base64");

  if (
    bytes.length === 0 ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== base64
  ) {
    throw new HttpError(`Data ${label} tidak valid.`, 400);
  }

  // Pemeriksaan signature JPEG, bukan decoding penuh gambar.
  if (
    bytes.length < 3 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw new HttpError(`${label} bukan JPEG yang sesuai.`, 400);
  }

  return { base64, mediaType: "image/jpeg" };
}

export function parseAnalyzeInput(body: unknown): AnalyzeInput {
  if (!isRecord(body)) {
    throw new HttpError("Body request harus berupa object.", 400);
  }

  const model = body.model ?? "claude-sonnet-5";
  const targetImageModel = body.targetImageModel ?? "soul2";
  const promptMode = body.promptMode ?? "text-only";

  if (!isAnalyzeModelId(model)) {
    throw new HttpError("Model analisis tidak valid.", 400);
  }

  if (!isTargetImageModel(targetImageModel)) {
    throw new HttpError("Target image model tidak valid.", 400);
  }

  if (
    promptMode !== "text-only" &&
    promptMode !== "with-reference-photo"
  ) {
    throw new HttpError("Mode prompt tidak valid.", 400);
  }

  const hairstylePreset = body.hairstylePreset ?? null;

  if (
    hairstylePreset !== null &&
    (
      typeof hairstylePreset !== "string" ||
      !validHairstyles.has(hairstylePreset)
    )
  ) {
    throw new HttpError("Preset gaya rambut tidak valid.", 400);
  }

  const mainPhoto = parsePhoto(body.mainPhoto, "Foto utama", true);

  if (!mainPhoto) {
    throw new HttpError("Foto utama wajib diupload.", 400);
  }

  return {
    mainPhoto,
    referenceClothing: parsePhoto(
      body.referenceClothing,
      "Foto referensi pakaian",
      false
    ),
    referenceLocation: parsePhoto(
      body.referenceLocation,
      "Foto referensi lokasi",
      false
    ),
    subjectPlacement: parseSubjectPlacement(body.subjectPlacement),
    hairstylePreset,
    model,
    targetImageModel,
    promptMode,
  };
}
