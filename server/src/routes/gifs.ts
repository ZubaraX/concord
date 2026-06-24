import type { FastifyInstance } from "fastify";
import { authenticate } from "../lib/auth.js";
import { config } from "../config.js";

// Server-side GIF search proxy, so the API key stays off the client.
//
// Default provider is KLIPY (api.klipy.com) — a drop-in Tenor replacement built
// by ex-Tenor staff, with a free lifetime key from partner.klipy.com. Google
// shut down Tenor v1 and v2 needs a separate Google Cloud key, so KLIPY is the
// zero-friction path. Set KLIPY_KEY (preferred) or TENOR_KEY (Tenor v2) in the
// server .env. With neither set the route returns an empty result list so the
// picker degrades gracefully instead of erroring.

type GifResult = { id: string; url: string; preview: string };

// KLIPY nests media as file.{hd|md|sm|xs}.{gif|webp|mp4}.url. Pick the largest
// available animated URL for `url` and the smallest for the grid `preview`.
function pickKlipyUrls(file: any): { url?: string; preview?: string } {
  const sizes = ["hd", "md", "sm", "xs"];
  const fmts = ["gif", "webp"];
  const at = (size: string): string | undefined => {
    const node = file?.[size];
    for (const f of fmts) {
      const u = node?.[f]?.url;
      if (typeof u === "string") return u;
    }
    return undefined;
  };
  let url: string | undefined;
  for (const s of sizes) {
    url = at(s);
    if (url) break;
  }
  let preview: string | undefined;
  for (const s of [...sizes].reverse()) {
    preview = at(s);
    if (preview) break;
  }
  return { url, preview: preview || url };
}

async function searchKlipy(key: string, q: string, customerId: string): Promise<GifResult[]> {
  const base = `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs`;
  const params = `per_page=24&customer_id=${encodeURIComponent(customerId)}&rating=pg-13`;
  const url = q
    ? `${base}/search?${params}&q=${encodeURIComponent(q)}`
    : `${base}/trending?${params}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j: any = await r.json();
  const items: any[] = j?.data?.data ?? [];
  return items
    .map((it) => {
      const { url, preview } = pickKlipyUrls(it?.file);
      return { id: String(it?.id ?? it?.slug ?? ""), url: url ?? "", preview: preview ?? "" };
    })
    .filter((x) => x.url);
}

async function searchTenor(key: string, q: string): Promise<GifResult[]> {
  const base = "https://tenor.googleapis.com/v2";
  const common =
    `key=${encodeURIComponent(key)}&client_key=concord&limit=24` +
    `&media_filter=gif,tinygif&contentfilter=medium`;
  const url = q
    ? `${base}/search?${common}&q=${encodeURIComponent(q)}`
    : `${base}/featured?${common}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j?.results ?? [])
    .map((g: any) => ({
      id: String(g.id),
      url: g.media_formats?.gif?.url ?? "",
      preview: g.media_formats?.tinygif?.url || g.media_formats?.gif?.url || "",
    }))
    .filter((x: GifResult) => x.url);
}

export async function gifRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/search", async (req, reply) => {
    const { q } = req.query as { q?: string };
    const query = (q ?? "").trim();
    const customerId = req.userId || "concord";
    try {
      if (config.KLIPY_KEY) {
        return reply.send({ results: await searchKlipy(config.KLIPY_KEY, query, customerId) });
      }
      if (config.TENOR_KEY) {
        return reply.send({ results: await searchTenor(config.TENOR_KEY, query) });
      }
      return reply.send({ results: [] });
    } catch {
      return reply.send({ results: [] });
    }
  });
}
