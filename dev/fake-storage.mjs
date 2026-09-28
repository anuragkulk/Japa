// Local-only in-memory Storage shim (dev). Signed URLs point at local routes
// served by dev/function-local.ts. Never deployed.

export function createFakeStorage() {
  const objects = new Map(); // path -> { bytes: Uint8Array, contentType: string }

  const storage = {
    async createSignedUploadUrl(path) {
      return { signedUrl: `/__local/upload/${encodeURIComponent(path)}` };
    },
    async createSignedUrl(path) {
      if (!objects.has(path)) throw new Error("object_missing");
      return { signedUrl: `/__local/download/${encodeURIComponent(path)}` };
    },
    async upload(path, bytes, opts = {}) {
      objects.set(path, { bytes: toBytes(bytes), contentType: opts.contentType ?? "application/octet-stream" });
      return {};
    },
    async download(path) {
      const obj = objects.get(path);
      if (!obj) return new Response(null, { status: 404 });
      return new Response(obj.bytes, { headers: { "content-type": obj.contentType } });
    },
    async remove(paths) {
      for (const p of paths) objects.delete(p);
      return {};
    },
    async list() {
      return [...objects.keys()].map((name) => ({ name }));
    },
  };

  return {
    storage,
    objects,
    // Used by the dev server to accept browser PUTs to a signed upload URL.
    putObject(path, bytes, contentType) {
      objects.set(path, { bytes: toBytes(bytes), contentType });
    },
    getObject(path) {
      return objects.get(path) ?? null;
    },
  };
}

function toBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (typeof bytes === "string") return new TextEncoder().encode(bytes);
  return new Uint8Array(bytes);
}
