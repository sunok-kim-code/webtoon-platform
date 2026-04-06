// Vercel serverless — Anthropic API proxy (CORS bypass, Node.js https module)
const https = require("https");

const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_PATH = "/v1/messages";
const ANTHROPIC_VER  = "2023-06-01";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch(e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

function httpsPost(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: ANTHROPIC_HOST,
      path: ANTHROPIC_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VER,
      },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", chunk => { d += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: { raw: d } }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-anthropic-key");

  if (req.method === "OPTIONS") { res.statusCode = 200; return res.end(); }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const apiKey = req.headers["x-anthropic-key"];
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "유효한 Anthropic API Key 필요 (sk-ant-...)" }));
  }

  const parsed = await readBody(req);
  const { system, messages, model = "claude-sonnet-4-6", max_tokens = 4096 } = parsed;
  if (!messages) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "messages 필드 필요" }));
  }

  try {
    const result = await httpsPost(apiKey, { model, system, messages, max_tokens });
    res.statusCode = result.status;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(result.body));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: e.message || "Anthropic 프록시 오류" }));
  }
};
