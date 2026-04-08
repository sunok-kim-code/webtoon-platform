// Vercel Serverless Function: /api/image-upload
// 이미지를 서버에서 GCS(Firebase Storage)에 업로드
// POST /api/image-upload  Body: { imageUrl, storagePath }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const DEFAULT_BUCKET = "rhivclass.firebasestorage.app";

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
  const signInput = `${encode(header)}.${encode(payload)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(privateKey, "base64url");
  return `${signInput}.${signature}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    console.log("[image-upload] Request received, body type:", typeof req.body);

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const imageUrl = body?.imageUrl;
    const imageBase64 = body?.imageBase64;
    const storagePath = body?.storagePath;
    const contentType = body?.contentType || "image/png";

    if (!storagePath || (!imageUrl && !imageBase64)) {
      console.log("[image-upload] Missing params:", { imageUrl: !!imageUrl, imageBase64: !!imageBase64, storagePath: !!storagePath });
      return res.status(400).json({ error: "Missing storagePath and (imageUrl or imageBase64)" });
    }

    let imgBuffer: Buffer;

    if (imageBase64) {
      // base64 데이터 직접 수신 (CORS 우회)
      imgBuffer = Buffer.from(imageBase64, "base64");
      console.log("[image-upload] Base64 image received:", imgBuffer.length, "bytes");
    } else {
      // URL에서 다운로드 시도
      console.log("[image-upload] Downloading image:", imageUrl!.substring(0, 80));
      const imgRes = await fetch(imageUrl!, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "image/*,*/*",
        },
      });
      if (!imgRes.ok) {
        const errMsg = `Image fetch failed (${imgRes.status})`;
        console.error("[image-upload]", errMsg);
        return res.status(502).json({ error: errMsg });
      }
      const imgArrayBuffer = await imgRes.arrayBuffer();
      imgBuffer = Buffer.from(imgArrayBuffer);
      console.log("[image-upload] Image downloaded:", imgBuffer.length, "bytes");
    }

    // 2) Access Token 발급
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || "";
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
    if (!clientEmail || !privateKey) {
      console.error("[image-upload] Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY");
      return res.status(500).json({ error: "Service account not configured" });
    }
    privateKey = privateKey.replace(/\\n/g, "\n");

    const jwt = createJWT(clientEmail, privateKey);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[image-upload] Token exchange failed:", errText.substring(0, 200));
      return res.status(500).json({ error: "Token exchange failed" });
    }
    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log("[image-upload] Token acquired");

    // 3) GCS 업로드
    const bucket = process.env.GCS_BUCKET || DEFAULT_BUCKET;
    const encodedPath = encodeURIComponent(storagePath);
    const gcsUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

    // 다운로드 토큰 생성 (Firebase Storage 호환)
    const downloadToken = crypto.randomUUID();

    const uploadRes = await fetch(gcsUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Authorization": `Bearer ${accessToken}`,
        // Firebase Storage 다운로드 토큰을 메타데이터로 설정
        "x-goog-meta-firebaseStorageDownloadTokens": downloadToken,
      },
      body: imgBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("[image-upload] GCS upload failed:", errText.substring(0, 300));
      return res.status(502).json({ error: `GCS upload failed (${uploadRes.status}): ${errText.substring(0, 200)}` });
    }

    console.log("[image-upload] GCS upload success:", storagePath);

    // 다운로드 토큰 포함 URL (인증 없이 접근 가능)
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    return res.status(200).json({ url: downloadUrl });

  } catch (err: any) {
    console.error("[image-upload] Unhandled error:", err?.message || err, err?.stack?.substring(0, 500));
    return res.status(500).json({ error: err?.message || "Upload failed" });
  }
}
