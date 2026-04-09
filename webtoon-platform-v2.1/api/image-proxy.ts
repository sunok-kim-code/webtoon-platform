// Vercel Serverless Function: /api/image-proxy
// CORS 차단된 외부 이미지를 프록시하여 다운로드
// 사용: GET /api/image-proxy?url=https://tempfile.aiquickdraw.com/...

import type { VercelRequest, VercelResponse } from "@vercel/node";

// 허용된 이미지 호스트 (보안)
const ALLOWED_HOSTS = [
  "tempfile.aiquickdraw.com",
  "aiquickdraw.com",
  "cdn.aiquickdraw.com",
  "kie.ai",
  "api.kie.ai",
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
  "cdn.photogenius.ai",
  "photogenius.ai",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // 호스트 검증
  try {
    const parsed = new URL(imageUrl);
    if (!ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
      return res.status(403).json({ error: `Host not allowed: ${parsed.hostname}` });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: { "User-Agent": "WebtoonPlatform/2.1 ImageProxy" },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.statusText}` });
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(buffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Proxy fetch failed" });
  }
}
