#!/usr/bin/env bash
# Concord — single-command bootstrap. No Docker, no external services:
# the database is a local SQLite file and presence is in-memory.
set -euo pipefail

cd "$(dirname "$0")"

echo "▶ Concord setup"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  • created .env from .env.example (edit secrets before going to prod)"
fi

echo "▶ Installing dependencies (npm workspaces)..."
npm install

echo "▶ Generating Prisma client + creating the local SQLite database..."
npm run db:generate
npm run db:migrate
npm run db:seed || echo "  • seed skipped (already seeded?)"

echo ""
echo "✅ Done."
echo "   • Run everything (web dev):     npm run dev"
echo "   • Run only the server:          npm run dev:server   (Codespaces: port 4000)"
echo "   • Build the desktop app:        npm run desktop:build --workspace client"
echo "   API → http://localhost:4000    Web client → http://localhost:5173"
