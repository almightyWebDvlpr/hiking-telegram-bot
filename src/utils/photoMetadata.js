import crypto from "node:crypto";

let sharpRuntime = null;
let exifrRuntime = null;

try {
  const sharpModule = await import("sharp");
  sharpRuntime = sharpModule.default || sharpModule;
} catch {
  sharpRuntime = null;
}

try {
  exifrRuntime = await import("exifr");
} catch {
  exifrRuntime = null;
}

function normalizeExifDate(value) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

export async function extractTelegramPhotoMetadata(telegram, fileId) {
  if (!telegram || !fileId || !sharpRuntime) {
    return {};
  }

  try {
    const fileLink = await telegram.getFileLink(fileId);
    const response = await fetch(String(fileLink));
    if (!response.ok) {
      return {};
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharpRuntime(buffer).metadata();
    let takenAt = "";

    if (exifrRuntime?.parse) {
      try {
        const exifData = await exifrRuntime.parse(buffer, [
          "DateTimeOriginal",
          "CreateDate",
          "OffsetTimeOriginal"
        ]);
        takenAt = normalizeExifDate(
          exifData?.DateTimeOriginal ||
          exifData?.CreateDate
        );
      } catch {
        takenAt = "";
      }
    }

    return {
      width: Number(metadata?.width) || 0,
      height: Number(metadata?.height) || 0,
      takenAt,
      imageHash: crypto.createHash("sha1").update(buffer).digest("hex"),
      fileSizeBytes: buffer.length
    };
  } catch {
    return {};
  }
}
