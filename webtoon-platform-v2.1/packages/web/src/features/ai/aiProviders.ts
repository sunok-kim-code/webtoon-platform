// ============================================================
// AI 프로바이더 설정 (index.html L1940–1945, L7232–7340에서 추출)
// 이미지 생성 프로바이더별 설정 및 디스패치
// ============================================================

import type { ProviderId } from "@webtoon/shared";

// ─── Vertex AI (Gemini) 모델 변형 ───────────────────────────

export interface VertexModelInfo {
  name: string;
  vertexModel: string;
  maxRefs: number;
}

export const NB_VERTEX_MODELS: Record<string, VertexModelInfo> = {
  "gemini-2.5-flash": {
    name: "Gemini 2.5 Flash (기본)",
    vertexModel: "gemini-2.5-flash-image",
    maxRefs: 6,
  },
  "gemini-3.1-flash": {
    name: "Gemini 3.1 Flash",
    vertexModel: "gemini-3.1-flash-image-preview",
    maxRefs: 10,
  },
  "gemini-3-pro": {
    name: "Gemini 3 Pro (고품질)",
    vertexModel: "gemini-3-pro-image-preview",
    maxRefs: 14,
  },
};

// ─── 프로바이더 매핑 ─────────────────────────────────────────

export type ImageProviderKey =
  | "nanoBanana"
  | "falAI"
  | "grok"
  | "imagen4"
  | "a2eImage"
  | "a2eNanoBanana"
  | "flux2Pro"
  | "ninjaChat"
  | "stableDiffusion"
  | "kieSeedream";

/** UI 프로바이더 키 → 내부 프로바이더 ID */
export const PROVIDER_MAP: Record<ImageProviderKey, ProviderId | string> = {
  nanoBanana: "gemini",
  falAI: "flux",
  grok: "grok",
  imagen4: "imagen4",
  a2eImage: "a2e",
  a2eNanoBanana: "a2eNanoBanana",
  flux2Pro: "flux2Pro",
  ninjaChat: "ninjaChat",
  stableDiffusion: "stability",
  kieSeedream: "seedream",
};

// ─── 프로바이더별 이미지 크기 ────────────────────────────────

export interface ImageSizeOption {
  width: number;
  height: number;
}

export function getImageSize(
  provider: ImageProviderKey,
  aspectRatio: string
): ImageSizeOption {
  if (provider === "falAI" || provider === "flux2Pro") {
    if (aspectRatio === "16:9") return { width: 1024, height: 576 };
    if (aspectRatio === "1:1") return { width: 768, height: 768 };
    return { width: 768, height: 1024 };
  }
  // Gemini / Grok / etc — 기본 크기
  if (aspectRatio === "16:9") return { width: 1024, height: 576 };
  if (aspectRatio === "1:1") return { width: 1024, height: 1024 };
  return { width: 768, height: 1024 };
}

// ─── 레퍼런스 이미지 우선순위 정렬 ──────────────────────────

export interface ReferenceImage {
  image: string; // base64 or URL
  description?: string;
}

/**
 * 레퍼런스 이미지를 우선순위 정렬 (캐릭터 > 이전 패널 > 배경 > 기타)
 * index.html L7248–7260에서 추출
 */
export function sortReferencesByPriority(
  refs: ReferenceImage[],
  maxRefs: number
): ReferenceImage[] {
  if (refs.length === 0) return [];

  const prevPanelRefs = refs.filter((r) =>
    (r.description || "").toLowerCase().includes("previous panel")
  );
  const bgRefs = refs.filter((r) =>
    (r.description || "").toLowerCase().startsWith("background:")
  );
  const charRefs = refs.filter((r) =>
    (r.description || "").toLowerCase().startsWith("character:")
  );
  const otherRefs = refs.filter((r) => {
    const d = (r.description || "").toLowerCase();
    return (
      !d.startsWith("background:") &&
      !d.startsWith("character:") &&
      !d.includes("previous panel")
    );
  });

  // 캐릭터를 최우선으로 배치 (캐릭터 일관성이 가장 중요)
  return [
    ...charRefs,
    ...prevPanelRefs,
    ...bgRefs.slice(0, 1),
    ...otherRefs,
  ].slice(0, maxRefs);
}
