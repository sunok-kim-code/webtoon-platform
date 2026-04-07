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
  | "gemini-3.1-pro-preview";  // Vertex AI — 최신 프리뷰

export interface GeminiModelOption {
  id: GeminiModelId;
  name: string;
  provider: "google" | "kie" | "vertex";
  description: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
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
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "vertex",
    description: "Vertex AI — 최신 프리뷰, 고품질 분석",
  },
];


// ─── API 설정 ──────────────────────────────────────────────

const VERTEX_MODEL = "gemini-2.0-flash-001";       // Vertex AI 모델 ID
const AI_STUDIO_MODEL = "gemini-2.5-flash";         // Google AI Studio 모델 ID

function getSelectedModel(): GeminiModelId {
  const saved = localStorage.getItem("GEMINI_MODEL") as GeminiModelId;
  // 삭제된 모델(Claude 등)이 저장돼있으면 기본값으로 폴백
  const valid = GEMINI_MODELS.some(m => m.id === saved);
  return valid ? saved : "gemini-2.5-flash";
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

type AuthMode = "kie-ai" | "ai-studio" | "vertex-ai" | "none";

function detectAuthMode(): AuthMode {
  // Kie.ai API Key가 있으면 kie-ai (에피소드 분석은 gemini-3-pro 고정이므로)
  const kieKey = getKieApiKey();
  if (kieKey && kieKey.length > 10) return "kie-ai";

  // Google AI Studio
  const apiKey = getGeminiApiKey();
  if (apiKey && apiKey.length > 10) return "ai-studio";

  // Vertex AI
  const { projectId, accessToken } = getVertexConfig();
  if (projectId && accessToken && accessToken.startsWith("ya29.")) return "vertex-ai";

  return "none";
}


/** 장소 이름 퍼지 매칭: 분석 결과 → 기존 등록 장소 이름
 *  "고급 아파트", "아파트 거실" 등 → 기존 "세은·윤재 아파트 거실"로 매핑 */
function matchLocationName(analysisLocName: string, registeredNames: string[]): string {
  if (!analysisLocName || registeredNames.length === 0) return analysisLocName;
  // 정확 일치
  if (registeredNames.includes(analysisLocName)) return analysisLocName;

  // 키워드 기반 퍼지 매칭
  const analysisLower = analysisLocName.toLowerCase().replace(/[·\s_-]+/g, " ");
  const analysisWords = analysisLower.split(" ").filter(w => w.length > 0);
  // "고급" 같은 수식어는 매칭에서 제외
  const decorators = ["고급", "럭셔리", "호화", "작은", "큰", "넓은", "좁은"];

  let bestMatch = "";
  let bestScore = 0;

  for (const regName of registeredNames) {
    const regLower = regName.toLowerCase().replace(/[·\s_-]+/g, " ");
    const regWords = regLower.split(" ").filter(w => w.length > 0);
    let score = 0;

    for (const aw of analysisWords) {
      if (decorators.includes(aw)) continue;
      for (const rw of regWords) {
        if (aw === rw) score += 3;
        else if (aw.includes(rw) || rw.includes(aw)) score += 2;
      }
    }

    // "아파트" ↔ "아파트" 같은 핵심 장소 유형 매칭 보너스
    const placeTypes = ["아파트", "카페", "사무실", "거실", "침실", "안방", "주방", "욕실", "학교", "공원", "병원"];
    for (const pt of placeTypes) {
      if (analysisLower.includes(pt) && regLower.includes(pt)) score += 2;
    }

    if (score > bestScore) { bestScore = score; bestMatch = regName; }
  }

  if (bestScore >= 3 && bestMatch) {
    console.log(`[Location Match] "${analysisLocName}" → "${bestMatch}" (score: ${bestScore})`);
    return bestMatch;
  }

  return analysisLocName;
}

/** 캐릭터 이름 정규화: 분석 결과 → 기존 갤러리 이름 */
function matchCharacterName(analysisName: string, registeredNames: string[]): string {
  // 정확 일치
  if (registeredNames.includes(analysisName)) return analysisName;
  // 갤러리 이름이 분석 이름의 부분문자열 (성 제외 매칭)
  const found = registeredNames.find(rn =>
    analysisName.endsWith(rn) || analysisName.startsWith(rn) || rn.endsWith(analysisName) || rn.startsWith(analysisName)
  );
  if (found) return found;
  return analysisName;
}

/** 의상 ID 퍼지 매칭: 분석된 ID → 기존 갤러리 ID */
function matchOutfitId(analysisOutfitId: string, charName: string, registeredOutfitIds: string[]): string {
  // 정확 일치
  if (registeredOutfitIds.includes(analysisOutfitId)) return analysisOutfitId;

  // "의상" 기호 라벨 감지 (의상A, 의상_C, 의상 B 등 → 무효)
  const isGenericLabel = /의상[_\s]*[A-Za-z0-9]/.test(analysisOutfitId);

  // 캐릭터 이름 + 키워드 부분 매칭
  const analysisKeywords = analysisOutfitId.toLowerCase().split("_").filter(k => k.length > 1);
  let bestMatch = "";
  let bestScore = 0;
  const charNameLower = charName.toLowerCase();

  for (const regId of registeredOutfitIds) {
    const regLower = regId.toLowerCase();
    const regFirstPart = regLower.split("_")[0];
    // 같은 캐릭터의 의상인지 확인 (한글 이름 ↔ 로마자 ID 모두 허용)
    const isCharMatch = regLower.includes(charNameLower)
      || charNameLower.includes(regFirstPart)
      || analysisOutfitId.toLowerCase().startsWith(regFirstPart + "_")
      || regLower.startsWith(analysisKeywords[0] + "_");
    if (!isCharMatch) continue;
    // 키워드 매칭 점수 (캐릭터 이름 부분 제외)
    const regKeywords = regLower.split("_").filter(k => k.length > 1 && k !== regFirstPart);
    let score = 0;
    for (const ak of analysisKeywords) {
      if (ak === "의상" || ak === charNameLower || ak === analysisKeywords[0]) continue;
      for (const rk of regKeywords) {
        if (ak === rk) score += 3;
        else if (ak.includes(rk) || rk.includes(ak)) score += 2;
      }
    }
    if (score > bestScore) { bestScore = score; bestMatch = regId; }
  }

  // 키워드 매칭 성공
  if (bestScore >= 2 && bestMatch) {
    console.log(`[Outfit Match] "${analysisOutfitId}" → "${bestMatch}" (score: ${bestScore})`);
    return bestMatch;
  }

  // fallback: 기호 라벨이거나 매칭 실패 시 → 해당 캐릭터의 갤러리 의상 중 첫 번째 사용
  if (isGenericLabel || bestScore === 0) {
    const charOutfit = registeredOutfitIds.find(id =>
      id.toLowerCase().startsWith(charNameLower + "_") || id.toLowerCase().startsWith(charNameLower)
    );
    if (charOutfit) {
      console.log(`[Outfit Fallback] "${analysisOutfitId}" → "${charOutfit}" (generic label or no match, using first gallery outfit for ${charName})`);
      return charOutfit;
    }
  }

  return analysisOutfitId;
}


// ─── 씬 분석 프롬프트 (핵심) ────────────────────────────────

function buildSceneAnalysisPrompt(
  sceneText: string,
  existingCharacters: Character[],
  existingLocations: Location[],
  existingOutfitIds?: string[]
): string {
  const charContext = existingCharacters.length > 0
    ? `\n\n[기존 등록된 캐릭터]\n${existingCharacters.map(c => `- ${c.name}: ${c.characterCore ? `[Core] ${c.characterCore} ` : ""}${c.defaultPromptSnippet}`).join("\n")}`
    : "";

  const locContext = existingLocations.length > 0
    ? `\n\n[기존 등록된 장소]\n${existingLocations.map(l => `- ${l.name}${l.locationCanonical ? ` [${l.locationCanonical}]` : ""}: ${l.defaultPromptSnippet}`).join("\n")}`
    : "";

  const outfitContext = existingOutfitIds && existingOutfitIds.length > 0
    ? `\n\n[기존 등록된 의상 ID — 같은 의상이면 반드시 이 ID를 그대로 사용할 것]\n${existingOutfitIds.map(id => `- ${id}`).join("\n")}`
    : "";

  return `당신은 웹툰 제작 전문 AI 어시스턴트이자 마스터 프로듀서입니다. 아래 씬 설명을 분석하여 JSON 형식으로 결과를 반환해주세요.
캐릭터의 외모, 의상, 소품은 시각적 일관성 유지에 매우 중요합니다. 캐릭터가 모든 패널에서 즉시 구별될 수 있도록 매우 상세하게 분석해주세요.

[분석 요청 씬 설명]
${sceneText}
${charContext}${locContext}${outfitContext}

[캐릭터 이름 규칙 — 최우선]
1. characters[].name은 반드시 기존 등록된 캐릭터 이름을 그대로 사용하라.
2. 성(姓)을 붙이지 말고 이름(first name)만 사용하라. 예) "박서린" → "서린", "이세은" → "세은"
3. 기존 등록된 캐릭터가 "서린"이면 씬에서 "박서린", "서린이" 등으로 불려도 반드시 "서린"으로 표기.
4. 의상이 달라도 같은 캐릭터는 절대 새 캐릭터로 생성하지 말 것. 의상은 outfit/outfitNormalizedId 필드에서 구분한다.

[의상 ID 규칙 — 필수]
1. 기존 등록된 의상 ID가 있으면 반드시 그 ID를 그대로 사용하라. 새로 만들지 말 것.
2. "의상 A", "의상 B", "의상 C" 같은 기호적 라벨은 절대 사용하지 말 것.
3. 기존 등록된 의상 ID가 없는 새로운 의상인 경우에만 '{이름}_{의상특징}' 형식으로 생성.
4. 형식: 소문자+underscore만 사용. 같은 의상이 여러 장면에 나와도 항상 동일한 ID를 사용.

[장소 매칭 규칙 — 필수]
1. 기존 등록된 장소가 있으면 반드시 그 장소 이름을 그대로 사용하라.
2. "고급 아파트", "아파트", "집" 등 같은 장소의 다른 표현이면 기존 등록된 장소와 동일하게 매핑하라.

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
      "outfitNormalizedId": "Unique outfit library ID. 기존 등록된 의상 ID가 있으면 반드시 그것을 사용. 새로 생성할 때는 '{캐릭터이름}_outfit_{영어키워드}' 형식. 캐릭터이름은 기존 등록된 의상 ID의 이름 형식과 동일하게 (예: 기존 '세은_outfit_...'이면 '세은', 기존 'jiho_outfit_...'이면 'jiho'). 키워드는 영어 소문자, underscore만 사용. 의상이 동일하면 모든 패널에서 반드시 같은 ID 사용.",
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
      "description": "이 패널의 장면 설명 (한글). 원본 씬 텍스트의 시각적 디테일을 하나도 빠뜨리지 말 것 — 헤어스타일(묶음/풀림/올림 등), 손에 든 소품(국자, 책, 핸드폰 등), 구체적 자세(뒷모습, 앉은 자세 등), 피부·의상 노출 부위, 환경 소품(가스레인지, 찌개 냄비 등)을 모두 포함",
      "location": "이 패널의 구체적 장소 이름 (locations 배열의 name과 일치해야 함)",
      "locationCanonical": "이 패널 장소의 canonical 카테고리 (locations 배열의 locationCanonical과 일치해야 함)",
      "characters": ["등장하는 캐릭터 이름들"],
      "characterOutfits": { "캐릭터이름": "outfitNormalizedId (characters 배열의 값과 일치해야 함)" },
      "cameraAngle": "wide shot|medium shot|close-up|extreme close-up|over shoulder|bird's eye|low angle|dutch angle 중 하나",
      "emotion": "이 패널의 전체적인 감정 톤",
      "composition": "구도 설명 (예: '왼쪽에 민지, 오른쪽에 서호가 마주보는 구도')",
      "panel_type": "visual|dialogue|narration 중 하나. visual=캐릭터+배경 있는 장면, dialogue=대사 위주(캐릭터 있지만 비주얼 묘사 적음), narration=캐릭터 없는 배경/나레이션",
      "sceneId": "#N 마커가 있으면 해당 마커 값(예: '#1', '#2'). 없으면 'scene_패널번호'",
      "aiPrompt": "webtoon style, [영어로 된 이미지 생성 프롬프트 — 대사/효과음 제외, 순수 비주얼만]. 캐릭터 표정, 포즈, 장소, 시간대 조명을 반드시 포함. high quality, detailed, korean webtoon art style",
      "dialogues": [{"character": "캐릭터이름", "text": "대사 내용"}],
      "sfx": ["효과음 텍스트 (예: 쾅!, 끼이익, 두근두근)"],
      "notes": "연출 참고 사항"
    }
  ],
  "sceneOverview": "씬 전체 요약 (한글, 1-2문장)",
  "suggestedPromptStyle": "이 씬에 어울리는 아트 스타일 설명 (영어)"
}

[의상 라이브러리 규칙 — 반드시 준수]
1. ★ 기존 등록된 의상 ID 목록이 제공되면, 같은 의상은 반드시 기존 ID를 그대로 사용하라. 새 ID를 만들지 말 것.
2. ★ 캐릭터 이름 형식: 기존 등록된 의상 ID가 한글 이름(예: '세은_outfit_...')을 사용하면 한글 그대로, 영어(예: 'jiho_outfit_...')이면 영어를 사용하라. 기존 ID가 없을 때만 한글 이름을 사용하라.
3. outfitNormalizedId는 씬 전체에서 동일한 의상이면 반드시 동일한 값을 사용합니다
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
1. 씬 텍스트에 "#숫자" 마커(예: #1, #2, #3)가 있으면 각 마커가 하나의 씬 블록이다. 한 블록 = 1개의 패널로 변환하라.
   - "#1" 마커부터 다음 "#2" 마커 직전까지가 하나의 블록이다.
   - 블록 안의 대사 줄("캐릭터이름: 대사")과 지문은 모두 같은 패널에 포함시켜라. 대사를 별도 패널로 분리하지 말 것.
   - sceneId는 해당 마커 값을 그대로 사용하라 (예: "#1", "#2", "#3").
2. "#숫자" 마커가 없으면 문맥 단위로 장면을 나눠라. 한 줄 = 한 패널이 아니다. 연속된 동작/대사/지문을 하나의 장면으로 묶어라.
   - sceneId는 "scene_1", "scene_2" 형식으로 순서대로 부여하라.
3. 한 장면 안에 장소 이동이나 시간 변화가 있는 경우에만 패널을 분리하라.
4. 결과적으로 입력 씬의 씬 블록 수와 패널 수가 거의 일치해야 한다.
5. 절대로 장면을 생략하거나 합치지 마세요. 모든 장면이 패널에 반영되어야 합니다.

[패널 타입 분류 규칙 — 반드시 준수]
1. panel_type은 반드시 다음 기준으로 분류하라:
   - "visual": 캐릭터가 등장하고 비주얼 묘사가 있는 장면 (기본값)
   - "dialogue": 캐릭터가 등장하지만 대사 위주이고 비주얼 묘사가 거의 없는 장면
   - "narration": 캐릭터가 등장하지 않는 배경/나레이션/상황 설명 장면
2. 대부분의 패널은 "visual"이다. "dialogue"와 "narration"은 예외적인 경우에만 사용하라.

[대사/효과음 추출 규칙 — 반드시 준수]
1. 각 패널의 대사는 dialogues 배열에 {"character": "이름", "text": "대사"} 형태로 추출하라.
   - 대사 형식: "캐릭터이름: 대사내용" 또는 "캐릭터이름: (지문) 대사내용"
2. 효과음(*쾅!*, *두근두근*, (끼이익!) 등)은 sfx 배열에 텍스트만 추출하라.
   - *별표로 감싼 텍스트* 또는 (짧은 의성어/의태어!?) 형태만 효과음으로 인식
   - (의상 A), (놀라며) 같은 지문은 효과음이 아니다
3. aiPrompt에는 대사와 효과음을 절대 포함하지 말 것. aiPrompt는 순수 비주얼 묘사만.
4. 대사가 없으면 dialogues를 빈 배열 []로, 효과음이 없으면 sfx를 빈 배열 []로 반환하라.

[aiPrompt 생성 규칙 — 반드시 준수]
1. aiPrompt는 반드시 영어로 작성하라.
2. 반드시 다음 요소를 포함하라:
   - 카메라 앵글 (cameraAngle)
   - 장소 묘사 (location + 시간대 조명)
   - 등장 캐릭터의 구체적 신체 동작(action), 손의 상태, 자세(pose), 표정의 시각적 묘사
   - "webtoon style, high quality, detailed, korean webtoon art style" 포함
3. 대사, 효과음, 한국어 텍스트는 aiPrompt에 절대 포함하지 말 것.
4. ★ 원본 씬 텍스트의 시각적 디테일을 모두 영어로 번역하여 포함하라:
   - 헤어스타일: "hair neatly tied in a single ponytail", "hair down", "hair in a bun" 등
   - 손에 든 소품: "holding a ladle", "carrying a bag", "gripping a phone" 등
   - 구체적 환경 소품: "in front of a gas range with a bubbling pot of stew" 등
   - 피부·의상 노출 정보: "nape exposed above the V-neck collar" 등
   - 자세·방향: "seen from behind", "sitting cross-legged" 등
   하나라도 빠뜨리면 다음 패널과의 시각적 연결이 끊어진다. 절대 생략하지 말 것.

[동작 묘사 핵심 규칙 — 웹툰 패널 품질의 핵심, 반드시 준수]

규칙 A: 추상적 감정 단어 금지 → 시각적 신체 동작으로 변환 (Action over Emotion)
  - '공포', '슬픔', '분노' 등 추상 감정 단어를 그대로 사용하지 말 것.
  - 반드시 그 감정이 신체에 어떻게 나타나는지 구체적으로 묘사하라.
  - 예시:
    - 공포 → "wide eyes, tense shoulders" (단, '식은땀' 등 극단적 표현은 "a tired, weary look"으로 순화)
    - 슬픔 → "downcast eyes, slumped shoulders, hand loosely hanging"
    - 분노 → "furrowed brows, loosely curled fists" (주먹을 꽉 쥐는 대신 가볍게)
    - 놀람 → "eyebrows raised, slightly pulling back"
  - 극단적 감정 표현은 지양하라. 일상적 불안을 '공포'로, 가벼운 걱정을 '고통'으로 과장하지 말 것.

규칙 B: 동적 액션을 정적 상태로 순화 (Softened Interaction)
  - AI는 '쥐다', '뒤척이다' 같은 동사를 만나면 과도하게 힘을 준 그림을 생성한다.
  - 힘이 들어간 동사 대신 '상태'나 '접촉' 위주로 묘사하라.
  - 예시:
    - "Clenching the sheet" → "Hand resting on the wrinkled sheet"
    - "Tossing and turning" → "Lying restlessly with messy hair"
    - "Wide eyes" → "Blankly staring at the ceiling"
    - "Cold sweat" → "A tired, weary look"
    - "Tense shoulders" → "Subtle anxiety in the posture"
  - 손의 상태는 반드시 명시하되, 힘을 빼고 자연스럽게: "hand lightly touching", "fingers loosely resting"

규칙 C: 조명의 단일화와 부정어 활용 (Lighting Control)
  - 광원을 하나로 고정하고 구체적인 빛의 경로를 적어줄 것.
  - "cool ambient night lighting" 대신 "Soft moonlight from the window, gentle shadows"처럼 구체적으로.
  - AI가 그림자를 너무 진하게 넣지 못하게 반드시 포함: "NO harsh contrast, NO extreme darkness"
  - 조명 설정이 상충하면 '합성 사진' 느낌이 나므로, 인물과 배경의 조명이 동일해야 한다.

규칙 D: 인물과 배경의 비례 고정 (Scale & Perspective)
  - 인물을 배경의 일부로 배치하라. 환경에 맞는 정확한 비율을 강조할 것.
  - 반드시 포함: "Character is correctly scaled to the environment."
  - Medium shot이 인물로 꽉 차면 배경 가구와의 크기 차이가 도드라진다.
  - Full body visible이 필요하면 Full Shot이나 Wide Shot을 사용하라.

규칙 E: 감정의 담백한 묘사 (Subtle Emotion)
  - '식은땀', '공포', 'agony' 같은 자극적 단어는 AI에게 호러 영화를 찍으라는 신호가 된다.
  - 자극적인 단어를 빼고 '피곤함', '공허함', '무기력'으로 우회하라.
  - 표정 묘사에는 반드시 "NO extreme facial expressions" 포함.
  - 예시:
    - "horror" → "unease", "cold sweat" → "a tired, weary look"
    - "agony" → "weariness", "panic" → "restless unease"

[프롬프트 작성 공식 — 이 순서대로 aiPrompt를 작성하라]
1. [통합 스타일]: 인물과 배경에 동일한 채색 기법. 혼합 렌더링 금지.
2. [구도]: Full shot / Wide shot 기본. 환경에 맞는 정확한 비율.
3. [상태/포즈]: 힘 뺀 묘사 — 접촉, 상태 위주. 손의 상태 명시.
4. [표정]: 담백한 감정. NO extreme faces.
5. [조명/분위기]: 단일 광원, 구체적 빛 경로, gentle shadows, NO harsh contrast.
6. [레퍼런스 연결]: Consistent with [ref:인물] and [ref:배경].

[카메라 앵글 연출 규칙]
- 첫 패널은 반드시 wide shot/full shot으로 장소 전체를 소개 (establishing shot)
- 감정 변화가 큰 순간은 medium shot으로 처리 (close-up보다 full body 맥락 유지)
- 대화 장면은 medium shot 또는 over shoulder
- 마지막 패널은 감정적 여운을 남기는 구도
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
      "AI 분석 설정이 필요합니다. 설정 페이지에서 API 키를 입력해주세요.\n• Kie.ai Gemini 모델 → KIE_API_KEY\n• Google AI Studio → GEMINI_API_KEY"
    );
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
  options?: { sceneId?: string; existingOutfitIds?: string[]; analysisModel?: GeminiModelId }
): Promise<GeminiSceneAnalysis> {
  const _outfitIds = options?.existingOutfitIds || [];
  const analysisModel = options?.analysisModel || "gemini-3-pro";

  const prompt = buildSceneAnalysisPrompt(sceneText, existingCharacters, existingLocations, _outfitIds);

  const rawResponse = await (async () => {
    // Vertex AI 모델인 경우
    if (analysisModel === "gemini-3.1-pro-preview") {
      const { projectId, location, accessToken } = getVertexConfig();
      if (!projectId || !accessToken) {
        throw new Error("Vertex AI 설정이 필요합니다. 설정에서 VERTEX_PROJECT_ID와 VERTEX_ACCESS_TOKEN을 입력해주세요.");
      }
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${analysisModel}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
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
        if (response.status === 401) {
          throw new Error(`Vertex AI 토큰이 만료되었습니다 (401). 설정에서 Access Token을 갱신해주세요.`);
        }
        throw new Error(`Vertex AI (${analysisModel}) 오류 (${response.status}): ${errMsg}`);
      }
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`Vertex AI (${analysisModel})에서 빈 응답을 받았습니다.`);
      return text;
    }

    // Kie.ai 모델 (gemini-3-pro 등)
    const kieKey = getKieApiKey();
    if (!kieKey) {
      throw new Error("AI API 키가 설정되지 않았습니다. 설정에서 KIE_API_KEY를 입력해주세요.");
    }
    const url = getKieEndpoint(analysisModel);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kieKey}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        stream: false,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData?.msg || errorData?.error?.message || response.statusText;
      throw new Error(`${analysisModel} 오류 (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${analysisModel}에서 빈 응답을 받았습니다.`);
    return text;
  })();

  try {
    // Gemini 응답에서 JSON 파싱 (markdown code block 제거)
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // ── 캐릭터 이름 정규화 및 의상 ID 매칭 ──
    const registeredCharNames = existingCharacters.map(c => c.name);
    const registeredLocationNames = existingLocations.map(l => l.name);

    // 결과 검증 및 기본값 적용
    const result = {
      characters: (parsed.characters || []).map((c: any) => {
        const normalizedName = matchCharacterName(c.name || "Unknown", registeredCharNames);
        const normalizedOutfitId = matchOutfitId(
          c.outfitNormalizedId || c.outfit || "default",
          normalizedName,
          _outfitIds
        );
        return {
          name: normalizedName,
          description: c.description || "",
          emotion: c.emotion || "neutral",
          outfit: c.outfit || "default",
          outfitLabel: c.outfitLabel || "",
          outfitNormalizedId: normalizedOutfitId,
          action: c.action || "standing",
          angle: c.angle || "front",
          promptSnippet: c.promptSnippet || "",
          dialogueSummary: c.dialogueSummary || null,
          // V1 포팅: 구조화된 상세 데이터
          appearance: c.appearance || "",
          accessories: c.accessories || "none",
          distinctFeatures: c.distinctFeatures || "",
          refPrompt: c.refPrompt || "",
          characterCore: c.characterCore || "",
        };
      }),
      locations: ((parsed.locations || (parsed.location ? [parsed.location] : [])) as any[]).map((l: any) => {
        const normalizedName = matchLocationName(l.name || "Unknown Location", registeredLocationNames);
        return {
          name: normalizedName,
          description: l.description || "",
          locationCanonical: l.locationCanonical || "",
          timeOfDay: l.timeOfDay || "afternoon",
          weather: l.weather || "clear",
          mood: l.mood || "bright",
          promptSnippet: l.promptSnippet || "",
        };
      }),
      // 하위 호환: 첫 번째 장소를 대표 장소로 사용
      location: (() => {
        const first = (parsed.locations || [])[0] || parsed.location || {};
        const normalizedName = matchLocationName(first.name || "Unknown Location", registeredLocationNames);
        return {
          name: normalizedName,
          description: first.description || "",
          locationCanonical: first.locationCanonical || "",
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
        locationCanonical: p.locationCanonical || "",
        characters: p.characters || [],
        characterOutfits: p.characterOutfits || {},
        cameraAngle: p.cameraAngle || "medium shot",
        emotion: p.emotion || "neutral",
        composition: p.composition || "",
        aiPrompt: p.aiPrompt || "",
        notes: p.notes || "",
        panel_type: p.panel_type || "visual",
        sceneId: p.sceneId || "",
        dialogues: p.dialogues || undefined,
        sfx: p.sfx || undefined,
      })),
      sceneOverview: parsed.sceneOverview || "",
      suggestedPromptStyle: parsed.suggestedPromptStyle || "korean webtoon style",
    };

    return result;
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

/** 분석에 사용 가능한 모델 목록 */
export const ANALYSIS_MODELS: GeminiModelOption[] = GEMINI_MODELS.filter(
  m => m.provider === "kie" || m.provider === "vertex"
);

/** 현재 선택된 분석 모델 ID 반환 */
export function getAnalysisModelId(): GeminiModelId {
  const saved = localStorage.getItem("ANALYSIS_MODEL") as GeminiModelId;
  const valid = ANALYSIS_MODELS.some(m => m.id === saved);
  return valid ? saved : "gemini-3-pro";
}

/** 분석 모델 변경 */
export function setAnalysisModel(modelId: GeminiModelId): void {
  localStorage.setItem("ANALYSIS_MODEL", modelId);
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
