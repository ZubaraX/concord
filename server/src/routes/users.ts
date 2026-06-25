import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";

// Public profile of any user (for the profile popout).
export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        discriminator: true,
        displayName: true,
        avatarUrl: true,
        bannerUrl: true,
        accentColor: true,
        bio: true,
        customStatus: true,
        pronouns: true,
        status: true,
        createdAt: true,
      },
    });
    if (!u) return reply.code(404).send({ error: "Not found" });
    return reply.send(u);
  });
}
