// Vercel Serverless Function: /api/ninjachat-images
// NinjaChat API 프록시 — CORS 이슈 우회 + API 키 서버사이드 처리
// 사용: POST /api/ninjachat-images { prompt, model, image?, _apiKey }
// NinjaChat API docs: https://docs.ninjachat.ai

import type { VercelRequest, VercelResponse } from "@vercel/node";

const NINJACHAT_API_URL = "https://ninjachat.ai/api/v1/images";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, model, image, _apiKey } = req.body || {};

    // API 키: 요청 본문의 _apiKey 또는 헤더의 X-Api-Key
    const apiKey = _apiKey || req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "NinjaChat API 키가 필요합니다." });
    }

    const body: Record<string, unknown> = {
      prompt: (prompt || "").substring(0, 4000),
      model: model || "google-imagen-4",
    };

    // 레퍼런스 이미지 (image-to-image)
    if (image) {
      body.image = image;
    }

    console.log(`[NinjaChat Proxy] model=${body.model}, has_ref=${!!image}`);

    const upstream = await fetch(NINJACHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error(`[NinjaChat Proxy] Error ${upstream.status}: ${errText.substring(0, 500)}`);
      return res.status(upstream.status).json({
        error: `NinjaChat API error (${upstream.status})`,
        detail: errText.substring(0, 300),
      });
    }

    const data = await upstream.json();
    // NinjaChat 응답: { images: [{ url: "..." }] }
    return res.status(200).json(data);
  } catch (err: any) {
    console.error("[NinjaChat Proxy] Error:", err.message);
    return res.status(500).json({ error: err.message || "NinjaChat proxy failed" });
  }
}
