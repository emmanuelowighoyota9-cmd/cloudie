/**
 * Template artwork.
 *
 * A customer can trace a file they already own — a scanned form, a letterhead,
 * a photographed invoice — into a reusable template. The page artwork is
 * resolved at render time from the template's artwork file, so layouts stay
 * small and the original bytes are never duplicated into the layout JSON.
 *
 * Everything here is browser-side: fetch → downscale → `data:` URL, which is
 * the only image form the SVG engine accepts.
 */

/** Longest edge the artwork is downscaled to before embedding. */
const MAX_EDGE = 1800;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the artwork file"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the artwork image"));
    img.src = src;
  });
}

/**
 * Fetch an image and return a `data:` URL suitable for the SVG engine.
 *
 * Large scans are downscaled and re-encoded, so an 8 MB photo does not turn
 * into a 10 MB SVG. Aspect ratio is always preserved.
 */
export async function artworkDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the artwork file");
  const blob = await response.blob();
  const original = await blobToDataUrl(blob);

  try {
    const img = await loadImage(original);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return original;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    if (scale >= 1) return original;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    // Undecodable here: the engine re-validates the data URL anyway, so fall
    // back to the raw bytes.
    return original;
  }
}

/** Pixel dimensions of an image, so a template page can match its shape. */
export async function imageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const img = await loadImage(dataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}
