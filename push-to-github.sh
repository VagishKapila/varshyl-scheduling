#!/bin/bash
# Run this once in Terminal to push to GitHub and set up Railway
# Usage: bash push-to-github.sh YOUR_GITHUB_TOKEN YOUR_DB_PASSWORD

GITHUB_TOKEN="${1:-}"
DB_PASSWORD="${2:-}"

if [ -z "$GITHUB_TOKEN" ]; then
  echo ""
  echo "Usage: bash push-to-github.sh GITHUB_TOKEN DB_PASSWORD"
  echo ""
  echo "Get a GitHub token at: https://github.com/settings/tokens"
  echo "  → Generate new token (classic) → check 'repo' scope"
  echo ""
  exit 1
fi

cd "$(dirname "$0")"

echo "▶ Pushing to GitHub..."
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/VagishKapila/varshyl-scheduling.git"
git push origin main
echo "✅ Code pushed to GitHub"

if [ -n "$DB_PASSWORD" ]; then
  echo ""
  echo "▶ Running DB migration..."
  DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@thomas.proxy.rlwy.net:40537/railway" \
    npx prisma migrate dev --name init
  echo ""
  echo "▶ Seeding template data..."
  DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@thomas.proxy.rlwy.net:40537/railway" \
    npx prisma db seed
  echo "✅ Database ready"
fi

echo ""
echo "✅ Done! Railway will auto-deploy from main branch."
echo ""
echo "Set these env vars in Railway dashboard:"
echo "  DATABASE_URL=postgresql://postgres:${DB_PASSWORD:-YOUR_PASSWORD}@postgres.railway.internal:5432/railway"
echo "  NEXTAUTH_SECRET=varshyl-scheduling-secret-$(date +%s)"
echo "  NEXTAUTH_URL=https://varshyl-scheduling-production.up.railway.app"
echo "  NODE_ENV=production"
echo ""
echo "Railway build cmd:  npx prisma generate && npm run build"
echo "Railway start cmd:  node .next/standalone/server.js"
