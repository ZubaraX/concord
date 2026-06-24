import type { FastifyInstance } from "fastify";
import { authenticate } from "../lib/auth.js";
import { config } from "../config.js";

// Server-side GIF search proxy (Giphy), so the API key stays off the client.
export async function gifRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/search", async (req, reply) => {
    const { q } = req.query as { q?: string };
    const key = config.GIPHY_KEY;
    const base = "https://api.giphy.com/v1/gifs";
    const url = q && q.trim()
      ? `${base}/search?api_key=${key}&limit=24&rating=pg-13&q=${encodeURIComponent(q.trim())}`
      : `${base}/trending?api_key=${key}&limit=24&rating=pg-13`;
    try {
      const r = await fetch(url);
      if (!r.ok) return reply.send({ results: [] });
      const j = (await r.json()) as { data?: Array<{ id: string; images?: Record<string, { url?: string }> }> };
      const results = (j.data ?? [])
        .map((g) => ({
          id: g.id,
          url: g.images?.original?.url,
          preview: g.images?.fixed_width_downsampled?.url || g.images?.fixed_height_small?.url || g.images?.original?.url,
        }))
        .filter((x) => x.url);
      return reply.send({ results });
    } catch {
      return reply.send({ results: [] });
    }
  });
}
