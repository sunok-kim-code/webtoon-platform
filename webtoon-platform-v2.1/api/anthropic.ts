// Vercel serverless function — Anthropic API proxy
// CORS를 우회하기 위해 서버 사이드에서 api.anthropic.com 호출

import type { VercelRequest, VercelResponse } from "@vercel/node";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VER = "2023-06-01";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 허용 (배포 도메인)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-anthropic-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers["x-anthropic-key"] as string;
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return res.status(401).json({ error: "유효한 Anthropic API Key가 필요합니다 (sk-ant-...)" });
  }

  const { system, messages, model = "claude-sonnet-4-6", max_tokens = 4096 } = req.body || {};

  if (!messages) {
    return res.status(400).json({ error: "messages 필드가 필요합니다" });
  }

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VER,
      },
      body: JSON.stringify({ model, system, messages, max_tokens }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Anthropic 프록시 오류" });
  }
}
