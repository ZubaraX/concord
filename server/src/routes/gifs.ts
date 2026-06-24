import type { FastifyInstance } from "fastify";
import { authenticate } from "../lib/auth.js";
import { config } from "../config.js";

// Server-side GIF search proxy (Tenor v2), so the API key stays off the client.
// Tenor v1 (g.tenor.com) was shut down by Google; v2 lives at
// tenor.googleapis.com and requires a real (free) Google API key — set it as
// TENOR_KEY in the server .env. Without a valid key the route returns an empty
// result set (the picker just shows "no results") instead of erroring.
export async function gifRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/search", async (req, reply) => {
    const { q } = req.query as { q?: string };
    const key = config.TENOR_KEY;
    if (!key) return reply.send({ results: [] });

    const base = "https://tenor.googleapis.com/v2";
    const common =
      `key=${encodeURIComponent(key)}&client_key=concord&limit=24` +
      `&media_filter=gif,tinygif&contentfilter=medium`;
    const url = q && q.trim()
      ? `${base}/search?${common}&q=${encodeURIComponent(q.trim())}`
      : `${base}/featured?${common}`;

    try {
      const r = await fetch(url);
      if (!r.ok) return reply.send({ results: [] });
      const j = (await r.json()) as {
        results?: Array<{
          id: string;
          media_formats?: {
            gif?: { url?: string };
            tinygif?: { url?: string };
          };
        }>;
      };
      const results = (j.results ?? [])
        .map((g) => ({
          id: g.id,
          url: g.media_formats?.gif?.url,
          preview: g.media_formats?.tinygif?.url || g.media_formats?.gif?.url,
        }))
        .filter((x) => x.url);
      return reply.send({ results });
    } catch {
      return reply.send({ results: [] });
    }
  });
}
