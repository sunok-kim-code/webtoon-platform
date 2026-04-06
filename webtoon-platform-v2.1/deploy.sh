#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT_DIR/packages/web/dist"
OUTPUT_STATIC="$ROOT_DIR/.vercel/output/static"

echo "🔨 Building web..."
cd "$ROOT_DIR/packages/web"
npm run build
cd "$ROOT_DIR"

echo "📦 Syncing dist → .vercel/output/static/..."
cp "$DIST/index.html" "$OUTPUT_STATIC/index.html"
cp -r "$DIST/assets/." "$OUTPUT_STATIC/assets/"

echo "🚀 Deploying to Vercel production..."
VERCEL_TOKEN=vcp_1XKBaKqFxom9hY1swW49Gz4946rg3dH2q5VRqzfPnLqVwz8Kdl0BuExa npx vercel deploy --prebuilt --prod

echo "✅ 배포 완료!"
