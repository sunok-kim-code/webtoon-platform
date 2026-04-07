// Vercel Serverless Function: /api/image-upload
// 이미지를 서버에서 GCS(Firebase Storage)에 업로드
// 클라이언트의 Firebase Auth/Storage 권한 문제를 완전히 우회
//
// POST /api/image-upload
//   Body: { imageUrl: string, storagePath: string }
//   또는 multipart form: file + storagePath
//
// 필요 환경변수: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GCS_BUCKET (optional)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const DEFAULT_BUCKET = "rhivclass.firebasestorage.app";

// ── vertex-token.ts와 동일한 JWT/토큰 로직 ──
function createJWT(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signInput = `${headerB64}.${payloadB64}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(privateKey, "base64url");
  return `${signInput}.${signature}`;
}

let _cachedToken = "";
let _tokenExpiry = 0;

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _tokenExpiry > now + 60_000) return _cachedToken;

  const jwt = createJWT(clientEmail, privateKey);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }
  const data = await tokenRes.json();
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in || 3600) * 1000;
  return _cachedToken;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    return res.status(500).json({ error: "Service account not configured" });
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  try {
    const { imageUrl, storagePath } = req.body || {};
    if (!imageUrl || !storagePath) {
      return res.status(400).json({ error: "Missing imageUrl or storagePath" });
    }

    // 1) 이미지 다운로드 (서버 → 서버, CORS 없음)
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "WebtoonPlatform/2.1 ImageUploader" },
    });
    if (!imgRes.ok) {
      return res.status(502).json({ error: `Image fetch failed (${imgRes.status}): ${imgRes.statusText}` });
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";

    // 2) GCS 업로드
    const accessToken = await getAccessToken(clientEmail, privateKey);
    const bucket = process.env.GCS_BUCKET || DEFAULT_BUCKET;
    const encodedPath = encodeURIComponent(storagePath);
    const gcsUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

    const uploadRes = await fetch(gcsUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Authorization": `Bearer ${accessToken}`,
      },
      body: imgBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(502).json({ error: `GCS upload failed (${uploadRes.status}): ${errText.substring(0, 300)}` });
    }

    // 3) 다운로드 URL 반환
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;

    return res.status(200).json({ url: downloadUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
}
