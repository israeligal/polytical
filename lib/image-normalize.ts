// Client-side image normalization for caricature avatars: center-crop to a
// square and downscale, so every avatar is a clean circle and the upload payload
// (a base64 data URL sent to the Server Action) stays small. The crop math is a
// pure function (unit-tested); the canvas wrapper is browser-only.

/** The largest centered square within a srcW×srcH image. Pure — unit-tested. */
export function coverSquareCrop({ srcW, srcH }: { srcW: number; srcH: number }): {
  sx: number;
  sy: number;
  size: number;
} {
  const size = Math.max(0, Math.min(srcW, srcH));
  return { sx: Math.floor((srcW - size) / 2), sy: Math.floor((srcH - size) / 2), size };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Reads an image File, center-crops it to a square, downscales to `target`px, and
 * returns a WebP data URL (PNG fallback on browsers without WebP canvas export).
 * Browser-only — uses `Image` + `<canvas>`.
 */
export async function fileToSquareDataUrl({
  file,
  target = 512,
}: {
  file: File;
  target?: number;
}): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { sx, sy, size } = coverSquareCrop({ srcW: img.naturalWidth, srcH: img.naturalHeight });
    if (size === 0) throw new Error("empty image");
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, sx, sy, size, size, 0, 0, target, target);
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
