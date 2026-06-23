// Seed a demo user + guild so the app shows something on first run.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_EVERYONE_PERMISSIONS, ALL_PERMISSIONS } from "../src/lib/permissions.js";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@concord.dev";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed user already exists — skipping.");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      username: "demo",
      discriminator: "0001",
      displayName: "Demo User",
      passwordHash: await bcrypt.hash("password123", 12),
      status: "ONLINE",
    },
  });

  const guild = await prisma.guild.create({
    data: {
      name: "Concord HQ",
      ownerId: user.id,
      description: "Welcome to your self-hosted, no-limits Concord server.",
      roles: {
        create: [
          { name: "@everyone", isDefault: true, position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS.toString() },
          { name: "Owner", color: "#f1c40f", position: 1, hoist: true, permissions: ALL_PERMISSIONS.toString() },
        ],
      },
      channels: {
        create: [
          { name: "Text Channels", type: "CATEGORY", position: 0 },
          { name: "general", type: "TEXT", position: 1, topic: "First channel — say hi!" },
          { name: "off-topic", type: "TEXT", position: 2 },
          { name: "Voice Channels", type: "CATEGORY", position: 3 },
          { name: "General", type: "VOICE", position: 4, bitrate: 256000 },
        ],
      },
    },
    include: { roles: true, channels: true },
  });

  const ownerRole = guild.roles.find((r) => r.name === "Owner")!;
  await prisma.guildMember.create({
    data: { guildId: guild.id, userId: user.id, roles: { connect: { id: ownerRole.id } } },
  });

  const general = guild.channels.find((c) => c.name === "general")!;
  await prisma.message.create({
    data: {
      channelId: general.id,
      authorId: user.id,
      content: "Welcome to **Concord** — a Discord clone with no artificial limits. 🎉",
    },
  });

  console.log("✅ Seeded demo user (demo@concord.dev / password123) and 'Concord HQ' guild.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
