// ============================================================
// AI Provider 타입 (v2.1)
// 7+ AI 프로바이더 통합 레이어
// ============================================================

/** AI 프로바이더 ID */
export type ProviderId =
  | "vertex-gemini-flash"     // Vertex AI Gemini 2.5 Flash
  | "vertex-gemini-pro"       // Vertex AI Gemini 3 Pro
  | "vertex-imagen"           // Vertex AI Imagen 4.0
  | "xai-grok"                // xAI Grok
  | "stability-sd35"          // Stability AI SD3.5
  | "seedream-kie"            // Seedream 4.0-4.5 (Kie/Siray)
  | "seedream-higgsfield"     // Seedream 4.0 (Higgsfield)
  | "a2e";                    // A2E (image-to-video)

/** 생성 모드 */
export type GenerationMode = "text2img" | "img2img" | "edit" | "img2video";

/** 레퍼런스 모드 */
export type ReferenceMode =
  | "multi-reference"
  | "image-customization"
  | "multi-image-edit"
  | "img2img"
  | "single-image";

/** 프로바이더 능력 정의 */
export interface ProviderCapability {
  id: ProviderId;
  name: string;
  modes: GenerationMode[];
  referenceMode: ReferenceMode;
  maxRefs: number;
  bestFor: string;
}

/** 생성 요청 */
export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  mode: GenerationMode;
  referenceImages?: ReferenceInput[];
  preferredProvider?: ProviderId;
  sceneContext?: {
    previousPanelUrls: string[];    // 이전 패널 URL (씬 연속성)
    characterRefs: string[];         // 캐릭터 레퍼런스 URL
    locationRefs: string[];          // 장소 레퍼런스 URL
  };
}

export interface ReferenceInput {
  url: string;
  weight?: number;            // 0-1, 레퍼런스 영향도
  label?: string;             // "character:minji", "location:classroom"
}

/** 생성 결과 */
export interface GenerationResult {
  imageUrl: string;           // Firebase Storage URL
  providerId: ProviderId;
  prompt: string;
  seed?: number;
  duration: number;           // ms
  cost?: number;
}

/** 오케스트레이터 프로바이더 스코어 */
export interface ProviderScore {
  providerId: ProviderId;
  score: number;
  reasons: string[];          // 스코어 산출 근거
}
