// Local-only Function server (dev). Injects in-memory fakes directly into the
// business handler, bypassing the deployment adapter, so the app can be
// exercised offline. Run: deno run --allow-net=127.0.0.1:8000 dev/function-local.ts
import { handleApp } from "../functions/handler.mjs";
import { createFakeSupabase } from "./fake-supabase.mjs";
import { createFakeStorage } from "./fake-storage.mjs";

const { client } = createFakeSupabase();
const store = createFakeStorage();

const UPLOAD = "/__local/upload/";
const DOWNLOAD = "/__local/download/";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname.startsWith(UPLOAD) && req.method === "PUT") {
    const path = decodeURIComponent(url.pathname.slice(UPLOAD.length));
    const bytes = new Uint8Array(await req.arrayBuffer());
    store.putObject(path, bytes, req.headers.get("content-type") ?? "application/octet-stream");
    return new Response(null, { status: 200 });
  }

  if (url.pathname.startsWith(DOWNLOAD) && req.method === "GET") {
    const path = decodeURIComponent(url.pathname.slice(DOWNLOAD.length));
    const obj = store.getObject(path);
    if (!obj) return new Response(null, { status: 404 });
    return new Response(obj.bytes, { headers: { "content-type": obj.contentType } });
  }

  if (url.pathname === "/functions/v1/app" || url.pathname.startsWith("/functions/v1/app/")) {
    return handleApp({ request: req, supabase: client, storage: store.storage });
  }

  return new Response("Not found", { status: 404 });
});
