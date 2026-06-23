import type { FastifyInstance } from "fastify";
import { pipeline } from "node:stream/promises";
import { createWriteStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { nanoid } from "nanoid";
import { authenticate } from "../lib/auth.js";
import { config } from "../config.js";

// Streams uploads to local disk with NO size cap by default (MAX_UPLOAD_BYTES=0).
// Files are served back statically at /uploads/* (registered in index.ts).
export async function uploadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/upload", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "No file provided" });

    const dir = resolve(config.STORAGE_DIR);
    mkdirSync(dir, { recursive: true });

    const safeName = data.filename.replace(/[^\w.\-]+/g, "_").slice(-120);
    const stored = `${nanoid(12)}_${safeName}`;
    const dest = join(dir, stored);

    try {
      await pipeline(data.file, createWriteStream(dest));
    } catch {
      try { unlinkSync(dest); } catch {}
      return reply.code(500).send({ error: "Upload failed" });
    }

    // @fastify/multipart flags truncation if a configured limit was exceeded.
    if (data.file.truncated) {
      try { unlinkSync(dest); } catch {}
      return reply.code(413).send({ error: "File exceeds the configured size limit" });
    }

    return reply.send({
      url: `/uploads/${stored}`,
      filename: data.filename,
      size: statSync(dest).size,
      mimeType: data.mimetype,
    });
  });
}
