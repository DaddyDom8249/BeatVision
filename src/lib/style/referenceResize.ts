// Downscaled reference-image copies for image models with input size limits.
// Cloudflare Workers AI flux-2-klein-4b requires reference images smaller than
// 512x512, so a copy whose longest side is at most 511px is stored alongside
// the original upload. The original file is never modified or replaced.

export const REFERENCE_COPY_MAX_SIDE = 511;
export const REFERENCE_COPY_MIME = "image/png";

export type ReferenceSize = { width: number; height: number };

/** Target size fitting strictly under 512 on each side, preserving aspect ratio; null when no resize is needed. */
export function computeReferenceSize(width: number, height: number, maxSide = REFERENCE_COPY_MAX_SIDE): ReferenceSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (width <= maxSide && height <= maxSide) return null;
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.min(maxSide, Math.round(width * scale))),
    height: Math.max(1, Math.min(maxSide, Math.round(height * scale))),
  };
}

/** Deterministic storage path for the small copy, next to the original. */
export function referenceCopyPath(originalPath: string) {
  return `${originalPath}.ref${REFERENCE_COPY_MAX_SIDE}.png`;
}

/** Browser-only: decode an image file and return a downscaled PNG copy, or null if it already fits / cannot be decoded. */
export async function createReferenceCopy(file: Blob): Promise<{ blob: Blob; width: number; height: number; source_width: number; source_height: number } | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) return null;
  const bitmap = await createImageBitmap(file);
  try {
    const size = computeReferenceSize(bitmap.width, bitmap.height);
    if (!size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, REFERENCE_COPY_MIME));
    if (!blob) return null;
    return { blob, ...size, source_width: bitmap.width, source_height: bitmap.height };
  } finally {
    bitmap.close?.();
  }
}
