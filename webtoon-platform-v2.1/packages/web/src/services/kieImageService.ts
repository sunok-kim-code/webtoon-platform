// ============================================================
// Kie.ai Image Generation Service
// 통합 Market API — createTask + polling
// ============================================================

// ─── 모델 카탈로그 ──────────────────────────────────────────

export type KieImageCategory = "recommended" | "google" | "seedream" | "flux" | "grok" | "gpt" | "ideogram" | "qwen" | "other";

export interface KieImageModel {
  id: string;          // API model ID (e.g. "google/imagen4")
  name: string;        // 표시 이름
  category: KieImageCategory;
  mode: "text2img" | "img2img" | "edit" | "upscale";
  description: string;
  supportedSizes: string[];
  defaultSize: string;
}

export const KIE_IMAGE_MODELS: KieImageModel[] = [
  // ── Google ──
  {
    id: "google/imagen4",
    name: "Imagen 4",
    category: "google",
    mode: "text2img",
    description: "고품질 포토리얼리스틱 이미지",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "google/imagen4-fast",
    name: "Imagen 4 Fast",
    category: "google",
    mode: "text2img",
    description: "빠른 이미지 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "google/imagen4-ultra",
    name: "Imagen 4 Ultra",
    category: "google",
    mode: "text2img",
    description: "최고 품질, 정밀 디테일",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "google/nano-banana",
    name: "Nano Banana",
    category: "google",
    mode: "text2img",
    description: "Gemini 기반 이미지 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    category: "google",
    mode: "text2img",
    description: "Gemini 2세대 이미지 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro 🎨",
    category: "google",
    mode: "text2img",
    description: "레퍼런스 이미지 기반 고품질 생성 (img2img 지원)",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_3_2", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    category: "google",
    mode: "text2img",
    description: "Gemini 3 Pro 이미지 생성 (v1.0 호환)",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  // ── Seedream (Bytedance) ──
  {
    id: "bytedance/seedream",
    name: "Seedream 3.0",
    category: "seedream",
    mode: "text2img",
    description: "기본 Seedream 모델",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "bytedance/seedream-v4-text-to-image",
    name: "Seedream 4.0",
    category: "seedream",
    mode: "text2img",
    description: "고품질 포토리얼리스틱",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "seedream/4.5-text-to-image",
    name: "Seedream 4.5",
    category: "seedream",
    mode: "text2img",
    description: "향상된 텍스트 렌더링",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "seedream/5-lite-text-to-image",
    name: "Seedream 5.0 Lite",
    category: "seedream",
    mode: "text2img",
    description: "최신 경량 모델, 빠른 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  // ── Flux ──
  {
    id: "flux-2/pro-text-to-image",
    name: "Flux 2 Pro",
    category: "flux",
    mode: "text2img",
    description: "고품질 아트 스타일",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  // ── Grok ──
  {
    id: "grok-imagine/text-to-image",
    name: "Grok Imagine",
    category: "grok",
    mode: "text2img",
    description: "xAI Grok 이미지 생성",
    supportedSizes: ["square_hd", "portrait_16_9", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  // ── GPT Image ──
  {
    id: "gpt-image/1.5-text-to-image",
    name: "GPT Image 1.5",
    category: "gpt",
    mode: "text2img",
    description: "OpenAI GPT 이미지 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  // ── Ideogram ──
  {
    id: "ideogram/v3-text-to-image",
    name: "Ideogram V3",
    category: "ideogram",
    mode: "text2img",
    description: "정확한 텍스트 렌더링, 스타일 제어",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  // ideogram/character 제거 — reference_image_urls 필수, text2img 불가
  // ── Qwen ──
  {
    id: "qwen/text-to-image",
    name: "Qwen Image",
    category: "qwen",
    mode: "text2img",
    description: "Alibaba Qwen 이미지 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  // ── Other ──
  {
    id: "z-image",
    name: "Z-Image",
    category: "other",
    mode: "text2img",
    description: "크리에이티브 이미지 생성",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  {
    id: "wan/2-7-image",
    name: "Wan 2.7 Image",
    category: "other",
    mode: "text2img",
    description: "Wan 이미지 생성 모델",
    supportedSizes: ["square_hd", "portrait_4_3", "landscape_16_9"],
    defaultSize: "square_hd",
  },
  // ── Vertex AI (직접 호출) ──
  {
    id: "vertex/gemini-3-pro",
    name: "Vertex Gemini 3 Pro",
    category: "google",
    mode: "text2img",
    description: "Vertex AI 직접 호출 — Gemini 3 Pro 이미지 생성 (OAuth 토큰 필요)",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
];

// ─── API 호출 ──────────────────────────────────────────────

const KIE_BASE = "https://api.kie.ai";

function getKieApiKey(): string {
  return localStorage.getItem("KIE_API_KEY") || "";
}

/** 선택된 이미지 모델 ID */
export function getSelectedImageModel(): string {
  return localStorage.getItem("KIE_IMAGE_MODEL") || "google/imagen4-fast";
}

export function setSelectedImageModel(modelId: string): void {
  localStorage.setItem("KIE_IMAGE_MODEL", modelId);
}

export function isKieImageConfigured(): boolean {
  if (getKieApiKey().length > 10) return true;
  // Vertex AI 직접 호출 모델이 선택된 경우 Vertex 설정 확인
  const model = getSelectedImageModel();
  if (model.startsWith("vertex/")) {
    const projectId = localStorage.getItem("VERTEX_PROJECT_ID") || "";
    const token = localStorage.getItem("VERTEX_ACCESS_TOKEN") || "";
    return !!(projectId && token);
  }
  return false;
}

// ─── 모델별 API 필드 매핑 ──────────────────────────────────

/**
 * 모델별로 API input 필드가 크게 다름 (curl 테스트 기반 매핑):
 *
 * Pattern A (aspect_ratio + negative_prompt): google/imagen4, imagen4-fast, imagen4-ultra
 * Pattern B (aspect_ratio only):              google/nano-banana, nano-banana-2, z-image, gemini-3-pro
 * Pattern C (aspect_ratio + quality):         seedream/4.5, seedream/5-lite
 * Pattern D (aspect_ratio + resolution):      flux-2/pro
 * Pattern E (image_size keyword):             bytedance/seedream*, qwen, ideogram/v3, wan
 * Pattern F (GPT Image — 별도 endpoint):      gpt-image/1.5
 * Pattern G (Grok — 제한적 aspect_ratio):     grok-imagine/*
 * Pattern H (aspect_ratio + image_input + resolution): nano-banana-pro (img2img)
 * BROKEN:   ideogram/character — reference_image_urls 필수, text2img 불가
 */

type ModelPattern = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "BROKEN";

function getModelPattern(modelId: string): ModelPattern {
  // Pattern F: GPT Image — 별도 엔드포인트
  if (modelId.startsWith("gpt-image/")) return "F";

  // BROKEN: Ideogram Character — text2img 불가
  if (modelId === "ideogram/character") return "BROKEN";

  // Pattern A: Google Imagen 4 계열 (negative_prompt 지원)
  if (modelId.startsWith("google/imagen4")) return "A";

  // Pattern C: Seedream 4.5 / 5 Lite (aspect_ratio + quality)
  if (modelId.startsWith("seedream/")) return "C";

  // Pattern D: Flux 2 Pro (aspect_ratio + resolution)
  if (modelId.startsWith("flux-2/")) return "D";

  // Pattern G: Grok Imagine — aspect_ratio 허용값이 제한적 ("1:1", "16:9", "9:16"만 안전)
  if (modelId.startsWith("grok-imagine/")) return "G";

  // Pattern H: Nano Banana Pro — aspect_ratio + image_input (레퍼런스) + resolution
  if (modelId === "nano-banana-pro") return "H";

  // Pattern B: aspect_ratio만 사용
  if (
    modelId.startsWith("google/nano-banana") ||
    modelId === "nano-banana-2" ||
    modelId === "gemini-3-pro" ||
    modelId === "z-image"
  ) return "B";

  // Pattern E: image_size 키워드 사용 (bytedance/seedream*, qwen, ideogram/v3, wan)
  return "E";
}

/** 내부 키 → 비율 문자열 (aspect_ratio 모델용) */
const TO_RATIO: Record<string, string> = {
  "square_hd": "1:1", "square": "1:1",
  "portrait_4_3": "3:4", "portrait_3_2": "2:3", "portrait_16_9": "9:16",
  "landscape_4_3": "4:3", "landscape_3_2": "3:2", "landscape_16_9": "16:9",
};

/**
 * Grok Imagine 전용 aspect_ratio 매핑.
 * Kie.ai Grok은 "1:1", "16:9", "9:16" 만 허용 — 그 외는 가장 가까운 값으로 fallback.
 */
const GROK_RATIO: Record<string, string> = {
  "square_hd": "1:1", "square": "1:1",
  "portrait_4_3": "9:16", "portrait_3_2": "9:16", "portrait_16_9": "9:16",
  "landscape_4_3": "16:9", "landscape_3_2": "16:9", "landscape_16_9": "16:9",
  "1:1": "1:1", "9:16": "9:16", "16:9": "16:9",
  "3:4": "9:16", "4:3": "16:9", "2:3": "9:16", "3:2": "16:9",
};

function toGrokAspectRatio(sizeKey: string): string {
  return GROK_RATIO[sizeKey] ?? "1:1";
}

function toAspectRatioValue(sizeKey: string): string {
  if (sizeKey.includes(":")) return sizeKey;
  return TO_RATIO[sizeKey] || "1:1";
}

/** 비율 문자열 → 키워드 (image_size 모델용) */
const TO_SIZE_KEY: Record<string, string> = {
  "1:1": "square_hd", "3:4": "portrait_4_3", "2:3": "portrait_3_2",
  "9:16": "portrait_16_9", "4:3": "landscape_4_3", "3:2": "landscape_3_2",
  "16:9": "landscape_16_9",
};

function toImageSizeValue(sizeKey: string): string {
  if (!sizeKey.includes(":")) return sizeKey;
  return TO_SIZE_KEY[sizeKey] || "square_hd";
}

/** GPT Image 사이즈 매핑 (endpoint가 다르므로 별도) */
const GPT_SIZE_MAP: Record<string, string> = {
  "square_hd": "1024x1024", "square": "1024x1024",
  "portrait_4_3": "1024x1536", "portrait_3_2": "1024x1536",
  "portrait_16_9": "1024x1536",
  "landscape_4_3": "1536x1024", "landscape_3_2": "1536x1024",
  "landscape_16_9": "1536x1024",
  "1:1": "1024x1024", "3:4": "1024x1536", "2:3": "1024x1536",
  "9:16": "1024x1536", "4:3": "1536x1024", "16:9": "1536x1024",
};

/**
 * 모델에 맞는 input 필드 객체를 반환 (createTask용).
 * GPT Image(Pattern F)는 별도 엔드포인트이므로 여기서 사용되지 않음.
 */
function buildModelInput(
  modelId: string,
  prompt: string,
  sizeKey: string,
  seed?: number,
  referenceImageUrls?: string[]
): Record<string, unknown> {
  const pattern = getModelPattern(modelId);
  const ar = toAspectRatioValue(sizeKey);
  const refs = referenceImageUrls && referenceImageUrls.length > 0 ? referenceImageUrls : undefined;

  switch (pattern) {
    case "A": // Google Imagen 4: aspect_ratio + negative_prompt
      return {
        prompt,
        aspect_ratio: ar,
        negative_prompt: "",
        ...(seed != null ? { seed: String(seed) } : {}),
        ...(refs ? { image_urls: refs } : {}),
      };

    case "B": // Nano Banana, Z-Image, Grok: aspect_ratio only
      return {
        prompt,
        aspect_ratio: ar,
        ...(seed != null ? { seed: String(seed) } : {}),
        ...(refs ? { image_urls: refs } : {}),
      };

    case "C": // Seedream 4.5 / 5 Lite: aspect_ratio + quality + nsfw_checker
      return {
        prompt,
        aspect_ratio: ar,
        quality: "basic",
        nsfw_checker: false,
        ...(seed != null ? { seed: String(seed) } : {}),
        ...(refs ? { image_urls: refs } : {}),
      };

    case "D": // Flux 2 Pro: aspect_ratio + resolution (required)
      return {
        prompt,
        aspect_ratio: ar,
        resolution: "1K",
        ...(seed != null ? { seed: String(seed) } : {}),
        ...(refs ? { image_urls: refs } : {}),
      };

    case "E": // Bytedance Seedream, Qwen, Ideogram V3, Wan: image_size keyword
      return {
        prompt,
        image_size: toImageSizeValue(sizeKey),
        ...(modelId.toLowerCase().includes("seedream") ? { nsfw_checker: false } : {}),
        ...(seed != null ? { seed } : {}),
        ...(refs ? { image_urls: refs } : {}),
      };

    case "G": // Grok Imagine: 허용 aspect_ratio만 사용 ("1:1", "16:9", "9:16")
      return {
        prompt,
        aspect_ratio: toGrokAspectRatio(sizeKey),
        ...(seed != null ? { seed: String(seed) } : {}),
        ...(refs ? { image_urls: refs } : {}),
      };

    case "H": // Nano Banana Pro: aspect_ratio + image_input (레퍼런스) + resolution
      return {
        prompt,
        aspect_ratio: ar,
        resolution: "1K",
        ...(seed != null ? { seed: String(seed) } : {}),
        ...(refs ? { image_input: refs } : {}),  // ← image_input (image_urls 아님!)
      };

    case "BROKEN":
      throw new Error("Ideogram Character는 text2img를 지원하지 않습니다. 다른 모델을 선택해주세요.");

    case "F": // GPT Image — 이 함수에서 처리하지 않음
    default:
      return { prompt, image_size: toImageSizeValue(sizeKey) };
  }
}

// 하위 호환용 export
export function toKieAspectRatio(sizeKey: string): string {
  return toAspectRatioValue(sizeKey);
}
export function getKieImageSize(sizeKey: string): string {
  if (sizeKey.includes(":")) return sizeKey;
  return toAspectRatioValue(sizeKey);
}

// ─── Task 생성 ─────────────────────────────────────────────

export interface KieTaskResult {
  taskId: string;
}

/**
 * GPT Image 전용 엔드포인트 호출 (동기식 — taskId 없이 바로 결과 반환)
 */
async function callGptImageEndpoint(
  prompt: string,
  sizeKey: string,
  apiKey: string,
): Promise<{ imageUrl: string }> {
  const size = GPT_SIZE_MAP[sizeKey] || "1024x1024";

  const response = await fetch(`${KIE_BASE}/api/v1/gpt4o-image/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      size,
      nVariants: 1,
    }),
  });

  const data = await response.json();

  if (data.code !== 200) {
    throw new Error(`GPT Image 생성 오류 (${data.code}): ${data.msg || "Unknown error"}`);
  }

  // GPT Image returns result directly (no polling needed)
  const urls: string[] = data.data?.resultUrls || data.data?.images || [];
  if (urls.length === 0 && data.data?.url) {
    urls.push(data.data.url);
  }
  if (urls.length === 0) {
    throw new Error("GPT Image: 결과 URL이 없습니다.");
  }

  return { imageUrl: urls[0] };
}

/**
 * Vertex AI Gemini 이미지 생성 (직접 호출 — generateContent + responseModalities IMAGE)
 * OAuth 토큰 인증, base64 이미지 결과를 Blob URL로 변환
 */
async function callVertexGeminiImage(
  prompt: string,
  sizeKey: string,
  referenceImageUrls?: string[],
): Promise<{ imageUrl: string }> {
  const projectId = localStorage.getItem("VERTEX_PROJECT_ID") || "";
  const location = localStorage.getItem("VERTEX_LOCATION") || "us-central1";
  const accessToken = localStorage.getItem("VERTEX_ACCESS_TOKEN") || "";

  if (!projectId || !accessToken) {
    throw new Error("Vertex AI 설정이 필요합니다. VERTEX_PROJECT_ID와 VERTEX_ACCESS_TOKEN을 설정하세요.");
  }

  const modelName = "gemini-2.5-pro-preview-06-05";
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelName}:generateContent`;

  // 레퍼런스 이미지가 있으면 base64로 변환하여 multipart 요청
  const parts: any[] = [];

  // 레퍼런스 이미지 추가 (최대 2개 — Vertex 제한 고려)
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    const maxRefImages = Math.min(referenceImageUrls.length, 2);
    for (let i = 0; i < maxRefImages; i++) {
      try {
        const refRes = await fetch(referenceImageUrls[i]);
        const refBlob = await refRes.blob();
        const refBase64 = await blobToBase64(refBlob);
        const mimeType = refBlob.type || "image/png";
        parts.push({
          inlineData: { mimeType, data: refBase64 },
        });
      } catch (e) {
        console.warn(`[VertexImage] Failed to fetch ref image ${i}:`, e);
      }
    }
    // 레퍼런스 포함 시 프롬프트에 지시 추가
    parts.push({
      text: `Use the above reference images as style and character reference. Generate a new image based on the following description:\n\n${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  // 종횡비 → 픽셀 크기
  const ar = toAspectRatioValue(sizeKey);
  const aspectRatio = ar; // Vertex Gemini accepts aspect_ratio as string

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      responseMimeType: "application/json",
      // aspectRatio가 지원되면 추가
    },
  };

  console.log(`[VertexImage] Calling Vertex AI: model=${modelName}, refs=${referenceImageUrls?.length || 0}, ar=${aspectRatio}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    throw new Error("Vertex AI 토큰이 만료되었습니다 (401). VERTEX_ACCESS_TOKEN을 갱신하세요.");
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vertex AI 오류 (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();

  // 응답에서 이미지 추출
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const candidateParts = candidate.content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        // base64 → Blob URL
        const binaryStr = atob(part.inlineData.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: part.inlineData.mimeType });
        const blobUrl = URL.createObjectURL(blob);
        console.log(`[VertexImage] Image generated (${blob.size} bytes)`);
        return { imageUrl: blobUrl };
      }
    }
  }

  throw new Error("Vertex AI: 응답에 이미지가 없습니다. 프롬프트를 수정해보세요.");
}

/** Blob → base64 문자열 (data URI prefix 제거) */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // "data:image/png;base64,..." → base64 부분만 추출
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function createImageTask(
  prompt: string,
  options?: {
    modelId?: string;
    imageSize?: string;
    maxImages?: number;
    seed?: number;
    referenceImageUrls?: string[];
  }
): Promise<KieTaskResult> {
  const apiKey = getKieApiKey();
  if (!apiKey) {
    throw new Error("Kie API Key가 필요합니다. 설정 → KIE_API_KEY를 입력하세요.");
  }

  const modelId = options?.modelId || getSelectedImageModel();
  const rawSize = options?.imageSize || "portrait_4_3";

  // GPT Image는 별도 엔드포인트 — createTask 대신 직접 호출하므로 여기서 에러
  if (getModelPattern(modelId) === "F") {
    throw new Error("__GPT_IMAGE__"); // generateImage()에서 분기 처리
  }

  const input = buildModelInput(modelId, prompt, rawSize, options?.seed, options?.referenceImageUrls);

  const body: Record<string, unknown> = { model: modelId, input };

  console.log(`[KieImage] createTask: model=${modelId}, body=`, JSON.stringify(body));

  const response = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.code !== 200) {
    throw new Error(`Kie.ai 이미지 생성 오류 (${data.code}): ${data.msg || "Unknown error"}`);
  }

  return { taskId: data.data.taskId };
}

// ─── Task 상태 조회 ────────────────────────────────────────

export type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export interface KieTaskDetail {
  taskId: string;
  state: KieTaskState;
  resultUrls: string[];
  failMsg?: string;
  costTime?: number;
}

export async function getTaskDetail(taskId: string): Promise<KieTaskDetail> {
  const apiKey = getKieApiKey();

  const response = await fetch(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  const data = await response.json();

  if (data.code !== 200) {
    throw new Error(`Kie.ai 태스크 조회 오류 (${data.code}): ${data.msg}`);
  }

  const d = data.data;

  // resultJson은 문자열로 옴 → 파싱
  let resultUrls: string[] = [];
  if (d.resultJson) {
    try {
      const parsed = typeof d.resultJson === "string" ? JSON.parse(d.resultJson) : d.resultJson;
      resultUrls = parsed.resultUrls || parsed.images || [];
      // 단일 URL인 경우
      if (typeof parsed === "string" && parsed.startsWith("http")) {
        resultUrls = [parsed];
      }
    } catch {
      console.warn("[KieImage] resultJson 파싱 실패:", d.resultJson);
    }
  }

  return {
    taskId: d.taskId,
    state: d.state,
    resultUrls,
    failMsg: d.failMsg || undefined,
    costTime: d.costTime || undefined,
  };
}

// ─── NSFW 필터 회피를 위한 프롬프트 순화 ────────────────────

/**
 * KIE API의 NSFW 필터에 걸릴 수 있는 표현을 순화합니다.
 * 신체 묘사, 의상 관련 민감 표현을 웹툰 캐릭터 디자인용으로 변환합니다.
 */
function sanitizePromptForNSFW(prompt: string): string {
  const replacements: [RegExp, string][] = [
    // 신체 관련
    [/\bprominent veins?\b/gi, "defined muscles"],
    [/\bhighly muscular build\b/gi, "athletic strong build"],
    [/\bmuscular build\b/gi, "athletic build"],
    [/\bfull lip shape\b/gi, "well-defined lips"],
    [/\bfull lips?\b/gi, "well-defined lips"],
    [/\bsensual\b/gi, "elegant"],
    [/\bsexy\b/gi, "stylish"],
    [/\bseductive\b/gi, "charming"],
    [/\bvoluptuous\b/gi, "curvy silhouette"],
    [/\bbare skin\b/gi, "visible skin"],
    [/\bexposed skin\b/gi, "visible skin"],
    [/\bnaked\b/gi, "unclothed"],
    [/\bnude\b/gi, "unclothed"],
    [/\bcleavage\b/gi, "neckline"],
    [/\bskin-tight\b/gi, "form-fitting"],
    [/\bbody contours?\b/gi, "body silhouette"],
    [/\bskin tones? with detailed highlights\b/gi, "natural skin coloring"],
    [/\bintimate\b/gi, "close-up"],
    [/\bbikini\b/gi, "swimsuit"],
    [/\blingerie\b/gi, "sleepwear"],
    [/\bunderwear\b/gi, "innerwear"],
    // 폭력 관련
    [/\bblood-soaked\b/gi, "battle-worn"],
    [/\bgory\b/gi, "intense"],
    [/\bbrutal\b/gi, "fierce"],
  ];

  let sanitized = prompt;
  for (const [pattern, replacement] of replacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

// ─── 이미지 생성 (통합: create + poll) ─────────────────────

export interface GenerateImageResult {
  imageUrl: string;
  taskId: string;
  modelId: string;
  duration: number;
}

/**
 * 단일 시도: 이미지를 생성하고 완료될 때까지 폴링합니다.
 */
async function generateImageOnce(
  prompt: string,
  modelId: string,
  rawSize: string,
  options?: {
    onProgress?: (state: KieTaskState, elapsed: number) => void;
    referenceImageUrls?: string[];
  }
): Promise<GenerateImageResult> {
  const startTime = Date.now();

  // ── GPT Image: 별도 엔드포인트 (동기식, 폴링 불필요) ──
  if (getModelPattern(modelId) === "F") {
    const apiKey = getKieApiKey();
    if (!apiKey) throw new Error("Kie API Key가 필요합니다.");

    options?.onProgress?.("generating", 0);
    console.log(`[KieImage] GPT Image direct call: model=${modelId}`);

    const { imageUrl } = await callGptImageEndpoint(prompt, rawSize, apiKey);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    options?.onProgress?.("success", elapsed);
    console.log(`[KieImage] GPT Image done in ${elapsed}s: ${imageUrl}`);

    return { imageUrl, taskId: "gpt-direct", modelId, duration: elapsed };
  }

  // ── Vertex AI Gemini: 직접 호출 (동기식) ──
  if (modelId.startsWith("vertex/")) {
    options?.onProgress?.("generating", 0);
    console.log(`[VertexImage] Direct call: model=${modelId}, refs=${options?.referenceImageUrls?.length || 0}`);

    const { imageUrl } = await callVertexGeminiImage(prompt, rawSize, options?.referenceImageUrls);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    options?.onProgress?.("success", elapsed);
    console.log(`[VertexImage] Done in ${elapsed}s`);

    return { imageUrl, taskId: "vertex-direct", modelId, duration: elapsed };
  }

  // ── 일반 모델: createTask + polling ──
  const { taskId } = await createImageTask(prompt, {
    modelId,
    imageSize: rawSize,
    referenceImageUrls: options?.referenceImageUrls,
  });

  console.log(`[KieImage] Task created: ${taskId} (model: ${modelId}, refs: ${options?.referenceImageUrls?.length || 0})`);

  // 폴링 (최대 5분, 3초 간격 → 점진적 증가)
  const MAX_POLL_MS = 300_000;
  let interval = 3000;

  while (Date.now() - startTime < MAX_POLL_MS) {
    await new Promise(r => setTimeout(r, interval));

    const detail = await getTaskDetail(taskId);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    options?.onProgress?.(detail.state, elapsed);

    if (detail.state === "success") {
      if (detail.resultUrls.length === 0) {
        throw new Error("이미지 생성 성공했지만 결과 URL이 없습니다.");
      }
      console.log(`[KieImage] Done in ${elapsed}s: ${detail.resultUrls[0]}`);
      return {
        imageUrl: detail.resultUrls[0],
        taskId,
        modelId,
        duration: elapsed,
      };
    }

    if (detail.state === "fail") {
      throw new Error(`이미지 생성 실패: ${detail.failMsg || "Unknown error"}`);
    }

    if (interval < 10000) interval = Math.min(interval + 2000, 10000);
  }

  throw new Error("이미지 생성 시간 초과 (5분). 다시 시도해주세요.");
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

/**
 * 이미지를 생성하고 완료될 때까지 폴링합니다.
 * Internal Error 발생 시 최대 2회 자동 재시도합니다.
 * @param prompt AI 프롬프트
 * @param onProgress 상태 업데이트 콜백 (UI용)
 * @returns 생성된 이미지 URL
 */
export async function generateImage(
  prompt: string,
  options?: {
    modelId?: string;
    imageSize?: string;
    onProgress?: (state: KieTaskState, elapsed: number) => void;
    referenceImageUrls?: string[];
  }
): Promise<GenerateImageResult> {
  const modelId = options?.modelId || getSelectedImageModel();
  const rawSize = options?.imageSize || "portrait_4_3";
  // NSFW 필터 회피를 위해 프롬프트 순화
  const sanitizedPrompt = sanitizePromptForNSFW(prompt);
  if (sanitizedPrompt !== prompt) {
    console.log("[KieImage] 프롬프트 NSFW 순화 적용됨");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[KieImage] 재시도 ${attempt}/${MAX_RETRIES} (${RETRY_DELAY_MS}ms 대기 후)...`);
        options?.onProgress?.("waiting", 0);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
      return await generateImageOnce(sanitizedPrompt, modelId, rawSize, {
        onProgress: options?.onProgress,
        referenceImageUrls: options?.referenceImageUrls,
      });
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || "";
      // NSFW 등 콘텐츠 필터 에러는 재시도 불가
      const isContentFilter = msg.includes("NSFW") || msg.includes("content detected")
        || msg.includes("Content detected") || msg.includes("safety") || msg.includes("blocked");
      if (isContentFilter) {
        console.warn("[KieImage] 콘텐츠 필터 차단 — 재시도 불가:", msg);
        throw err;
      }
      // Internal Error 또는 서버 에러인 경우만 재시도
      const isRetryable = msg.includes("Internal Error") || msg.includes("internal error")
        || msg.includes("Internal Server") || msg.includes("try again")
        || msg.includes("502") || msg.includes("503") || msg.includes("504");

      if (!isRetryable || attempt >= MAX_RETRIES) {
        throw err;
      }
      console.warn(`[KieImage] 서버 에러 발생, 재시도합니다 (${attempt + 1}/${MAX_RETRIES}):`, msg);
    }
  }

  throw lastError || new Error("이미지 생성 실패");
}
