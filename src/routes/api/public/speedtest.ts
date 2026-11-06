import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Teste de velocidade externo (nuvem). Exige login e licença com o teste liberado pelo administrador.
async function allowed(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth, apikey: key } },
  });
  const { data, error } = await sb.rpc("my_license");
  return !error && !!(data as any)?.speedtest;
}

let CHUNK_CACHE: Uint8Array<ArrayBuffer> | null = null;
function getChunk() {
  if (!CHUNK_CACHE) { const b = new Uint8Array(new ArrayBuffer(65536)); crypto.getRandomValues(b); CHUNK_CACHE = b; }
  return CHUNK_CACHE;
}
const noCache = { "Cache-Control": "no-store", "Content-Type": "application/octet-stream" };

export const Route = createFileRoute("/api/public/speedtest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await allowed(request))) return new Response("Forbidden", { status: 403 });
        const url = new URL(request.url);
        if (url.searchParams.get("ping")) return new Response(null, { status: 204, headers: noCache });
        const total = Math.min(Math.max(Number(url.searchParams.get("bytes")) || 0, 0), 50_000_000);
        let sent = 0;
        const CHUNK = getChunk();
        const stream = new ReadableStream({
          pull(c) {
            if (sent >= total) return c.close();
            const n = Math.min(CHUNK.length, total - sent);
            c.enqueue(n === CHUNK.length ? CHUNK : CHUNK.slice(0, n)); sent += n;
          },
        });
        return new Response(stream, { headers: { ...noCache, "Content-Length": String(total) } });
      },
      POST: async ({ request }) => {
        if (!(await allowed(request))) return new Response("Forbidden", { status: 403 });
        let size = 0; const r = request.body?.getReader();
        if (r) for (;;) { const { done, value } = await r.read(); if (done) break; size += value.length; if (size > 60_000_000) break; }
        return Response.json({ size }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
