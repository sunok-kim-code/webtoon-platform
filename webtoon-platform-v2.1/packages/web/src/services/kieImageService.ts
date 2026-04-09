// ============================================================
// Kie.ai Image Generation Service
// 통합 Market API — createTask + polling
// ============================================================

import { fetchFreshToken } from "./firebase";

// ─── 모델 카탈로그 ──────────────────────────────────────────

export type KieImageCategory = "recommended" | "google" | "seedream" | "flux" | "grok" | "gpt" | "ideogram" | "qwen" | "ninjachat" | "other";

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
  {
    id: "flux-2/pro-image-to-image",
    name: "Flux 2 Pro img2img",
    category: "flux",
    mode: "img2img",
    description: "레퍼런스 이미지 기반 변환 (1~8장)",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_3_2", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "flux-kontext-pro",
    name: "Flux Kontext Pro",
    category: "flux",
    mode: "img2img",
    description: "이미지 편집 + 텍스트 생성 (캐릭터 일관성)",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  {
    id: "flux-kontext-max",
    name: "Flux Kontext Max",
    category: "flux",
    mode: "img2img",
    description: "Flux Kontext 최고 품질 모드",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
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
  {
    id: "grok-imagine/image-to-image",
    name: "Grok Imagine img2img",
    category: "grok",
    mode: "img2img",
    description: "레퍼런스 이미지 기반 변환",
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
  // ── xAI Grok Image (직접 호출) ──
  {
    id: "xai/grok-image",
    name: "Grok Image (xAI 고품질)",
    category: "grok",
    mode: "text2img",
    description: "xAI 직접 호출 — grok-imagine-image-pro (API 키 필요)",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"],
    defaultSize: "portrait_4_3",
  },
  // ── NinjaChat (프록시 호출) ──
  {
    id: "ninjachat/vision1",
    name: "NinjaChat Vision1",
    category: "ninjachat",
    mode: "text2img",
    description: "NinjaChat ninja-vision-1 이미지 생성 (API 키 필요)",
    supportedSizes: ["square_hd", "portrait_4_3", "portrait_16_9"],
    defaultSize: "square_hd",
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
  const model = getSelectedImageModel();
  // Vertex AI 직접 호출 모델
  if (model.startsWith("vertex/")) {
    const projectId = localStorage.getItem("VERTEX_PROJECT_ID") || "";
    const token = localStorage.getItem("VERTEX_ACCESS_TOKEN") || "";
    return !!(projectId && token);
  }
  // xAI Grok Image 직접 호출
  if (model.startsWith("xai/")) {
    return !!(localStorage.getItem("XAI_API_KEY"));
  }
  // NinjaChat
  if (model.startsWith("ninjachat/")) {
    return !!(localStorage.getItem("NINJACHAT_API_KEY"));
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
 * Pattern D (aspect_ratio + resolution):      flux-2/pro-text-to-image
 * Pattern E (image_size keyword):             bytedance/seedream*, qwen, ideogram/v3, wan
 * Pattern F (GPT Image — 별도 endpoint):      gpt-image/1.5
 * Pattern G (Grok — 제한적 aspect_ratio):     grok-imagine/*
 * Pattern H (aspect_ratio + image_input + resolution): nano-banana-pro (img2img)
 * Pattern I (flux-2/pro img2img):             flux-2/pro-image-to-image (input_urls + aspect_ratio + resolution)
 * Pattern J (Flux Kontext — 별도 endpoint):   flux-kontext-pro, flux-kontext-max
 * BROKEN:   ideogram/character — reference_image_urls 필수, text2img 불가
 */

type ModelPattern = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "BROKEN";

function getModelPattern(modelId: string): ModelPattern {
  // Pattern F: GPT Image — 별도 엔드포인트
  if (modelId.startsWith("gpt-image/")) return "F";

  // BROKEN: Ideogram Character — text2img 불가
  if (modelId === "ideogram/character") return "BROKEN";

  // Pattern A: Google Imagen 4 계열 (negative_prompt 지원)
  if (modelId.startsWith("google/imagen4")) return "A";

  // Pattern C: Seedream 4.5 / 5 Lite (aspect_ratio + quality)
  if (modelId.startsWith("seedream/")) return "C";

  // Pattern I: Flux 2 Pro Image-to-Image (input_urls + aspect_ratio + resolution)
  if (modelId === "flux-2/pro-image-to-image") return "I";

  // Pattern D: Flux 2 Pro text-to-image (aspect_ratio + resolution)
  if (modelId.startsWith("flux-2/")) return "D";

  // Pattern J: Flux Kontext (별도 엔드포인트)
  if (modelId.startsWith("flux-kontext")) return "J";

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

    case "I": // Flux 2 Pro Image-to-Image: input_urls (필수) + aspect_ratio + resolution
      return {
        prompt,
        input_urls: refs || [],
        aspect_ratio: ar,
        resolution: "1K",
        nsfw_checker: false,
      };

    case "J": // Flux Kontext — 이 함수에서 처리하지 않음 (별도 엔드포인트)
      throw new Error("__FLUX_KONTEXT__");

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
 * Flux Kontext 이미지 생성/편집 (별도 엔드포인트 — createTask + polling)
 * inputImage가 있으면 편집 모드, 없으면 텍스트→이미지 모드
 */
async function callFluxKontextEndpoint(
  prompt: string,
  sizeKey: string,
  modelVariant: string,
  apiKey: string,
  referenceImageUrls?: string[],
): Promise<KieTaskResult> {
  const ar = toAspectRatioValue(sizeKey);

  const body: Record<string, unknown> = {
    prompt,
    aspectRatio: ar,
    outputFormat: "png",
    model: modelVariant, // "flux-kontext-pro" or "flux-kontext-max"
    safetyTolerance: 2,
  };

  // 레퍼런스 이미지가 있으면 첫 번째를 inputImage로 사용 (편집 모드)
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    body.inputImage = referenceImageUrls[0];
  }

  console.log(`[FluxKontext] Call: model=${modelVariant}, inputImage=${!!body.inputImage}`);

  const response = await fetch(`${KIE_BASE}/api/v1/flux/kontext/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.code !== 200) {
    throw new Error(`Flux Kontext 생성 오류 (${data.code}): ${data.msg || "Unknown error"}`);
  }

  return { taskId: data.data.taskId };
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

  if (!projectId) {
    throw new Error("Vertex AI 설정이 필요합니다. VERTEX_PROJECT_ID를 설정하세요.");
  }

  // 토큰을 fetchFreshToken으로 가져옴 (만료 임박 시 자동 갱신)
  let accessToken = await fetchFreshToken();
  if (!accessToken) {
    throw new Error("Vertex AI 토큰이 없습니다. VERTEX_ACCESS_TOKEN을 설정하거나 /api/vertex-token 엔드포인트를 확인하세요.");
  }

  const modelName = "gemini-3-pro-image-preview";
  // gemini-3-pro-preview는 global 엔드포인트에서만 사용 가능
  const useGlobal = modelName.startsWith("gemini-3");
  const apiLocation = useGlobal ? "global" : location;
  const apiHost = useGlobal
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const url = `https://${apiHost}/v1/projects/${projectId}/locations/${apiLocation}/publishers/google/models/${modelName}:generateContent`;

  // 레퍼런스 이미지가 있으면 base64로 변환하여 multipart 요청
  const parts: any[] = [];

  if (referenceImageUrls && referenceImageUrls.length > 0) {
    const maxRefImages = referenceImageUrls.length; // 제한 없이 모든 ref 이미지 전달
    for (let i = 0; i < maxRefImages; i++) {
      try {
        // fetch 방식 시도 → CORS 실패 시 img+canvas fallback
        let refBase64 = "";
        let mimeType = "image/png";
        try {
          const refRes = await fetch(referenceImageUrls[i]);
          if (!refRes.ok) throw new Error(`HTTP ${refRes.status}`);
          const refBlob = await refRes.blob();
          refBase64 = await blobToBase64(refBlob);
          mimeType = refBlob.type || "image/png";
        } catch {
          // CORS 차단 시 img 태그 + canvas로 base64 변환
          console.warn(`[VertexImage] fetch CORS failed for ref ${i}, using canvas fallback`);
          const result = await imageUrlToBase64ViaCanvas(referenceImageUrls[i]);
          refBase64 = result.data;
          mimeType = result.mimeType;
        }
        if (refBase64) {
          parts.push({
            inlineData: { mimeType, data: refBase64 },
          });
        }
      } catch (e) {
        console.warn(`[VertexImage] Failed to fetch ref image ${i}:`, e);
      }
    }
    parts.push({
      text: `[CRITICAL STYLE CONTINUITY] The above reference images are from PREVIOUS PANELS in the same webtoon/comic. The FIRST image is the immediately preceding panel and has the HIGHEST priority — match it most closely. You MUST exactly match: art style, linework, color palette, character face/body proportions, hair style, skin tone, shading technique, and background detail level. The new image must look like it was drawn by the SAME ARTIST in the SAME SESSION. Copy the STYLE only, not the CONTENT — draw only what the prompt below describes.\n\nGenerate a new image based on the following description:\n\n${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  console.log(`[VertexImage] Calling Vertex AI: model=${modelName}, refs=${referenceImageUrls?.length || 0}`);

  // 최대 1회 토큰 갱신 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401 && attempt === 0) {
      console.warn("[VertexImage] 401 — 토큰 갱신 시도 중...");
      const oldToken = accessToken;
      // 캐시 무효화 후 새 토큰 요청
      localStorage.removeItem("VERTEX_ACCESS_TOKEN");
      try {
        accessToken = await fetchFreshToken();
      } catch {
        accessToken = "";
      }
      if (!accessToken || !accessToken.startsWith("ya29.")) {
        // 갱신 실패 — 기존 토큰 복원 후 에러
        if (oldToken) localStorage.setItem("VERTEX_ACCESS_TOKEN", oldToken);
        throw new Error("Vertex AI 토큰 자동 갱신 실패. gcloud auth print-access-token으로 새 토큰을 발급받아 VERTEX_ACCESS_TOKEN에 설정하세요.");
      }
      console.log("[VertexImage] 토큰 갱신 성공, 재시도...");
      continue;
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

  throw new Error("Vertex AI: 토큰 갱신 후에도 실패했습니다.");
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

// ─── xAI Grok Image 직접 호출 ──────────────────────────────

const XAI_GROK_RATIO: Record<string, string> = {
  "square_hd": "1:1", "square": "1:1",
  "portrait_4_3": "3:4", "portrait_3_2": "2:3", "portrait_16_9": "9:16",
  "landscape_4_3": "4:3", "landscape_3_2": "3:2", "landscape_16_9": "16:9",
};

async function callXaiGrokImage(
  prompt: string,
  sizeKey: string,
  referenceImageUrls?: string[],
): Promise<{ imageUrl: string }> {
  const apiKey = localStorage.getItem("XAI_API_KEY") || "";
  if (!apiKey) throw new Error("xAI API 키가 필요합니다. 설정에서 XAI_API_KEY를 입력하세요.");

  const aspectRatio = XAI_GROK_RATIO[sizeKey] || "3:4";

  // 항상 generations 엔드포인트 사용 (edits는 multipart 필요)
  const url = "https://api.x.ai/v1/images/generations";

  const body: Record<string, unknown> = {
    model: "grok-2-image",
    prompt: prompt.substring(0, 4000),
    n: 1,
    response_format: "b64_json",
  };

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const wait = Math.min(15000 * Math.pow(2, attempt), 60000);
      console.warn(`[GrokImage] 429 rate limit, waiting ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Grok Image ${res.status}: ${errText.substring(0, 300)}`);
    }

    const data = await res.json();
    if (!data.data?.length) throw new Error("Grok Image: 이미지가 생성되지 않았습니다.");

    const b64 = data.data[0].b64_json || "";
    const dataUri = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;

    // base64 → Blob URL로 변환
    const binaryStr = atob(dataUri.split(",")[1]);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    const blobUrl = URL.createObjectURL(blob);

    console.log(`[GrokImage] Image generated (${blob.size} bytes)`);
    return { imageUrl: blobUrl };
  }

  throw new Error("Grok Image: Rate limit exceeded after retries");
}

// ─── NinjaChat 이미지 생성 ────────────────────────────────

async function callNinjaChatImage(
  prompt: string,
  sizeKey: string,
  referenceImageUrls?: string[],
): Promise<{ imageUrl: string }> {
  const apiKey = localStorage.getItem("NINJACHAT_API_KEY") || "";
  if (!apiKey) throw new Error("NinjaChat API 키가 필요합니다. 설정에서 NINJACHAT_API_KEY를 입력하세요.");

  // NinjaChat 지원 사이즈: 1920x1920, 2560x1440, 1440x2560
  const NINJA_SIZE: Record<string, string> = {
    "square_hd": "1920x1920", "square": "1920x1920",
    "portrait_4_3": "1440x2560", "portrait_3_2": "1440x2560", "portrait_16_9": "1440x2560",
    "landscape_4_3": "2560x1440", "landscape_3_2": "2560x1440", "landscape_16_9": "2560x1440",
  };
  const size = NINJA_SIZE[sizeKey] || "1920x1920";

  const body: Record<string, unknown> = {
    prompt: prompt.substring(0, 4000),
    model: "ninja-vision-1",
    size,
    n: 1,
    _apiKey: apiKey,
  };

  // 레퍼런스 이미지 (첫 번째만 사용)
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    body.image = referenceImageUrls[0];
  }

  console.log(`[NinjaChat] Model: ninja-vision-1, size: ${size}, has_ref: ${!!body.image}`);

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch("/api/ninjachat-images", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const wait = Math.min(15000 * Math.pow(2, attempt), 60000);
      console.warn(`[NinjaChat] Rate limited, waiting ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status === 402) {
      throw new Error("NinjaChat: 잔액 부족 — API 계정을 확인해주세요.");
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NinjaChat ${res.status}: ${errText.substring(0, 300)}`);
    }

    const data = await res.json();
    if (data.images?.length > 0) {
      const imgUrl = data.images[0].url;
      console.log(`[NinjaChat] Image generated: ${imgUrl.substring(0, 80)}`);
      return { imageUrl: imgUrl };
    }

    throw new Error("NinjaChat: 이미지가 생성되지 않았습니다.");
  }

  throw new Error("NinjaChat: 재시도 초과");
}

/** 이미지 URL → img 태그 + canvas → base64 (CORS 우회용 fallback) */
function imageUrlToBase64ViaCanvas(url: string): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas context failed")); return; }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        resolve({ data: base64, mimeType: "image/png" });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
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

  // Flux Kontext는 별도 엔드포인트
  if (getModelPattern(modelId) === "J") {
    throw new Error("__FLUX_KONTEXT__"); // generateImage()에서 분기 처리
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
/** NSFW 순화 비활성화 — 이미지 모델이 자체 NSFW 필터를 가지고 있으므로 원본 프롬프트를 그대로 전달 */
function sanitizePromptForNSFW(prompt: string): string {
  return prompt;
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

  // ── xAI Grok Image: 직접 호출 (동기식) ──
  if (modelId.startsWith("xai/")) {
    options?.onProgress?.("generating", 0);
    console.log(`[GrokImage] Direct call: model=${modelId}, refs=${options?.referenceImageUrls?.length || 0}`);

    const { imageUrl } = await callXaiGrokImage(prompt, rawSize, options?.referenceImageUrls);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    options?.onProgress?.("success", elapsed);
    console.log(`[GrokImage] Done in ${elapsed}s`);

    return { imageUrl, taskId: "xai-direct", modelId, duration: elapsed };
  }

  // ── NinjaChat: 프록시 호출 (동기식) ──
  if (modelId.startsWith("ninjachat/")) {
    options?.onProgress?.("generating", 0);
    console.log(`[NinjaChat] Proxy call: model=${modelId}, refs=${options?.referenceImageUrls?.length || 0}`);

    const { imageUrl } = await callNinjaChatImage(prompt, rawSize, options?.referenceImageUrls);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    options?.onProgress?.("success", elapsed);
    console.log(`[NinjaChat] Done in ${elapsed}s`);

    return { imageUrl, taskId: "ninjachat-direct", modelId, duration: elapsed };
  }

  // ── Flux Kontext: 별도 엔드포인트 + polling ──
  if (getModelPattern(modelId) === "J") {
    const apiKey = getKieApiKey();
    if (!apiKey) throw new Error("Kie API Key가 필요합니다.");

    options?.onProgress?.("generating", 0);
    console.log(`[FluxKontext] Dispatch: model=${modelId}, refs=${options?.referenceImageUrls?.length || 0}`);

    const { taskId } = await callFluxKontextEndpoint(
      prompt, rawSize, modelId, apiKey, options?.referenceImageUrls,
    );

    console.log(`[FluxKontext] Task created: ${taskId}`);

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
          throw new Error("Flux Kontext 생성 성공했지만 결과 URL이 없습니다.");
        }
        console.log(`[FluxKontext] Done in ${elapsed}s: ${detail.resultUrls[0]}`);
        return {
          imageUrl: detail.resultUrls[0],
          taskId,
          modelId,
          duration: elapsed,
        };
      }

      if (detail.state === "fail") {
        throw new Error(`Flux Kontext 생성 실패: ${detail.failMsg || "Unknown error"}`);
      }

      if (interval < 10000) interval = Math.min(interval + 2000, 10000);
    }

    throw new Error("Flux Kontext 생성 시간 초과 (5분). 다시 시도해주세요.");
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

// ══════════════════════════════════════════════════════════════
// Vertex AI BatchPredictionJob — 50% 비용 절감 배치 이미지 생성
// GCS JSONL 입력 → BatchPredictionJob → GCS 출력 → 결과 파싱
// ══════════════════════════════════════════════════════════════

export interface BatchPanelRequest {
  idx: number;
  prompt: string;
  sizeKey: string;
  referenceImageUrls?: string[];
}

export interface BatchPanelResult {
  idx: number;
  imageUrl?: string;
  error?: string;
}

/** 배치 작업 상태 */
export type BatchJobState =
  | "JOB_STATE_QUEUED"
  | "JOB_STATE_PENDING"
  | "JOB_STATE_RUNNING"
  | "JOB_STATE_SUCCEEDED"
  | "JOB_STATE_FAILED"
  | "JOB_STATE_CANCELLING"
  | "JOB_STATE_CANCELLED"
  | "JOB_STATE_PAUSED"
  | "JOB_STATE_EXPIRED";

export interface VertexBatchJobInfo {
  jobName: string;
  state: BatchJobState;
  outputGcsUri?: string;
}

// ─── GCS 헬퍼 (Firebase Storage = GCS 버킷) ──────────────────

const GCS_BUCKET = "rhivclass.firebasestorage.app";

/** GCS에 JSON/JSONL 텍스트 업로드 (Firebase Storage REST API 사용) */
async function uploadToGcs(
  gcsPath: string,
  content: string,
  contentType: string,
  accessToken: string,
): Promise<string> {
  const encodedPath = encodeURIComponent(gcsPath);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodedPath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Authorization": `Bearer ${accessToken}`,
    },
    body: content,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCS upload failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  return `gs://${GCS_BUCKET}/${gcsPath}`;
}

/** GCS에서 텍스트 파일 다운로드 */
async function downloadFromGcs(
  gcsUri: string,
  accessToken: string,
): Promise<string> {
  // gs://bucket/path → path 추출
  const match = gcsUri.match(/^gs:\/\/[^/]+\/(.+)$/);
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);
  const objectPath = match[1];
  const encodedPath = encodeURIComponent(objectPath);
  const url = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o/${encodedPath}?alt=media`;

  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCS download failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  return res.text();
}

/** GCS 경로 아래 오브젝트 목록 조회 */
async function listGcsObjects(
  prefix: string,
  accessToken: string,
): Promise<string[]> {
  const encodedPrefix = encodeURIComponent(prefix);
  const url = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o?prefix=${encodedPrefix}`;

  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCS list failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  const data = await res.json();
  const items: string[] = (data.items || []).map((item: any) => item.name as string);
  return items;
}

// ─── JSONL 입력 준비 ──────────────────────────────────────────

/** 레퍼런스 이미지 URL을 base64 인라인 데이터로 변환 */
async function buildRefParts(referenceImageUrls?: string[]): Promise<any[]> {
  const parts: any[] = [];
  if (!referenceImageUrls || referenceImageUrls.length === 0) return parts;

  for (let i = 0; i < referenceImageUrls.length; i++) {
    try {
      let refBase64 = "";
      let mimeType = "image/png";
      try {
        const refRes = await fetch(referenceImageUrls[i]);
        if (!refRes.ok) throw new Error(`HTTP ${refRes.status}`);
        const refBlob = await refRes.blob();
        refBase64 = await blobToBase64(refBlob);
        mimeType = refBlob.type || "image/png";
      } catch {
        const result = await imageUrlToBase64ViaCanvas(referenceImageUrls[i]);
        refBase64 = result.data;
        mimeType = result.mimeType;
      }
      if (refBase64) {
        parts.push({ inlineData: { mimeType, data: refBase64 } });
      }
    } catch (e) {
      console.warn(`[VertexBatch] Failed to fetch ref image ${i}:`, e);
    }
  }
  return parts;
}

/** 패널 요청 배열 → JSONL 문자열 (각 행 = generateContent 요청) */
async function buildBatchJsonl(panels: BatchPanelRequest[]): Promise<string> {
  const lines: string[] = [];

  for (const panel of panels) {
    const refParts = await buildRefParts(panel.referenceImageUrls);
    const prompt = sanitizePromptForNSFW(panel.prompt);

    const textPart = refParts.length > 0
      ? { text: `Use the above reference images as style and character reference. Generate a new image based on the following description:\n\n${prompt}` }
      : { text: prompt };

    const allParts = [...refParts, textPart];

    const request = {
      contents: [{ role: "user", parts: allParts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
      labels: { panel_idx: String(panel.idx) },
    };

    lines.push(JSON.stringify({ request }));
  }

  return lines.join("\n");
}

// ─── BatchPredictionJob API ──────────────────────────────────

/**
 * Vertex AI BatchPredictionJob을 생성합니다.
 * 50% 비용 할인이 적용되는 비동기 배치 처리입니다.
 */
export async function createVertexBatchJob(
  panels: BatchPanelRequest[],
  onStatus?: (msg: string) => void,
): Promise<VertexBatchJobInfo> {
  const projectId = localStorage.getItem("VERTEX_PROJECT_ID") || "";
  const location = localStorage.getItem("VERTEX_LOCATION") || "us-central1";
  if (!projectId) throw new Error("Vertex AI 설정이 필요합니다. VERTEX_PROJECT_ID를 설정하세요.");

  let accessToken = await fetchFreshToken();
  if (!accessToken) throw new Error("Vertex AI 토큰이 없습니다.");

  const modelName = "gemini-3-pro-image-preview";
  const timestamp = Date.now();
  const batchId = `batch_panels_${timestamp}`;
  const gcsInputPath = `vertex_batch/${batchId}/input.jsonl`;
  const gcsOutputPrefix = `vertex_batch/${batchId}/output`;

  // 1) JSONL 입력 준비
  onStatus?.("JSONL 입력 파일 준비 중...");
  console.log(`[VertexBatch] Preparing JSONL for ${panels.length} panels...`);
  const jsonlContent = await buildBatchJsonl(panels);

  // 2) GCS에 JSONL 업로드
  onStatus?.("GCS에 입력 파일 업로드 중...");
  console.log(`[VertexBatch] Uploading JSONL to gs://${GCS_BUCKET}/${gcsInputPath}`);
  const inputGcsUri = await uploadToGcs(gcsInputPath, jsonlContent, "application/jsonl", accessToken);

  // 3) BatchPredictionJob 생성
  onStatus?.("배치 작업 생성 중...");
  // gemini-3-pro 계열은 global 엔드포인트 사용
  const useGlobal = modelName.startsWith("gemini-3");
  const apiLocation = useGlobal ? "global" : location;
  const apiHost = useGlobal ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;

  const jobUrl = `https://${apiHost}/v1/projects/${projectId}/locations/${apiLocation}/batchPredictionJobs`;

  const jobBody = {
    displayName: `webtoon-panels-${batchId}`,
    model: `publishers/google/models/${modelName}`,
    inputConfig: {
      instancesFormat: "jsonl",
      gcsSource: {
        uris: [inputGcsUri],
      },
    },
    outputConfig: {
      predictionsFormat: "jsonl",
      gcsDestination: {
        outputUriPrefix: `gs://${GCS_BUCKET}/${gcsOutputPrefix}`,
      },
    },
  };

  console.log(`[VertexBatch] Creating BatchPredictionJob...`, jobBody);

  const createRes = await fetch(jobUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(jobBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`BatchPredictionJob 생성 실패 (${createRes.status}): ${errText.substring(0, 500)}`);
  }

  const jobData = await createRes.json();
  const jobName = jobData.name as string; // projects/.../locations/.../batchPredictionJobs/123
  console.log(`[VertexBatch] Job created: ${jobName}, state: ${jobData.state}`);

  return {
    jobName,
    state: jobData.state || "JOB_STATE_QUEUED",
    outputGcsUri: `gs://${GCS_BUCKET}/${gcsOutputPrefix}`,
  };
}

/**
 * 배치 작업 상태를 폴링합니다.
 * 완료될 때까지 반복 확인하며, onStatus 콜백으로 상태를 전달합니다.
 */
export async function pollVertexBatchJob(
  jobName: string,
  onStatus?: (state: BatchJobState, msg: string) => void,
  pollIntervalMs = 15000,
  maxWaitMs = 3600000, // 1시간 최대 대기
): Promise<{ state: BatchJobState; outputUri?: string }> {
  const startTime = Date.now();

  // jobName에서 프로젝트/위치 정보 추출하여 올바른 엔드포인트 결정
  const useGlobal = jobName.includes("/locations/global/");
  const apiHost = useGlobal ? "aiplatform.googleapis.com" : (() => {
    const locMatch = jobName.match(/\/locations\/([^/]+)\//);
    const loc = locMatch?.[1] || "us-central1";
    return `${loc}-aiplatform.googleapis.com`;
  })();

  while (Date.now() - startTime < maxWaitMs) {
    let accessToken = await fetchFreshToken();
    if (!accessToken) throw new Error("Vertex AI 토큰이 없습니다.");

    const statusUrl = `https://${apiHost}/v1/${jobName}`;
    const res = await fetch(statusUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[VertexBatch] Poll error (${res.status}): ${errText.substring(0, 200)}`);
      // 일시적 에러는 재시도
      if (res.status >= 500) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        continue;
      }
      throw new Error(`배치 작업 상태 조회 실패 (${res.status}): ${errText.substring(0, 300)}`);
    }

    const jobData = await res.json();
    const state = jobData.state as BatchJobState;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`[VertexBatch] Poll: state=${state}, elapsed=${elapsed}s`);
    onStatus?.(state, `배치 작업 상태: ${state} (${elapsed}초 경과)`);

    // 종료 상태 확인
    if (state === "JOB_STATE_SUCCEEDED") {
      const outputUri = jobData.outputConfig?.gcsDestination?.outputUriPrefix
        || jobData.outputInfo?.gcsOutputDirectory;
      return { state, outputUri };
    }

    if (
      state === "JOB_STATE_FAILED" ||
      state === "JOB_STATE_CANCELLED" ||
      state === "JOB_STATE_EXPIRED"
    ) {
      const errorMsg = jobData.error?.message || state;
      throw new Error(`배치 작업 실패: ${errorMsg}`);
    }

    // 대기 후 재시도
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  throw new Error("배치 작업 시간 초과 (1시간)");
}

/**
 * 배치 작업 출력 JSONL을 다운로드하고 파싱하여 이미지 blob URL로 변환합니다.
 * panels 배열의 idx 순서와 매칭합니다.
 */
export async function parseVertexBatchResults(
  outputGcsUri: string,
  panels: BatchPanelRequest[],
  onStatus?: (msg: string) => void,
): Promise<BatchPanelResult[]> {
  let accessToken = await fetchFreshToken();
  if (!accessToken) throw new Error("Vertex AI 토큰이 없습니다.");

  onStatus?.("배치 결과 다운로드 중...");

  // 출력 디렉토리에서 JSONL 파일 목록 조회
  const gsPrefix = outputGcsUri.replace(`gs://${GCS_BUCKET}/`, "");
  const objectNames = await listGcsObjects(gsPrefix, accessToken);

  // JSONL 결과 파일 찾기
  const jsonlFiles = objectNames.filter(name =>
    name.endsWith(".jsonl") || name.includes("predictions")
  );

  if (jsonlFiles.length === 0) {
    // 하위 폴더 탐색 (Vertex AI는 output/ 아래에 prediction 폴더 생성 가능)
    console.warn(`[VertexBatch] No JSONL files found at prefix: ${gsPrefix}, listing all objects...`);
    const allObjects = await listGcsObjects(gsPrefix, accessToken);
    console.log(`[VertexBatch] All objects under prefix:`, allObjects);
    const anyJsonl = allObjects.filter(name => name.endsWith(".jsonl"));
    if (anyJsonl.length === 0) {
      throw new Error(`배치 결과 파일을 찾을 수 없습니다. (prefix: ${gsPrefix})`);
    }
    jsonlFiles.push(...anyJsonl);
  }

  console.log(`[VertexBatch] Found ${jsonlFiles.length} result files:`, jsonlFiles);

  // 모든 JSONL 파일의 내용을 합침
  const allLines: string[] = [];
  for (const fileName of jsonlFiles) {
    const fileUri = `gs://${GCS_BUCKET}/${fileName}`;
    // 토큰 갱신 가능성
    accessToken = await fetchFreshToken();
    const content = await downloadFromGcs(fileUri, accessToken);
    const lines = content.split("\n").filter(line => line.trim());
    allLines.push(...lines);
  }

  console.log(`[VertexBatch] Total output lines: ${allLines.length}, expected panels: ${panels.length}`);
  onStatus?.(`결과 파싱 중... (${allLines.length}개 응답)`);

  // 결과 파싱 — 입력 순서대로 매칭
  const results: BatchPanelResult[] = [];

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];

    if (i >= allLines.length) {
      results.push({ idx: panel.idx, error: "배치 결과에 해당 패널 응답이 없습니다." });
      continue;
    }

    try {
      const lineData = JSON.parse(allLines[i]);
      // BatchPredictionJob 출력 형식: { response: { candidates: [...] } } 또는 { response: generateContent 응답 }
      const response = lineData.response || lineData;
      const candidates = response.candidates || [];

      let found = false;
      for (const candidate of candidates) {
        const candidateParts = candidate.content?.parts || [];
        for (const part of candidateParts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            const binaryStr = atob(part.inlineData.data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j);
            const blob = new Blob([bytes], { type: part.inlineData.mimeType });
            const blobUrl = URL.createObjectURL(blob);
            results.push({ idx: panel.idx, imageUrl: blobUrl });
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        // 에러 응답 확인
        const errorMsg = lineData.status?.message || lineData.error?.message || "이미지가 생성되지 않았습니다.";
        results.push({ idx: panel.idx, error: errorMsg });
      }
    } catch (parseErr: any) {
      console.error(`[VertexBatch] Failed to parse line ${i}:`, parseErr);
      results.push({ idx: panel.idx, error: `결과 파싱 오류: ${parseErr.message}` });
    }
  }

  results.sort((a, b) => a.idx - b.idx);
  return results;
}

/**
 * Vertex AI BatchPredictionJob을 이용한 패널 이미지 배치 생성.
 * 실시간 대비 50% 비용 절감 (처리 시간은 더 걸림).
 *
 * 흐름: JSONL 준비 → GCS 업로드 → BatchPredictionJob 생성 → 폴링 → 결과 파싱
 */
export async function generateVertexBatch(
  panels: BatchPanelRequest[],
  options?: {
    onProgress?: (completed: number, total: number, idx: number, success: boolean) => void;
    onStatus?: (msg: string) => void;
    pollIntervalMs?: number;
  },
): Promise<BatchPanelResult[]> {
  if (panels.length === 0) return [];

  // 1) 배치 작업 생성
  const jobInfo = await createVertexBatchJob(panels, options?.onStatus);

  // 2) 작업 완료까지 폴링
  options?.onStatus?.("배치 작업 처리 중... (최대 수십 분 소요)");
  const { outputUri } = await pollVertexBatchJob(
    jobInfo.jobName,
    (_state, msg) => options?.onStatus?.(msg),
    options?.pollIntervalMs || 15000,
  );

  const finalOutputUri = outputUri || jobInfo.outputGcsUri || "";
  if (!finalOutputUri) throw new Error("배치 작업 출력 경로를 찾을 수 없습니다.");

  // 3) 결과 파싱
  const results = await parseVertexBatchResults(finalOutputUri, panels, options?.onStatus);

  // 4) onProgress 콜백 호출 (UI 갱신용)
  let completed = 0;
  for (const r of results) {
    completed++;
    options?.onProgress?.(completed, panels.length, r.idx, !!r.imageUrl);
  }

  console.log(`[VertexBatch] Done: ${results.filter(r => r.imageUrl).length}/${results.length} succeeded`);
  return results;
}
