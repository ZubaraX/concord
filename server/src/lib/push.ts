// Self-hosted push for the Android app — no Google FCM. The phone runs a
// foreground service holding one SSE stream per device; DMs, @mentions and
// incoming calls are fanned out here. Delivery is best-effort: if no stream is
// connected the event is simply dropped (the in-app socket path still works).
import type { FastifyInstance, FastifyReply } from "fastify";
import { authenticate } from "./auth.js";

export interface PushEvent {
  type: "dm" | "mention" | "call";
  title: string; // notification title (usually the sender's name)
  body: string;
  channelId: string;
  guildId?: string | null;
}

// userId -> live SSE connections (a user may have several devices).
const streams = new Map<string, Set<FastifyReply>>();

export function pushToUser(userId: string, event: PushEvent) {
  const set = streams.get(userId);
  if (!set?.size) return;
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const reply of set) {
    try {
      reply.raw.write(frame);
    } catch {
      set.delete(reply);
    }
  }
}

export function registerPushRoutes(app: FastifyInstance) {
  // The 15-min access token can't keep a background stream alive, so the app
  // exchanges it for a long-lived token that is ONLY good for receiving one's
  // own notifications (scope-checked below).
  app.post("/api/push/token", { preHandler: [authenticate] }, async (req, reply) => {
    const token = await reply.jwtSign(
      { username: req.username, scope: "push" },
      { sign: { sub: req.userId, expiresIn: 180 * 24 * 3600 } }
    );
    return { token };
  });

  // EventSource/OkHttp can't set an Authorization header on a bare stream
  // request, so the token travels as a query parameter.
  app.get("/api/push/stream", async (req, reply) => {
    const { token } = req.query as { token?: string };
    let userId: string;
    try {
      if (!token) throw new Error("missing");
      const payload = app.jwt.verify<{ sub: string; scope?: string }>(token);
      if (payload.scope !== "push") throw new Error("wrong scope");
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no", // tell nginx not to buffer the stream
    });
    reply.raw.write(": connected\n\n");

    let set = streams.get(userId);
    if (!set) streams.set(userId, (set = new Set()));
    set.add(reply);

    // Heartbeat keeps NATs open and lets the phone detect dead links by
    // read-timeout (client reads with a ~75s timeout).
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      set!.delete(reply);
      if (set!.size === 0) streams.delete(userId);
    };
    req.raw.on("close", cleanup);
  });
}
