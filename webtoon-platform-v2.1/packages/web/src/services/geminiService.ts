// ============================================================
// Gemini AI Service (v2.1)
// Gemini 3 Pro 3.1 기반 씬 분석 & 스토리보드 생성
// Architecture v2.0 Reference & Continuity System 통합
// ============================================================

import type { Character, Location } from "@webtoon/shared/types";

// ─── 타입 정의 ──────────────────────────────────────────────

export interface GeminiSceneAnalysis {
  characters: GeminiCharacterAnalysis[];
  location: GeminiLocationAnalysis;       // 대표 장소 (하위 호환)
  locations: GeminiLocationAnalysis[];    // 모든 개별 장소
  panels: GeminiPanelSuggestion[];
  sceneOverview: string;
  suggestedPromptStyle: string;
}

export interface GeminiCharacterAnalysis {
  name: string;
  description: string;
  emotion: string;
  outfit: string;
  outfitLabel?: string;            // 짧은 의상 라벨 (예: "casual hoodie", "school uniform")
  outfitNormalizedId?: string;     // 의상 라이브러리 ID: "{이름}_outfit_{키워드}" (예: "지호_outfit_suit_black")
  characterCore?: string;          // 기본 외형 (의상 제외): 얼굴·헤어·체형 설명 (영어)
  action: string;
  angle: string;
  promptSnippet: string;           // AI 프롬프트에 사용할 외모 설명
  dialogueSummary?: string | null;  // 대사 요약
  // V1 포팅: 구조화된 상세 캐릭터 데이터
  appearance?: string;             // 상세 외모 설명 (영어)
  accessories?: string;            // 소품 설명
  distinctFeatures?: string;       // 고유 시각 특성 (3-5개)
  refPrompt?: string;             // 구조화된 레퍼런스 시트 프롬프트
}

export interface GeminiLocationAnalysis {
  name: string;
  description: string;
  locationCanonical?: string;      // 표준 카테고리 (예: "apartment_living_room", "school_classroom")
  timeOfDay: string;
  weather: string;
  mood: string;
  promptSnippet: string;           // 장소 프롬프트 스니펫
}

/**
 * panel_type: 패널 이미지 생성 여부를 결정하는 씬 분류
 *   "visual"    - 캐릭터 행동/시각적 변화 → 이미지 생성 대상
 *   "dialogue"  - 대화 위주 → 이미지 생성 대상 (말풍선 패널)
 *   "narration" - 서술/내레이션 → 텍스트 박스만, 이미지 생성 제외 가능
 *   "skip"      - 전환/맥락 설명 → 패널 생성 불필요
 */
export type PanelType = "visual" | "dialogue" | "narration" | "skip";

export interface GeminiPanelSuggestion {
  panelNumber: number;
  description: string;
  location?: string;               // 이 패널의 구체적 장소 이름
  locationCanonical?: string;      // 이 패널 장소의 canonical 카테고리
  characters: string[];
  characterOutfits?: Record<string, string>; // { 캐릭터이름: outfitNormalizedId }
  cameraAngle: string;
  emotion: string;
  composition: string;             // 구도 설명
  aiPrompt: string;                // 완성된 AI 이미지 생성 프롬프트 (대사/SFX 제외)
  notes: string;
  panel_type?: PanelType;          // 씬 분류 (없으면 "visual" 로 간주)
  sceneId?: string;                // 씬 단위 ID (예: "#1", "#2")
  dialogues?: Array<{ character: string; text: string }>;  // 대사 (이미지 프롬프트에 포함 안 함)
  sfx?: string[];                  // 효과음 (이미지 프롬프트에 포함 안 함)
}

export interface GeminiAutoTagResult {
  characterTags?: {
    emotion: string;
    outfit: string;
    angle: string;
    action: string;
  };
  locationTags?: {
    timeOfDay: string;
    weather: string;
    mood: string;
  };
  suggestedPromptSnippet: string;
  confidence: number;
}

// ─── 모델 정의 ─────────────────────────────────────────────

export type GeminiModelId =
  | "gemini-2.5-flash"      // Google AI Studio (기본)
  | "gemini-3-flash"        // Kie.ai — 빠르고 저렴
  | "gemini-3-pro"          // Kie.ai — 고품질
  | "claude-sonnet-4-5"     // Kie.ai — Claude Sonnet 4.5
  | "kie-claude-sonnet-4-6" // Kie.ai — Claude Sonnet 4.6
  | "claude-sonnet-4-6";    // Anthropic 직접 — Claude Sonnet 4.6 최신

export interface GeminiModelOption {
  id: GeminiModelId;
  name: string;
  provider: "google" | "kie" | "anthropic";
  description: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: "kie-claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Kie.ai) ✨",
    provider: "kie",
    description: "Kie.ai — 최신 Claude 4.6, KIE_API_KEY로 사용",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Anthropic)",
    provider: "anthropic",
    description: "Anthropic 직접 — ANTHROPIC_API_KEY 필요",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5 (Kie.ai)",
    provider: "kie",
    description: "Kie.ai — Claude Sonnet 4.5, KIE_API_KEY로 사용",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Google AI Studio — 기본, 안정적",
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "kie",
    description: "Kie.ai — 최신 모델, 빠른 응답",
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "kie",
    description: "Kie.ai — 고품질, 정밀 분석",
  },
];

// ─── Claude 씬 분석 전용 타입 ─────────────────────────────────
// Claude Sonnet 4.6를 통한 엄격한 구조화 분석 결과

export interface ClaudeCharacterAnalysis {
  name: string;                    // 캐릭터 이름 (한국어)
  appearance_core: string;         // 불변 외모 특징 (의상 제외)
  outfit: {
    normalized_id: string;         // 의상 라이브러리 ID (동일 의상 → 동일 ID)
    description: string;           // 의상 상세 설명
    accessories?: string[];        // 소품 목록
  };
  expression: string;              // 표정/감정 상태
  pose?: string | null;            // 자세/행동
}

export interface ClaudeLocationAnalysis {
  canonical_category: string;      // 표준 장소 카테고리
  sub_category: string;            // 세부 장소
  description: string;             // 장소 상세 설명
}

export interface ClaudeSceneAnalysisResult {
  scene_id: string;                // epX_sceneY 형식
  characters: ClaudeCharacterAnalysis[];
  location: ClaudeLocationAnalysis;
  background_elements?: string[];
  time_of_day?: string | null;
}

// ─── API 설정 ──────────────────────────────────────────────

const VERTEX_MODEL = "gemini-2.0-flash-001";       // Vertex AI 모델 ID
const AI_STUDIO_MODEL = "gemini-2.5-flash";         // Google AI Studio 모델 ID

function getSelectedModel(): GeminiModelId {
  return (localStorage.getItem("GEMINI_MODEL") as GeminiModelId) || "gemini-2.5-flash";
}

function getVertexConfig() {
  return {
    projectId: localStorage.getItem("VERTEX_PROJECT_ID") || "",
    location: localStorage.getItem("VERTEX_LOCATION") || "us-central1",
    accessToken: localStorage.getItem("VERTEX_ACCESS_TOKEN") || "",
  };
}

function getGeminiApiKey(): string {
  return localStorage.getItem("GEMINI_API_KEY") || "";
}

function getKieApiKey(): string {
  return localStorage.getItem("KIE_API_KEY") || "";
}

function getAnthropicApiKey(): string {
  return localStorage.getItem("ANTHROPIC_API_KEY") || "";
}

/** Google AI Studio 엔드포인트 (API Key 인증 — 만료 없음) */
function getAIStudioEndpoint(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${AI_STUDIO_MODEL}:generateContent?key=${getGeminiApiKey()}`;
}

/** Vertex AI 엔드포인트 (OAuth 토큰 인증 — 1시간 만료) */
function getVertexEndpoint(): string {
  const { projectId, location } = getVertexConfig();
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
}

/** Kie.ai 엔드포인트 (OpenAI 호환 — KIE_API_KEY 인증) */
function getKieEndpoint(modelId: GeminiModelId): string {
  return `https://api.kie.ai/${modelId}/v1/chat/completions`;
}

type AuthMode = "anthropic" | "claude-kie" | "claude-kie-46" | "kie-ai" | "ai-studio" | "vertex-ai" | "none";

function detectAuthMode(): AuthMode {
  const model = getSelectedModel();
  const modelOption = GEMINI_MODELS.find(m => m.id === model);

  // Kie.ai Claude Sonnet 4.6 — 새로운 /claude/v1/messages 엔드포인트
  if (model === "kie-claude-sonnet-4-6") {
    const kieKey = getKieApiKey();
    if (kieKey && kieKey.length > 10) return "claude-kie-46";
  }

  // Anthropic 직접 연결 — claude-sonnet-4-6
  if (model === "claude-sonnet-4-6") {
    const anthropicKey = getAnthropicApiKey();
    if (anthropicKey && anthropicKey.length > 10) return "anthropic";
  }

  // Claude Sonnet 4.5 via Kie.ai
  if (model === "claude-sonnet-4-5") {
    const kieKey = getKieApiKey();
    if (kieKey && kieKey.length > 10) return "claude-kie";
  }

  // Kie.ai Gemini 모델
  if (modelOption?.provider === "kie") {
    const kieKey = getKieApiKey();
    if (kieKey && kieKey.length > 10) return "kie-ai";
  }

  // Google AI Studio
  const apiKey = getGeminiApiKey();
  if (apiKey && apiKey.length > 10) return "ai-studio";

  // Vertex AI
  const { projectId, accessToken } = getVertexConfig();
  if (projectId && accessToken && accessToken.startsWith("ya29.")) return "vertex-ai";

  return "none";
}

// ─── Claude Sonnet 4.6 씬 분석 (구조화 전용) ─────────────────
// Kie.ai Claude Sonnet 4.6: 외모 코어 / 의상 normalized_id / 장소 canonical 엄격 추출

const KIE_CLAUDE_MODEL = "claude-sonnet-4-5";
const KIE_CLAUDE_ENDPOINT = `https://api.kie.ai/${KIE_CLAUDE_MODEL}/v1/chat/completions`;

/** Claude 씬 분석 시스템 프롬프트 (사용자 제공) */
const CLAUDE_SCENE_ANALYSIS_SYSTEM = `너는 웹툰 제작 전문 구조화 분석 AI다.
주어진 스토리 씬 설명을 반드시 아래 규칙에 따라 정확히 JSON으로만 추출해야 한다.
【절대 규칙】
1. appearance_core에는 얼굴, 체형, 머리, 피부, 키, 눈/코/입 특징 등 **불변 특징만** 적고, 의상·액세서리·현재 입고 있는 옷은 절대 포함하지 말 것.
2. 【캐릭터 이름 규칙 — 최우선】
   - characters[].name은 반드시 **기존 등록된 캐릭터 이름**을 그대로 사용하라.
   - 성(姓)을 붙이지 말고 **이름(first name)만** 사용하라. 예) "박서린" → "서린", "이세은" → "세은"
   - 기존 등록된 캐릭터가 "서린"이면 씬에서 "박서린", "서린이" 등으로 불려도 반드시 "서린"으로 표기.
   - 의상이 달라도 같은 캐릭터는 절대 새 캐릭터로 생성하지 말 것. 의상은 outfit 필드에서 구분한다.
   - 영어 로마자 표기 절대 금지.
3. 【의상 ID 규칙 — 필수】
   - 기존 등록된 의상 ID가 있으면 **반드시 그 ID를 그대로 사용**하라. 새로 만들지 말 것.
   - 예) 레퍼런스 갤러리에 "서린_showertowel"이 있고, 씬에서 "타월을 두른 서린"이 나오면 → normalized_id는 "서린_showertowel"
   - ⚠️ 씬에 "의상 A", "의상 B", "의상 C" 같은 **기호적 라벨**이 있으면 이를 무시하고, 해당 의상의 시각적 특징(색상, 형태)을 보고 기존 등록 의상 ID와 매칭하라.
   - 예) 씬에 "의상 C - 검은 수트"라고 적혀있고, 갤러리에 "서준_black_suit"이 있으면 → "서준_black_suit"을 사용
   - 기존 등록된 의상 ID가 없는 새로운 의상인 경우에만 '{이름}_{의상특징}' 형식으로 생성. "의상A", "의상C" 같은 기호를 ID에 절대 사용하지 말 것.
   - 형식: 소문자+underscore만 사용, 캐릭터 이름(성 제외)을 맨 앞에 붙임.
   - 같은 의상이 여러 장면에 나와도 항상 동일한 ID를 사용.
4. 【장소 규칙 — 필수】
   - 기존 등록된 장소가 있으면 **반드시 그 장소의 sub_category 이름을 그대로 사용**하라.
   - "고급 아파트", "아파트", "집" 등 같은 장소의 다른 표현이면 기존 등록된 장소와 동일하게 매핑하라.
   - 예) 기존에 "세은·윤재 아파트 안방"이 등록되어 있고, 씬에 "고급 아파트 침실"이 나오면 → sub_category는 "세은·윤재 아파트 안방"
   - canonical_category는 반드시 아래 목록 중 하나로만 선택:
   apartment_interior, cafe, office, street, school, park, hospital, rooftop, subway, convenience_store, classroom, bedroom, living_room, kitchen, bathroom, balcony, rooftop_garden, forest, beach, mountain, etc.
   (새로운 카테고리가 필요하면 가장 가까운 것으로 매핑)
5. 출력은 **반드시 아래 JSON 스키마 그대로만** 반환하고, panels/dialogue/narration/sound_effects 같은 추가 필드는 절대 넣지 말 것. 마크다운 코드블록도 금지.
6. 씬에 등장하는 캐릭터가 없으면 characters를 빈 배열 []로 반환.

【출력 JSON 스키마 — 이 형식만 허용됨】
{
  "scene_id": "<scene_id 그대로>",
  "characters": [
    {
      "name": "캐릭터 한국어 이름",
      "appearance_core": "불변 외모 특징 (의상 제외, 1~2문장)",
      "outfit": {
        "normalized_id": "한국어이름_소문자_언더스코어_의상id",
        "description": "의상 설명 (1문장)",
        "accessories": []
      },
      "expression": "감정 상태 (1단어)",
      "pose": "자세/행동 (1단어)"
    }
  ],
  "location": {
    "canonical_category": "장소 카테고리",
    "sub_category": "세부 장소명",
    "description": "장소 설명 (1~2문장)"
  },
  "background_elements": [],
  "time_of_day": "morning|afternoon|evening|night"
}`;

/** Claude 씬 분석 유저 프롬프트 빌더 */
function buildClaudeSceneAnalysisPrompt(
  sceneText: string,
  sceneId: string,
  existingCharacters: Character[],
  existingLocations: Location[],
  existingOutfitIds?: string[]
): string {
  const charContext = existingCharacters.length > 0
    ? `\n\n[기존 등록된 캐릭터 — 이 이름을 반드시 그대로 사용할 것]\n${existingCharacters
        .map(c => `- ${c.name}: ${c.characterCore || c.defaultPromptSnippet}`)
        .join("\n")}`
    : "";

  const locContext = existingLocations.length > 0
    ? `\n\n[기존 등록된 장소 — canonical_category 참고용]\n${existingLocations
        .map(l => `- ${l.name}${l.locationCanonical ? ` [${l.locationCanonical}]` : ""}`)
        .join("\n")}`
    : "";

  const outfitContext = existingOutfitIds && existingOutfitIds.length > 0
    ? `\n\n[기존 등록된 의상 ID — 같은 의상이면 반드시 이 ID를 그대로 사용할 것]\n${existingOutfitIds.map(id => `- ${id}`).join("\n")}`
    : "";

  return `아래 씬을 분석하여 JSON만 반환하라.

scene_id는 "${sceneId}"로 고정.
${charContext}${locContext}${outfitContext}

[씬 설명]
${sceneText}`;
}

/** Kie.ai Claude Sonnet 4.6 API 호출 */
async function callKieClaudeSonnet(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const kieKey = getKieApiKey();
  if (!kieKey) {
    throw new Error("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력해주세요.");
  }

  // Kie.ai Claude: model is determined by URL path — do NOT include in body
  const body = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: 4096,
    stream: false,
  };

  const response = await fetch(KIE_CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${kieKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || err?.message || err?.msg || response.statusText;
    throw new Error(`Kie.ai Claude Sonnet 4.6 오류 (${response.status}): ${msg}`);
  }

  const data = await response.json();
  console.log("[Claude] 응답 데이터:", JSON.stringify(data).slice(0, 300));

  // Kie.ai는 HTTP 200으로 에러를 반환하는 경우가 있음 → body 재검사
  if (data?.code >= 400 || (data?.msg && !data?.choices && !data?.content)) {
    const kieMsg = data?.msg || data?.error?.message || JSON.stringify(data);
    throw new Error(`Kie.ai Claude 오류: "${kieMsg}". Kie.ai 구독에서 Claude 모델 접근 권한을 확인해주세요.`);
  }

  // OpenAI 호환 포맷: choices[0].message.content
  const openaiText = data?.choices?.[0]?.message?.content;
  // Anthropic native 포맷: content[0].text
  const anthropicText = Array.isArray(data?.content)
    ? data.content.find((c: any) => c.type === "text")?.text
    : null;

  const text = openaiText || anthropicText;
  if (!text) {
    console.error("[Claude] 예상치 못한 응답 구조:", JSON.stringify(data));
    throw new Error(`Kie.ai Claude Sonnet 4.5 빈 응답. 구조: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return text;
}

// ─── Kie.ai Claude Sonnet 4.6 API (/claude/v1/messages) ──────
// 기존 4.5(/claude-sonnet-4-5/v1/chat/completions)와 완전히 다른 엔드포인트

const KIE_CLAUDE_46_ENDPOINT = "https://api.kie.ai/claude/v1/messages";

/** Kie.ai Claude Sonnet 4.6 단일 시도 */
async function callKieClaudeSonnet46Once(
  systemPrompt: string,
  userPrompt: string,
  kieKey: string
): Promise<string> {
  const response = await fetch(KIE_CLAUDE_46_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${kieKey}`,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      stream: false,
      // Kie.ai Claude 4.6는 max_tokens 미지원 (공식 문서에 없음) → 제거
      // Kie.ai Claude는 별도 system 필드를 지원하지 않음 → user 메시지에 통합
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || err?.msg || response.statusText;
    throw new Error(`Kie.ai Claude 4.6 오류 (${response.status}): ${msg}`);
  }

  const data = await response.json();
  console.log("[Kie Claude 4.6] 응답:", JSON.stringify(data).slice(0, 300));

  // body-level 에러 감지: HTTP 200이지만 code>=400 or error 필드 있음
  if (
    (data?.code != null && data.code >= 400) ||
    data?.type === "error" ||
    (data?.error && !data?.content)
  ) {
    const msg = data?.error?.message || data?.msg || JSON.stringify(data);
    throw new Error(`Kie.ai Claude 4.6 서버 오류 (${data?.code ?? "?"}): ${msg}`);
  }

  // Anthropic native 포맷: content[].text
  const text = Array.isArray(data?.content)
    ? data.content.find((c: any) => c.type === "text")?.text
    : null;

  if (!text) {
    console.error("[Kie Claude 4.6] 예상치 못한 응답:", JSON.stringify(data));
    throw new Error(`Kie.ai Claude 4.6 빈 응답. 구조: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return text;
}

/** Kie.ai Claude Sonnet 4.6 API 호출 — 서버 5xx 에러 시 최대 2회 재시도, 이후 4.5 자동 폴백 */
async function callKieClaudeSonnet46(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const kieKey = getKieApiKey();
  if (!kieKey) {
    throw new Error("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력해주세요.");
  }

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callKieClaudeSonnet46Once(systemPrompt, userPrompt, kieKey);
    } catch (err: any) {
      lastError = err;
      const msg: string = err?.message || "";
      const isServerError = msg.includes("서버 오류") || msg.includes("500") || msg.includes("Server exception") || msg.includes("try again");
      if (!isServerError) throw err;  // 4xx 인증 오류 등은 재시도 없이 즉시 throw
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.warn(`[Kie Claude 4.6] 서버 오류 — ${delay / 1000}초 후 재시도 (${attempt}/${MAX_RETRIES}):`, msg);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // 재시도 소진 → 4.5 자동 폴백
  console.warn("[Kie Claude 4.6] 재시도 소진 → Claude Sonnet 4.5로 자동 폴백");
  return callKieClaudeSonnet(systemPrompt, userPrompt);
}

/** panels 구조 → ClaudeSceneAnalysisResult 평탄화 */
function flattenPanelsToSceneResult(raw: any, sceneId: string): ClaudeSceneAnalysisResult | null {
  if (!raw?.panels || !Array.isArray(raw.panels)) return null;
  // 모든 패널에서 캐릭터/장소 합산
  const charMap = new Map<string, ClaudeCharacterAnalysis>();
  let location: ClaudeLocationAnalysis | null = null;
  let timeOfDay: string | null = null;

  for (const panel of raw.panels) {
    // 장소: 첫 번째 유효한 패널에서 가져오기
    if (!location && panel.location) {
      location = {
        canonical_category: panel.location.canonical_category || panel.location.name || "apartment_interior",
        sub_category: panel.location.name || panel.location.sub_category || "",
        description: panel.location.description || "",
      };
    }
    if (!timeOfDay && panel.time_of_day) timeOfDay = panel.time_of_day;
    // 캐릭터: name 기준으로 중복 제거
    for (const c of (panel.characters || [])) {
      const name = c.name || c.id;
      if (!name) continue;
      if (!charMap.has(name)) {
        charMap.set(name, {
          name,
          appearance_core: c.appearance_core || c.description || "",
          outfit: {
            normalized_id: c.outfit?.normalized_id || "default_outfit",
            description: c.outfit?.description || c.outfit_description || "",
            accessories: c.outfit?.accessories || [],
          },
          expression: c.expression || c.emotion || "neutral",
          pose: c.pose || c.action || null,
        });
      }
    }
  }

  return {
    scene_id: raw.scene_id || sceneId,
    characters: Array.from(charMap.values()),
    location: location || { canonical_category: "apartment_interior", sub_category: "", description: "" },
    background_elements: [],
    time_of_day: timeOfDay,
  };
}

/** Kie.ai Claude Sonnet 4.6로 씬 분석 */
async function analyzeSceneWithKieClaudeSonnet46(
  sceneText: string,
  existingCharacters: Character[],
  existingLocations: Location[],
  sceneId: string,
  existingOutfitIds: string[] = []
): Promise<GeminiSceneAnalysis> {
  const userPrompt = buildClaudeSceneAnalysisPrompt(sceneText, sceneId, existingCharacters, existingLocations, existingOutfitIds);
  const rawResponse = await callKieClaudeSonnet46(CLAUDE_SCENE_ANALYSIS_SYSTEM, userPrompt);
  try {
    const parsed = extractJSON<any>(rawResponse, "[Kie Claude 4.6] 씬 분석");

    // panels 구조로 잘못 반환된 경우 평탄화
    const result: ClaudeSceneAnalysisResult =
      parsed.panels ? (flattenPanelsToSceneResult(parsed, sceneId) ?? parsed) : parsed;

    console.log(`[Kie Claude 4.6] 씬 분석 완료: ${result.characters?.length ?? 0}명, scene_id=${result.scene_id}`);
    return mapClaudeResultToGemini(result, sceneText, existingCharacters.map(c => c.name), existingOutfitIds);
  } catch (e: any) {
    console.error("[Kie Claude 4.6] JSON 파싱 실패:", rawResponse.slice(0, 800));
    throw new Error(`Kie.ai Claude 4.6 응답 파싱 실패: ${e.message}`);
  }
}

/** Claude 분석 결과 → GeminiSceneAnalysis 변환
 *  패널은 씬 텍스트 줄 단위로 자동 생성 (Claude 결과에 패널 없음) */
function mapClaudeResultToGemini(
  claude: ClaudeSceneAnalysisResult,
  sceneText: string,
  existingCharNames: string[] = [],
  existingOutfitIds: string[] = []
): GeminiSceneAnalysis {
  const locationName = `${claude.location.sub_category || claude.location.canonical_category}`;
  const geminiLocation: GeminiLocationAnalysis = {
    name: locationName,
    description: claude.location.description,
    locationCanonical: claude.location.canonical_category,
    timeOfDay: claude.time_of_day || "afternoon",
    weather: "clear",
    mood: "bright",
    promptSnippet: claude.location.description,
  };

  // ── 캐릭터 이름 정규화: 기존 갤러리 이름 우선 사용 ──
  const registeredCharNames = existingCharNames;
  const registeredOutfitIds = existingOutfitIds;

  // 캐릭터 이름 매칭 헬퍼: "박서린" → 갤러리의 "서린"
  const matchCharName = (claudeName: string): string => {
    // 정확 일치
    if (registeredCharNames.includes(claudeName)) return claudeName;
    // 갤러리 이름이 분석 이름의 부분문자열 (성 제외 매칭)
    const found = registeredCharNames.find(rn =>
      claudeName.endsWith(rn) || claudeName.startsWith(rn) || rn.endsWith(claudeName) || rn.startsWith(claudeName)
    );
    if (found) return found;
    return claudeName;
  };

  // 의상 ID 퍼지 매칭 헬퍼: Claude가 만든 ID → 기존 갤러리 ID
  const matchOutfitId = (claudeOutfitId: string, charName: string): string => {
    // 정확 일치
    if (registeredOutfitIds.includes(claudeOutfitId)) return claudeOutfitId;

    // "의상" 기호 라벨 감지 (의상A, 의상_C, 의상 B 등 → 무효)
    const isGenericLabel = /의상[_\s]*[A-Za-z0-9]/.test(claudeOutfitId);

    // 캐릭터 이름 + 키워드 부분 매칭
    const claudeKeywords = claudeOutfitId.toLowerCase().split("_").filter(k => k.length > 1);
    let bestMatch = "";
    let bestScore = 0;
    const charNameLower = charName.toLowerCase();

    for (const regId of registeredOutfitIds) {
      const regLower = regId.toLowerCase();
      // 같은 캐릭터의 의상인지 확인
      if (!regLower.includes(charNameLower) && !charNameLower.includes(regLower.split("_")[0])) continue;
      // 키워드 매칭 점수
      const regKeywords = regLower.split("_").filter(k => k.length > 1);
      let score = 0;
      for (const ck of claudeKeywords) {
        if (ck === "의상") continue; // "의상" 키워드는 무시
        for (const rk of regKeywords) {
          if (ck === rk) score += 3;
          else if (ck.includes(rk) || rk.includes(ck)) score += 2;
        }
      }
      if (score > bestScore) { bestScore = score; bestMatch = regId; }
    }

    // 키워드 매칭 성공
    if (bestScore >= 2 && bestMatch) {
      console.log(`[Outfit Match] "${claudeOutfitId}" → "${bestMatch}" (score: ${bestScore})`);
      return bestMatch;
    }

    // fallback: 기호 라벨이거나 매칭 실패 시 → 해당 캐릭터의 갤러리 의상 중 첫 번째 사용
    if (isGenericLabel || bestScore === 0) {
      const charOutfit = registeredOutfitIds.find(id =>
        id.toLowerCase().startsWith(charNameLower + "_") || id.toLowerCase().startsWith(charNameLower)
      );
      if (charOutfit) {
        console.log(`[Outfit Fallback] "${claudeOutfitId}" → "${charOutfit}" (generic label or no match, using first gallery outfit for ${charName})`);
        return charOutfit;
      }
    }

    return claudeOutfitId;
  };

  const characters: GeminiCharacterAnalysis[] = claude.characters.map(c => {
    const normalizedName = matchCharName(c.name);
    const normalizedOutfitId = matchOutfitId(c.outfit.normalized_id, normalizedName);
    return {
      name: normalizedName,
      description: c.appearance_core,
      characterCore: c.appearance_core,
      emotion: c.expression || "neutral",
      outfit: c.outfit.description,
      outfitLabel: normalizedOutfitId.replace(/_/g, " "),
      outfitNormalizedId: normalizedOutfitId,
      action: c.pose || "standing",
      angle: "front",
      promptSnippet: normalizedName,
      accessories: c.outfit.accessories?.join(", ") || "none",
    };
  });

  // ── 씬 단위(#N) 분리 → 패널 생성 ──
  // #N 마커가 있으면 씬 블록 단위로, 없으면 줄 단위 폴백
  const allCharNames = claude.characters.map(c => c.name);
  const dialogueRe = /^([가-힣a-zA-Z]{1,10})\s*[:：]\s*(?:\([^)]*\)\s*)?[""]?(.+?)[""]?\s*$/;
  // SFX 패턴: *별표 감싸기* 또는 (짧은 의성어/의태어!?~) — (의상 A), (놀라며) 같은 지문은 제외
  const sfxRe = /\*([가-힣a-zA-Z!?…]+(?:\s*[가-힣a-zA-Z!?…]+)*)\*|[（(]([가-힣]{1,4}[!?…~]+)[)）]/g;

  // 대사/SFX 추출 헬퍼
  function extractDialogueAndSfx(text: string): {
    visualLines: string[];
    dialogues: Array<{ character: string; text: string }>;
    sfx: string[];
  } {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const visualLines: string[] = [];
    const dialogues: Array<{ character: string; text: string }> = [];
    const sfx: string[] = [];

    for (const line of lines) {
      const dlgMatch = line.match(dialogueRe);
      if (dlgMatch) {
        dialogues.push({ character: dlgMatch[1].trim(), text: dlgMatch[2].trim() });
        continue;  // 대사는 이미지 프롬프트에서 제외
      }
      // SFX 추출
      let lineCopy = line;
      let sfxMatch;
      sfxRe.lastIndex = 0;
      while ((sfxMatch = sfxRe.exec(line)) !== null) {
        const sfxText = (sfxMatch[1] || sfxMatch[2] || "").trim();
        if (sfxText) sfx.push(sfxText);
        lineCopy = lineCopy.replace(sfxMatch[0], "").trim();
      }
      if (lineCopy.length > 0) {
        visualLines.push(lineCopy);
      }
    }
    return { visualLines, dialogues, sfx };
  }

  // #N 마커로 씬 블록 분리
  const rawLines = sceneText.split("\n");
  const hasSceneMarkers = rawLines.some(l => /^#\d+/.test(l.trim()));
  interface SceneBlock { id: string; text: string; }
  const sceneBlocks: SceneBlock[] = [];

  if (hasSceneMarkers) {
    let currentBlock: SceneBlock | null = null;
    for (const line of rawLines) {
      const trimmed = line.trim();
      const markerMatch = trimmed.match(/^#(\d+)\s*(.*)/);
      if (markerMatch) {
        if (currentBlock) sceneBlocks.push(currentBlock);
        currentBlock = { id: `#${markerMatch[1]}`, text: markerMatch[2] || "" };
      } else if (trimmed.length > 0 && !trimmed.startsWith("//")) {
        if (currentBlock) {
          currentBlock.text += (currentBlock.text ? "\n" : "") + trimmed;
        } else {
          currentBlock = { id: "#0", text: trimmed };
        }
      }
    }
    if (currentBlock) sceneBlocks.push(currentBlock);
  } else {
    // 폴백: 줄 단위 (기존 동작 유지)
    const lines = rawLines
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));
    lines.forEach((line, i) => sceneBlocks.push({ id: `line_${i}`, text: line }));
  }

  const panels: GeminiPanelSuggestion[] = sceneBlocks.map((block, i) => {
    const { visualLines, dialogues, sfx } = extractDialogueAndSfx(block.text);
    const visualText = visualLines.join(" ");

    // 해당 블록에 등장하는 캐릭터 감지
    const blockChars = allCharNames.filter(n => block.text.includes(n));
    const charOutfits: Record<string, string> = {};
    blockChars.forEach(n => {
      const c = claude.characters.find(ch => ch.name === n);
      if (c) charOutfits[n] = c.outfit.normalized_id;
    });

    // 첫 패널은 wide shot, 나머지는 medium shot
    const cameraAngle = i === 0 ? "wide shot" : "medium shot";

    // 씬 타입 결정
    const hasChars = blockChars.length > 0 || allCharNames.length > 0;
    const panel_type: PanelType = !hasChars ? "narration"
      : visualLines.length === 0 && dialogues.length > 0 ? "dialogue"
      : "visual";

    // aiPrompt: 대사/SFX 제외, 순수 비주얼만
    const charTokens = (blockChars.length > 0 ? blockChars : allCharNames)
      .map(n => {
        const c = claude.characters.find(ch => ch.name === n);
        return c ? `${n}(${c.expression || "neutral"}, ${c.pose || "standing"})` : n;
      })
      .join(", ");
    const aiPrompt = `webtoon panel, ${cameraAngle}. ${locationName}. ${charTokens}. ${visualText || block.text}. ${claude.time_of_day || "afternoon"} lighting.`;

    return {
      panelNumber: i + 1,
      description: block.text,
      location: locationName,
      locationCanonical: claude.location.canonical_category,
      characters: blockChars.length > 0 ? blockChars : allCharNames,
      characterOutfits: charOutfits,
      cameraAngle,
      emotion: "neutral",
      composition: visualText || block.text,
      aiPrompt,
      notes: "",
      panel_type,
      sceneId: block.id,
      dialogues: dialogues.length > 0 ? dialogues : undefined,
      sfx: sfx.length > 0 ? sfx : undefined,
    };
  });

  return {
    characters,
    location: geminiLocation,
    locations: [geminiLocation],
    panels,
    sceneOverview: `${sceneBlocks.length}개 장면, ${claude.characters.length}명 등장 — ${locationName}`,
    suggestedPromptStyle: "korean webtoon style, detailed line art, clean coloring",
  };
}

/** Claude Sonnet 4.6로 씬 분석 (구조화 JSON 추출) */
async function analyzeSceneWithClaudeSonnet(
  sceneText: string,
  existingCharacters: Character[],
  existingLocations: Location[],
  sceneId: string = "ep1_scene1",
  existingOutfitIds: string[] = []
): Promise<GeminiSceneAnalysis> {
  const userPrompt = buildClaudeSceneAnalysisPrompt(
    sceneText,
    sceneId,
    existingCharacters,
    existingLocations,
    existingOutfitIds
  );

  const rawResponse = await callKieClaudeSonnet(CLAUDE_SCENE_ANALYSIS_SYSTEM, userPrompt);

  try {
    const parsed = extractJSON<ClaudeSceneAnalysisResult>(rawResponse, "[Kie Claude] 씬 분석");
    console.log(`[Claude Sonnet 4.6] 씬 분석 완료: ${parsed.characters?.length ?? 0}명, scene_id=${parsed.scene_id}`);
    return mapClaudeResultToGemini(parsed, sceneText, existingCharacters.map(c => c.name), existingOutfitIds);
  } catch (e: any) {
    console.error("[Claude Sonnet 4.6] 응답 파싱 실패:", rawResponse.slice(0, 800));
    throw new Error(`Claude Sonnet 4.6 응답 파싱 실패: ${e.message}`);
  }
}

// ─── 씬 분석 프롬프트 (핵심) ────────────────────────────────

function buildSceneAnalysisPrompt(
  sceneText: string,
  existingCharacters: Character[],
  existingLocations: Location[]
): string {
  const charContext = existingCharacters.length > 0
    ? `\n\n[기존 등록된 캐릭터]\n${existingCharacters.map(c => `- ${c.name}: ${c.characterCore ? `[Core] ${c.characterCore} ` : ""}${c.defaultPromptSnippet}`).join("\n")}`
    : "";

  const locContext = existingLocations.length > 0
    ? `\n\n[기존 등록된 장소]\n${existingLocations.map(l => `- ${l.name}${l.locationCanonical ? ` [${l.locationCanonical}]` : ""}: ${l.defaultPromptSnippet}`).join("\n")}`
    : "";

  return `당신은 웹툰 제작 전문 AI 어시스턴트이자 마스터 프로듀서입니다. 아래 씬 설명을 분석하여 JSON 형식으로 결과를 반환해주세요.
캐릭터의 외모, 의상, 소품은 시각적 일관성 유지에 매우 중요합니다. 캐릭터가 모든 패널에서 즉시 구별될 수 있도록 매우 상세하게 분석해주세요.

[분석 요청 씬 설명]
${sceneText}
${charContext}${locContext}

다음 JSON 형식으로 정확히 응답해주세요. 다른 텍스트 없이 JSON만 반환하세요:

{
  "characters": [
    {
      "name": "캐릭터 이름 (한글)",
      "description": "외모, 특징 설명 (한국어)",
      "emotion": "joy|sadness|anger|surprise|fear|neutral|love 중 하나",
      "characterCore": "Character's PERMANENT physical appearance WITHOUT any clothing. English only. Include: (1) HAIR: exact color, length, style, parting, bangs; (2) EYES: color, shape, eyelid; (3) SKIN: tone; (4) BUILD: height, body type; (5) FACE: shape, jawline, eyebrows, nose, lips, any marks (moles, scars, dimples). This field stays IDENTICAL across all panels regardless of outfit changes.",
      "outfit": "EXTREMELY detailed CLOTHING ONLY for this scene in English. MUST specify: (1) TOP: exact garment type, color and material (e.g. cream cashmere fitted turtleneck); (2) BOTTOM: type, color, length (e.g. straight-leg black denim jeans); (3) OUTER layer if any (jacket, cardigan, coat — type, color, length, open/closed); (4) FOOTWEAR: type and color (e.g. white leather sneakers). Do NOT include accessories here.",
      "outfitLabel": "Short 2-4 word label summarizing the outfit style in English. Examples: 'casual hoodie', 'formal suit', 'school uniform', 'leather jacket look', 'cozy homewear', 'office attire', 'summer dress'. Must be concise and descriptive enough to distinguish from other outfits.",
      "outfitNormalizedId": "Unique outfit library ID in format: '{character_name_romanized}_outfit_{keyword}'. Use lowercase, underscores only, no spaces. Examples: 'jiho_outfit_school_uniform', 'minji_outfit_black_suit', 'seho_outfit_casual_hoodie'. Must be consistent across panels where the same outfit appears.",
      "accessories": "ALL accessories and props the character wears/carries, in English. Include: glasses (frame shape and color), watch, necklace, earrings, rings, bracelets, bag/purse (type and color), belt, hat, scarf, hair accessories, phone, etc. Be specific about style and color for each item. If none, write 'none'.",
      "action": "standing|sitting|running|walking|talking|smiling|crying|reading|entering|leaving 등",
      "angle": "front|side|back|three-quarter 중 하나",
      "appearance": "EXTREMELY detailed physical description in English (same as characterCore but may be more verbose for this panel context)",
      "distinctFeatures": "English list of 3-5 MOST distinctive visual traits that differentiate this character from every other character (e.g. 'only character with red hair, tallest character, always wears round glasses, has a visible scar on left cheek')",
      "refPrompt": "EXTREMELY detailed English prompt for generating a DISTINCTIVE character reference sheet. MUST follow this structure: 'Full body character reference sheet, front-facing T-pose, clean white background. [NAME] is a [age] [gender] [height/build]. Face: [face shape, jawline, eyebrow shape, eye color+shape+eyelid, nose shape, lip shape]. Hair: [exact color, length, style, parting, bangs, accessories]. Outfit: [complete top with color+material, bottom with color+style, outer layer if any, footwear with color+style, every accessory]. Unique traits: [features making this character visually distinct]. This character must be INSTANTLY recognizable and look IDENTICAL across all panels. Maintain strong visual identity.'",
      "promptSnippet": "이 캐릭터를 그릴 때 사용할 영어 프롬프트. 반드시 외모+의상+소품 설명을 포함 (예: 'young woman with long black hair, almond eyes, fair skin, wearing navy blazer over white blouse, plaid skirt, carrying leather bag, round silver glasses')",
      "dialogueSummary": "이 씬에서의 주요 대사 요약 (없으면 null)"
    }
  ],
  "locations": [
    {
      "name": "장소 이름 (한글, 구체적인 공간 단위)",
      "description": "장소 상세 설명 (한글)",
      "locationCanonical": "One of the standard canonical category keys: apartment_living_room | apartment_bedroom | apartment_kitchen | house_exterior | school_classroom | school_hallway | school_rooftop | school_gym | school_library | office_interior | office_meeting_room | office_lobby | cafe_interior | restaurant_interior | convenience_store | shopping_mall | park_daytime | park_night | street_urban | street_suburban | alley | forest | beach | mountain | subway_interior | subway_station | bus_interior | car_interior | hospital_corridor | gym_fitness | rooftop_urban | fantasy_castle | fantasy_forest. Pick the closest match, or use 'unknown' if none fits.",
      "timeOfDay": "morning|afternoon|evening|night 중 하나",
      "weather": "clear|cloudy|rain|snow 중 하나",
      "mood": "bright|dark|warm|cold|tense|peaceful 중 하나",
      "promptSnippet": "장소를 그릴 때 사용할 영어 프롬프트"
    }
  ],
  "panels": [
    {
      "panelNumber": 1,
      "description": "이 패널의 장면 설명 (한글, 구체적으로)",
      "location": "이 패널의 구체적 장소 이름 (locations 배열의 name과 일치해야 함)",
      "locationCanonical": "이 패널 장소의 canonical 카테고리 (locations 배열의 locationCanonical과 일치해야 함)",
      "characters": ["등장하는 캐릭터 이름들"],
      "characterOutfits": { "캐릭터이름": "outfitNormalizedId (characters 배열의 값과 일치해야 함)" },
      "cameraAngle": "wide shot|medium shot|close-up|extreme close-up|over shoulder|bird's eye|low angle|dutch angle 중 하나",
      "emotion": "이 패널의 전체적인 감정 톤",
      "composition": "구도 설명 (예: '왼쪽에 민지, 오른쪽에 서호가 마주보는 구도')",
      "aiPrompt": "webtoon style, [영어로 된 완성된 이미지 생성 프롬프트]. high quality, detailed, korean webtoon art style",
      "notes": "연출 참고 사항"
    }
  ],
  "sceneOverview": "씬 전체 요약 (한글, 1-2문장)",
  "suggestedPromptStyle": "이 씬에 어울리는 아트 스타일 설명 (영어)"
}

[의상 라이브러리 규칙 — 반드시 준수]
1. outfitNormalizedId는 씬 전체에서 동일한 의상이면 반드시 동일한 값을 사용합니다
   - 예: 지호가 씬 내내 교복을 입으면 모든 패널에서 "jiho_outfit_school_uniform" 동일 사용
2. characterCore는 의상과 무관한 '기본 외형'만 포함합니다 (머리색, 눈, 피부, 체형, 얼굴형)
   - 교복을 입든 정장을 입든 characterCore 값은 항상 동일해야 합니다
3. characterOutfits는 패널에 등장하는 모든 캐릭터에 대해 outfitNormalizedId를 명시합니다

[장소 분석 핵심 규칙 — 반드시 준수]
1. 같은 건물이라도 기능이 다른 공간은 반드시 별도 장소로 분리합니다
   - 예: "고급 아파트"가 배경이면 → "고급 아파트 거실", "고급 아파트 주방", "고급 아파트 안방", "고급 아파트 욕실" 등 각각 분리
   - 예: "학교"가 배경이면 → "교실", "복도", "운동장", "옥상" 등 각각 분리
   - 예: "카페"가 배경이면 → 카페 하나로 유지 (단일 공간)
2. 씬에서 직접 등장하는 공간만 포함합니다 (언급만 되고 등장하지 않는 곳은 제외)
3. 각 장소의 promptSnippet은 해당 공간만의 고유한 시각 특징을 포함해야 합니다
4. panels의 각 패널에서 해당 장면이 벌어지는 구체적 장소 이름을 "location" 필드로 지정합니다

[패널 분할 핵심 규칙 — 반드시 준수]
1. 사용자가 입력한 씬 설명의 각 줄(문장)은 하나의 독립된 장면입니다
2. 각 장면은 기본적으로 1개의 패널로 변환합니다 (원문을 최대한 유지)
3. 단, 한 장면 안에 여러 동작/감정 변화가 포함된 경우에만 2-3개 패널로 분리합니다
   - 예: "민지가 문을 열고 들어서며 놀란 표정으로 서호를 바라본다" → 2패널 (문 열기 + 놀란 표정)
   - 예: "서호가 웃는다" → 1패널 (단순 동작이므로 분리 불필요)
4. 대사 줄("캐릭터이름: 대사")은 해당 대사의 맥락 장면 패널에 포함합니다 (별도 패널 불필요)
5. 결과적으로 입력 씬의 장면 수 N개에 대해 N ~ N+10% 개의 패널이 생성되어야 합니다
6. 절대로 장면을 생략하거나 합치지 마세요. 모든 장면이 패널에 반영되어야 합니다

[연출 지침]
- 첫 패널은 wide shot으로 장소 전체를 소개
- 감정 변화가 큰 순간은 close-up으로 처리
- 마지막 패널은 감정적 여운을 남기는 구도
- aiPrompt는 반드시 영어로, webtoon style과 high quality 포함
- 캐릭터 promptSnippet은 해당 캐릭터의 시각적 특징을 영어로 상세히
- 기존 등록된 캐릭터가 있다면 해당 정보를 활용하여 일관성 유지`;
}

// ─── 레퍼런스 자동 태깅 프롬프트 ────────────────────────────

function buildAutoTagPrompt(
  imageDescription: string,
  knownCharacters: string[],
  knownLocations: string[]
): string {
  return `이미지를 분석하여 레퍼런스 태그를 JSON으로 반환해주세요.

[이미지 설명]
${imageDescription}

[알려진 캐릭터]: ${knownCharacters.join(", ") || "없음"}
[알려진 장소]: ${knownLocations.join(", ") || "없음"}

다음 JSON 형식으로 응답:
{
  "characterTags": {
    "emotion": "joy|sadness|anger|surprise|fear|neutral",
    "outfit": "복장 설명",
    "angle": "front|side|back|three-quarter",
    "action": "행동 설명"
  },
  "locationTags": {
    "timeOfDay": "morning|afternoon|evening|night",
    "weather": "clear|cloudy|rain|snow",
    "mood": "bright|dark|warm|cold|tense|peaceful"
  },
  "suggestedPromptSnippet": "이 이미지를 재현하기 위한 영어 프롬프트",
  "confidence": 0.0~1.0
}`;
}

// ─── JSON 추출 헬퍼 ────────────────────────────────────────────

/**
 * AI 응답에서 JSON 객체를 강력하게 추출합니다.
 * 1) 마크다운 코드블록(```json ... ```) 제거
 * 2) 첫 { 부터 마지막 } 까지 슬라이스
 * 3) 잘린 경우 마지막 완전한 } 위치를 역추적
 */
function extractJSON<T>(raw: string, context: string): T {
  // 코드블록 제거 (모든 변형 처리)
  let cleaned = raw
    .replace(/^```(?:json)?\r?\n?/gm, "")
    .replace(/^```\r?\n?/gm, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error(`${context}: JSON 시작 { 없음`);

  cleaned = cleaned.slice(start);

  // 완전한 JSON이면 바로 파싱
  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    // 응답이 잘렸을 때: 마지막 } 를 역추적하며 닫힌 JSON 찾기
    let end = cleaned.lastIndexOf("}");
    while (end > 0) {
      try {
        return JSON.parse(cleaned.slice(0, end + 1)) as T;
      } catch (_2) {
        end = cleaned.lastIndexOf("}", end - 1);
      }
    }
    throw new Error(`${context}: JSON 파싱 불가 (잘린 응답 or 형식 오류)`);
  }
}

// ─── Anthropic 직접 API 호출 (claude-sonnet-4-6) ─────────────

// Anthropic은 브라우저 CORS 차단 → /api/anthropic Vercel 프록시 경유
const ANTHROPIC_PROXY = "/api/anthropic";

/** Anthropic Messages API 호출 (Vercel 서버리스 프록시 경유) */
async function callAnthropicDirect(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("Anthropic API Key가 필요합니다. 설정 → ✨ Anthropic API Key 입력");

  const response = await fetch(ANTHROPIC_PROXY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-anthropic-key": apiKey,   // 프록시가 이 헤더로 인증
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || err?.error || response.statusText;
    throw new Error(`Anthropic 프록시 오류 (${response.status}): ${msg}`);
  }

  const data = await response.json();
  console.log("[Anthropic] 응답:", JSON.stringify(data).slice(0, 200));
  const text = data?.content?.find((c: any) => c.type === "text")?.text;
  if (!text) throw new Error(`Anthropic에서 빈 응답. 구조: ${JSON.stringify(data).slice(0, 200)}`);
  return text;
}

/** Anthropic claude-sonnet-4-6로 씬 분석 */
async function analyzeSceneWithAnthropicDirect(
  sceneText: string,
  existingCharacters: Character[],
  existingLocations: Location[],
  sceneId: string,
  existingOutfitIds: string[] = []
): Promise<GeminiSceneAnalysis> {
  const userPrompt = buildClaudeSceneAnalysisPrompt(sceneText, sceneId, existingCharacters, existingLocations, existingOutfitIds);
  const rawResponse = await callAnthropicDirect(CLAUDE_SCENE_ANALYSIS_SYSTEM, userPrompt);
  try {
    const parsed = extractJSON<ClaudeSceneAnalysisResult>(rawResponse, "[Anthropic] 씬 분석");
    console.log(`[Anthropic] 씬 분석 완료: ${parsed.characters?.length ?? 0}명, scene_id=${parsed.scene_id}`);
    return mapClaudeResultToGemini(parsed, sceneText, existingCharacters.map(c => c.name), existingOutfitIds);
  } catch (e: any) {
    console.error("[Anthropic] JSON 파싱 실패:", rawResponse.slice(0, 800));
    throw new Error(`Anthropic 응답 파싱 실패: ${e.message}`);
  }
}

// ─── Gemini API 호출 ────────────────────────────────────────

/** Kie.ai OpenAI 호환 API 호출 */
async function callKieGemini(prompt: string): Promise<string> {
  const model = getSelectedModel();
  const kieKey = getKieApiKey();

  if (!kieKey) {
    throw new Error("Kie API Key가 필요합니다. 설정 페이지에서 KIE_API_KEY를 입력해주세요.");
  }

  const url = getKieEndpoint(model);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${kieKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMsg = errorData?.msg || errorData?.error?.message || response.statusText;
    throw new Error(`Kie.ai ${model} 오류 (${response.status}): ${errMsg}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Kie.ai ${model}에서 빈 응답을 받았습니다.`);
  }

  return text;
}

/** Google API (AI Studio / Vertex AI) 호출 */
async function callGoogleGemini(prompt: string, authMode: "ai-studio" | "vertex-ai"): Promise<string> {
  let url: string;
  let headers: Record<string, string>;

  if (authMode === "ai-studio") {
    url = getAIStudioEndpoint();
    headers = { "Content-Type": "application/json" };
  } else {
    const { accessToken } = getVertexConfig();
    url = getVertexEndpoint();
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMsg = errorData?.error?.message || response.statusText;

    if (authMode === "vertex-ai" && response.status === 401) {
      throw new Error(
        `Vertex AI 토큰이 만료되었습니다 (401). Google AI Studio API Key 사용을 권장합니다. 설정 → GEMINI_API_KEY에 https://aistudio.google.com/apikey 에서 발급받은 키를 입력하세요.`
      );
    }

    throw new Error(`Gemini API 오류 (${response.status}): ${errMsg}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API에서 빈 응답을 받았습니다.");
  }

  return text;
}

/** 통합 Gemini 호출 — 선택된 모델/인증에 따라 분기 */
async function callGemini(prompt: string): Promise<string> {
  const authMode = detectAuthMode();

  if (authMode === "none") {
    throw new Error(
      "AI 분석 설정이 필요합니다. 설정 페이지에서 API 키를 입력해주세요.\n• Kie.ai 모델 (Claude/Gemini) → KIE_API_KEY\n• Google AI Studio → GEMINI_API_KEY"
    );
  }

  // Claude는 analyzeSceneWithGemini에서 직접 처리 — 여기서는 차단
  if (authMode === "claude-kie" || authMode === "claude-kie-46") {
    throw new Error("Claude 모델은 구조화 씬 분석 전용입니다. analyzeSceneWithGemini를 통해 호출해주세요.");
  }

  if (authMode === "kie-ai") {
    return callKieGemini(prompt);
  }

  return callGoogleGemini(prompt, authMode as "ai-studio" | "vertex-ai");
}

// ─── 공개 API ───────────────────────────────────────────────

/**
 * Gemini를 사용하여 씬 텍스트를 분석하고 캐릭터/장소/스토리보드 패널을 추출합니다.
 * Architecture v2.0의 Reference & Continuity System과 통합됩니다.
 */
export async function analyzeSceneWithGemini(
  sceneText: string,
  existingCharacters: Character[] = [],
  existingLocations: Location[] = [],
  options?: { sceneId?: string; existingOutfitIds?: string[] }
): Promise<GeminiSceneAnalysis> {
  const _sceneId = options?.sceneId || `scene_${Date.now()}`;
  const _outfitIds = options?.existingOutfitIds || [];

  // ── Kie.ai Claude Sonnet 4.6 ─────────────────────────────────
  if (getSelectedModel() === "kie-claude-sonnet-4-6") {
    return analyzeSceneWithKieClaudeSonnet46(sceneText, existingCharacters, existingLocations, _sceneId, _outfitIds);
  }

  // ── Anthropic 직접 연결 — claude-sonnet-4-6 ──────────────────
  if (getSelectedModel() === "claude-sonnet-4-6") {
    return analyzeSceneWithAnthropicDirect(sceneText, existingCharacters, existingLocations, _sceneId, _outfitIds);
  }

  // ── Claude Sonnet 4.5 via Kie.ai ─────────────────────────────
  if (getSelectedModel() === "claude-sonnet-4-5") {
    return analyzeSceneWithClaudeSonnet(sceneText, existingCharacters, existingLocations, _sceneId, _outfitIds);
  }

  const prompt = buildSceneAnalysisPrompt(sceneText, existingCharacters, existingLocations);
  const rawResponse = await callGemini(prompt);

  try {
    // Gemini 응답에서 JSON 파싱 (markdown code block 제거)
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // 결과 검증 및 기본값 적용
    return {
      characters: (parsed.characters || []).map((c: any) => ({
        name: c.name || "Unknown",
        description: c.description || "",
        emotion: c.emotion || "neutral",
        outfit: c.outfit || "default",
        outfitLabel: c.outfitLabel || "",
        action: c.action || "standing",
        angle: c.angle || "front",
        promptSnippet: c.promptSnippet || "",
        dialogueSummary: c.dialogueSummary || null,
        // V1 포팅: 구조화된 상세 데이터
        appearance: c.appearance || "",
        accessories: c.accessories || "none",
        distinctFeatures: c.distinctFeatures || "",
        refPrompt: c.refPrompt || "",
      })),
      locations: ((parsed.locations || (parsed.location ? [parsed.location] : [])) as any[]).map((l: any) => ({
        name: l.name || "Unknown Location",
        description: l.description || "",
        timeOfDay: l.timeOfDay || "afternoon",
        weather: l.weather || "clear",
        mood: l.mood || "bright",
        promptSnippet: l.promptSnippet || "",
      })),
      // 하위 호환: 첫 번째 장소를 대표 장소로 사용
      location: (() => {
        const first = (parsed.locations || [])[0] || parsed.location || {};
        return {
          name: first.name || "Unknown Location",
          description: first.description || "",
          timeOfDay: first.timeOfDay || "afternoon",
          weather: first.weather || "clear",
          mood: first.mood || "bright",
          promptSnippet: first.promptSnippet || "",
        };
      })(),
      panels: (parsed.panels || []).map((p: any, i: number) => ({
        panelNumber: p.panelNumber || i + 1,
        description: p.description || "",
        location: p.location || "",
        characters: p.characters || [],
        cameraAngle: p.cameraAngle || "medium shot",
        emotion: p.emotion || "neutral",
        composition: p.composition || "",
        aiPrompt: p.aiPrompt || "",
        notes: p.notes || "",
      })),
      sceneOverview: parsed.sceneOverview || "",
      suggestedPromptStyle: parsed.suggestedPromptStyle || "korean webtoon style",
    };
  } catch (e) {
    console.error("Gemini 응답 파싱 실패:", rawResponse);
    throw new Error("Gemini 응답을 파싱할 수 없습니다. 다시 시도해주세요.");
  }
}

/**
 * 이미지에 대한 자동 태깅 수행 (Reference Registry의 Auto Tagger)
 */
export async function autoTagWithGemini(
  imageDescription: string,
  knownCharacters: string[] = [],
  knownLocations: string[] = []
): Promise<GeminiAutoTagResult> {
  const prompt = buildAutoTagPrompt(imageDescription, knownCharacters, knownLocations);
  const rawResponse = await callGemini(prompt);

  try {
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Auto-tag 파싱 실패:", rawResponse);
    return {
      suggestedPromptSnippet: "",
      confidence: 0,
    };
  }
}

/**
 * Vision 기반 Auto Tagger — 실제 이미지 URL을 Gemini Vision에 보내서 태그 분석
 * Architecture 9.3 Auto Tagger 구현
 */
export async function autoTagImageWithVision(
  imageUrl: string,
  knownCharacters: string[] = [],
  knownLocations: string[] = [],
  panelDescription: string = ""
): Promise<GeminiAutoTagResult> {
  const authMode = detectAuthMode();
  if (authMode === "none") {
    throw new Error("Gemini 설정이 필요합니다.");
  }

  const tagPrompt = `Analyze this webtoon panel image and return structured tags as JSON.
Pay special attention to clothing and accessories — they are critical for visual consistency.

Known characters in this project: ${knownCharacters.join(", ") || "None"}
Known locations: ${knownLocations.join(", ") || "None"}
Panel description context: ${panelDescription || "None"}

Return ONLY this JSON:
{
  "characterTags": {
    "emotion": "joy|sadness|anger|surprise|fear|neutral",
    "outfit": "DETAILED description of clothing in English — include garment type, color, pattern, layering, and any visible accessories (glasses, watch, bag, jewelry, hair accessories, etc). Example: 'navy blazer over white collared shirt, gray plaid pleated skirt, black knee socks, brown leather school bag, thin silver necklace'",
    "angle": "front|side|back|three-quarter",
    "action": "standing|sitting|running|walking|talking|fighting"
  },
  "locationTags": {
    "timeOfDay": "morning|afternoon|evening|night",
    "weather": "clear|cloudy|rain|snow",
    "mood": "bright|dark|warm|cold|tense|peaceful"
  },
  "detectedCharacters": ["matched character names from known list"],
  "detectedLocation": "matched location name from known list or new name",
  "suggestedPromptSnippet": "reusable English prompt snippet for this image",
  "confidence": 0.0
}`;

  try {
    let rawResponse: string;

    if (authMode === "ai-studio" || authMode === "vertex-ai") {
      // Google API — supports inline_data with image URL
      rawResponse = await callGeminiVision(tagPrompt, imageUrl, authMode);
    } else {
      // Kie.ai — supports image_url in content
      rawResponse = await callKieGeminiVision(tagPrompt, imageUrl);
    }

    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[AutoTagger Vision] 실패, 텍스트 폴백:", e);
    // Vision 실패 시 텍스트 기반 폴백
    return autoTagWithGemini(panelDescription, knownCharacters, knownLocations);
  }
}

/** Google AI Studio/Vertex 비전 호출 (이미지 URL → base64 변환 후 전송) */
async function callGeminiVision(prompt: string, imageUrl: string, authMode: "ai-studio" | "vertex-ai"): Promise<string> {
  // 이미지를 base64로 변환
  const imgResponse = await fetch(imageUrl);
  const blob = await imgResponse.blob();
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // data:image/...;base64, 제거
    };
    reader.readAsDataURL(blob);
  });

  const mimeType = blob.type || "image/png";

  let url: string;
  let headers: Record<string, string>;

  if (authMode === "ai-studio") {
    url = getAIStudioEndpoint();
    headers = { "Content-Type": "application/json" };
  } else {
    const { accessToken } = getVertexConfig();
    url = getVertexEndpoint();
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini Vision 오류 (${response.status}): ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/** Kie.ai 비전 호출 (OpenAI 호환 — image_url 포맷) */
async function callKieGeminiVision(prompt: string, imageUrl: string): Promise<string> {
  const model = getSelectedModel();
  const kieKey = getKieApiKey();
  const url = getKieEndpoint(model);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${kieKey}` },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Kie.ai Vision 오류 (${response.status}): ${err?.msg || response.statusText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

/**
 * 패널 프롬프트를 레퍼런스 정보로 강화합니다.
 * Architecture의 Prompt Assembler 역할
 */
export function enhancePromptWithReferences(
  basePrompt: string,
  characters: Character[],
  location: Location | null,
  panelCharNames: string[]
): string {
  let enhanced = basePrompt;

  // 캐릭터 레퍼런스 프롬프트 추가
  const charSnippets = panelCharNames
    .map(name => characters.find(c => c.name === name))
    .filter(Boolean)
    .map(c => `[Character: ${c!.name} - ${c!.defaultPromptSnippet}]`)
    .join(" ");

  if (charSnippets) {
    enhanced += `\n\n${charSnippets}`;
  }

  // 장소 레퍼런스 프롬프트 추가
  if (location?.defaultPromptSnippet) {
    enhanced += `\n[Setting: ${location.defaultPromptSnippet}]`;
  }

  return enhanced;
}

/**
 * Gemini API 키가 설정되어 있는지 확인합니다.
 */
export function isGeminiConfigured(): boolean {
  return detectAuthMode() !== "none";
}

/** 현재 인증 모드를 UI에 표시하기 위해 반환 */
export function getGeminiAuthMode(): string {
  const mode = detectAuthMode();
  const model = getSelectedModel();
  const modelInfo = GEMINI_MODELS.find(m => m.id === model);
  if (mode === "anthropic") return `Anthropic — Claude Sonnet 4.6`;
  if (mode === "claude-kie") return `Kie.ai — Claude Sonnet 4.5`;
  if (mode === "kie-ai") return `Kie.ai — ${modelInfo?.name || model}`;
  if (mode === "ai-studio") return `Google AI Studio — ${AI_STUDIO_MODEL}`;
  if (mode === "vertex-ai") return "Vertex AI (OAuth Token)";
  return "미설정";
}

/** 현재 선택된 모델 ID 반환 */
export function getCurrentModelId(): GeminiModelId {
  return getSelectedModel();
}

/** 모델 변경 */
export function setGeminiModel(modelId: GeminiModelId): void {
  localStorage.setItem("GEMINI_MODEL", modelId);
}

/**
 * Gemini API 연결 테스트
 */
export async function testGeminiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await callGemini("안녕하세요. 테스트입니다. 'OK'라고만 응답해주세요.");
    return { success: true, message: `연결 성공: ${response.slice(0, 50)}` };
  } catch (e: any) {
    return { success: false, message: e.message || "연결 실패" };
  }
}
