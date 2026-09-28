export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB (platform storage limit)
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
];

export function extensionFor(type: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
    "image/bmp": "bmp",
  };
  return map[type.toLowerCase()] ?? "img";
}

// Returns an error message, or null when the file is an acceptable image.
export function validateImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Only image files can be uploaded.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is too large (limit 10 MB).";
  return null;
}
