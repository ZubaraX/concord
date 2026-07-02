import type { FastifyInstance } from "fastify";
import { pipeline } from "node:stream/promises";
import { createWriteStream, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { nanoid } from "nanoid";
import convertHeic from "heic-convert";
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

    let finalStored = stored;
    let finalName = data.filename;
    let finalMime = data.mimetype;

    // iPhone photos arrive as HEIC/HEIF, which browsers can't render — convert
    // to JPEG once here so every client (including old builds) just sees an
    // image. Non-fatal: on any failure the original file is kept as-is.
    const isHeic = /\.hei[cf]$/i.test(data.filename) || /image\/hei[cf]/i.test(data.mimetype);
    if (isHeic) {
      try {
        const jpeg = await convertHeic({ buffer: readFileSync(dest), format: "JPEG", quality: 0.87 });
        const jpgStored = stored.replace(/\.[^.]*$/, "") + ".jpg";
        writeFileSync(join(dir, jpgStored), jpeg);
        unlinkSync(dest);
        finalStored = jpgStored;
        finalName = data.filename.replace(/\.[^.]*$/, "") + ".jpg";
        finalMime = "image/jpeg";
      } catch (err) {
        req.log.warn({ err }, "HEIC conversion failed — keeping original");
      }
    }

    return reply.send({
      url: `/uploads/${finalStored}`,
      filename: finalName,
      size: statSync(join(dir, finalStored)).size,
      mimeType: finalMime,
    });
  });
}
