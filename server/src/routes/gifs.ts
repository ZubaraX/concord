import type { FastifyInstance } from "fastify";
import { authenticate } from "../lib/auth.js";
import { config } from "../config.js";

// Server-side GIF search proxy (Giphy), so the API key stays off the client.
export async function gifRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/search", async (req, reply) => {
    const { q } = req.query as { q?: string };
    const key = config.TENOR_KEY;
    const base = "https://g.tenor.com/v1";
    const common = `key=${key}&limit=24&media_filter=minimal&contentfilter=medium`;
    const url = q && q.trim()
      ? `${base}/search?${common}&q=${encodeURIComponent(q.trim())}`
      : `${base}/trending?${common}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return reply.send({ results: [] });
      const j = (await r.json()) as {
        results?: Array<{ id: string; media?: Array<{ gif?: { url?: string }; tinygif?: { url?: string } }> }>;
      };
      const results = (j.results ?? [])
        .map((g) => ({
          id: g.id,
          url: g.media?.[0]?.gif?.url,
          preview: g.media?.[0]?.tinygif?.url || g.media?.[0]?.gif?.url,
        }))
        .filter((x) => x.url);
      return reply.send({ results });
    } catch {
      return reply.send({ results: [] });
    }
  });
}
