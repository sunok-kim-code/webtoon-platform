// ============================================================
// fullStoryAnalysisService.ts — 전체 스토리 일괄 분석 서비스 v2
// 2단계 분석:
//   Phase 1) 전체 파일 → 캐릭터/의상/장소 바이블 + 화별 구조만 추출
//   Phase 2) 화별 텍스트 → 씬 단위 정밀 분석 (원본 씬 수 100% 보장)
// ============================================================

// ─── 타입 정의 ──────────────────────────────────────────────

export interface FullStoryCharacter {
  name: string;
  appearance_core: string;
  first_appear_episode: number;
  first_outfit_id: string;
  total_appear_count: number;
}

export interface FullStoryOutfit {
  normalized_id: string;
  description: string;
  first_appear_episode: number;
  appear_count: number;
}

export interface FullStoryLocation {
  canonical_category: string;
  sub_category: string;
  /** 이 공간이 속한 상위 건물/거주지. 예) "이세은의 고급 아파트", "카페 '모모'" */
  parent_space: string;
  /** parent_space 전체에 공통 적용되는 인테리어·분위기 묘사. 같은 parent_space끼리 동일해야 함 */
  space_style: string;
  description: string;
  appear_count: number;
}

export interface FullStorySceneCharacter {
  name: string;
  appearance_core: string;
  outfit: {
    normalized_id: string;
    description: string;
    accessories: string[];
  };
  expression: string;
  pose: string | null;
}

export interface FullStorySceneLocation {
  canonical_category: string;
  sub_category: string;
  description: string;
}

export type NarrativeMode = "normal" | "flashback" | "imagination" | "dream_sequence" | "other";

export interface FullStoryScene {
  scene_id: string;
  scene_number: number;          // 원본 #숫자 마커
  original_text: string;         // 원본 씬 텍스트 (검증용)
  characters: FullStorySceneCharacter[];
  location: FullStorySceneLocation;
  background_elements: string[];
  time_of_day: string | null;
  narrative_mode: NarrativeMode;
  special_instructions: string;
  panel_count: number;
  storyboard_description: string;
  flux_image_prompt: string;
}

export interface FullStoryEpisode {
  episode_number: number;
  title: string;
  key_events: string[];
  total_scenes: number;
  scenes: FullStoryScene[];
}

export interface FullStoryBible {
  total_episodes: number;
  character_bible: FullStoryCharacter[];
  outfit_library: FullStoryOutfit[];
  location_library: FullStoryLocation[];
  episode_structure: Array<{
    episode_number: number;
    title: string;
    key_events: string[];
    total_scenes: number;        // 원본 텍스트에서 카운트한 씬 수
  }>;
}

export interface FullStoryAnalysisResult {
  total_episodes: number;
  character_bible: FullStoryCharacter[];
  outfit_library: FullStoryOutfit[];
  location_library: FullStoryLocation[];
  episodes: FullStoryEpisode[];
  /** 화별 원본 텍스트 — Phase 2 실패 시 Pipeline 원문 저장 fallback 용도 */
  episodeTexts: Array<{ number: number; text: string }>;
  storyboard_overview: {
    total_estimated_panels: number;
    per_episode_panel_count: number[];
  };
}

// ─── 분석 진행 상태 ──────────────────────────────────────────

export type AnalysisProgressStep =
  | "idle"
  | "splitting"
  | "phase1_bible"
  | "phase2_scenes"
  | "parsing"
  | "creating_references"
  | "creating_episodes"
  | "done"
  | "error";

export interface AnalysisProgress {
  step: AnalysisProgressStep;
  message: string;
  progress: number;
  currentEpisode?: number;
  totalEpisodes?: number;
  error?: string;
}

// ─── 텍스트 파싱 유틸리티 ────────────────────────────────────

/**
 * 전체 스토리 텍스트를 화별로 분리합니다.
 * "1화", "제1화", "1 화", "EP1", "Chapter 1" 등 다양한 형식 지원
 */
export function splitIntoEpisodes(storyText: string): Array<{ number: number; text: string }> {
  // 화 구분 패턴
  const episodePatterns = [
    /^[=\-*]{2,}.*?(\d+)\s*화.*?[=\-*]{2,}$/m,  // === 1화 === 형식
    /^#+\s*(\d+)\s*화/m,                           // ## 1화 형식
    /^(\d+)\s*화\s*[:\.\-]?\s*$/m,               // 1화: 또는 1화 형식
    /^제\s*(\d+)\s*화/m,                          // 제1화 형식
    /^\[(\d+)\s*화\]/m,                            // [1화] 형식
    /^ep\.?\s*(\d+)/im,                           // EP1 또는 ep.1 형식
    /^chapter\s+(\d+)/im,                          // Chapter 1 형식
  ];

  // 가장 많이 매칭되는 패턴 찾기
  let bestPattern: RegExp | null = null;
  let bestCount = 0;

  for (const pattern of episodePatterns) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.replace("m", "gm"));
    const matches = storyText.match(globalPattern) || [];
    if (matches.length > bestCount) {
      bestCount = matches.length;
      bestPattern = pattern;
    }
  }

  if (!bestPattern || bestCount < 2) {
    // 패턴 감지 실패 → 전체를 1화로 처리
    console.warn("[EpisodeSplit] 화 구분 패턴을 찾지 못했습니다. 전체를 1화로 처리합니다.");
    return [{ number: 1, text: storyText }];
  }

  // 화별 분리
  const globalPattern = new RegExp(bestPattern.source, "gim");
  const episodes: Array<{ number: number; text: string }> = [];
  const matches = [...storyText.matchAll(globalPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const epNum = parseInt(match[1] || match[0].replace(/\D/g, ""), 10);
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : storyText.length;
    const text = storyText.slice(start, end).trim();
    if (text.length > 0) {
      episodes.push({ number: epNum, text: `${match[0]}\n${text}` });
    }
  }

  return episodes.sort((a, b) => a.number - b.number);
}

/**
 * 에피소드 텍스트에서 씬 마커(#숫자)를 카운트합니다.
 */
export function countScenesInEpisode(episodeText: string): number {
  const sceneMarkers = episodeText.match(/^#\d+/gm) || [];
  if (sceneMarkers.length > 0) return sceneMarkers.length;

  // 마커 없으면 문단 수로 추정
  const paragraphs = episodeText.split(/\n{2,}/).filter(p => p.trim().length > 10);
  return Math.max(1, paragraphs.length);
}

/**
 * 에피소드 텍스트에서 개별 씬 텍스트 목록을 추출합니다.
 */
export function extractScenesFromEpisode(episodeText: string): Array<{ number: number; text: string }> {
  // #숫자 마커 방식
  const scenePattern = /^(#(\d+))([\s\S]*?)(?=^#\d+|\z)/gm;
  const scenes: Array<{ number: number; text: string }> = [];

  const matches = [...episodeText.matchAll(/^#(\d+)([\s\S]*?)(?=\n#\d+|$)/gm)];

  if (matches.length > 0) {
    for (const m of matches) {
      scenes.push({
        number: parseInt(m[1], 10),
        text: `#${m[1]}${m[2]}`.trim(),
      });
    }
    return scenes;
  }

  // 마커 없으면 줄 단위 분리
  const lines = episodeText.split("\n").filter(l => l.trim().length > 5);
  return lines.map((l, i) => ({ number: i + 1, text: l.trim() }));
}

// ─── API 호출 헬퍼 ────────────────────────────────────────────

function getAnthropicApiKey(): string { return localStorage.getItem("ANTHROPIC_API_KEY") || ""; }
function getKieApiKey(): string { return localStorage.getItem("KIE_API_KEY") || ""; }
function getGeminiApiKey(): string { return localStorage.getItem("GEMINI_API_KEY") || ""; }
function getSelectedModel(): string { return localStorage.getItem("GEMINI_MODEL") || "gemini-2.5-flash"; }

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const model = getSelectedModel();

  if (model === "claude-sonnet-4-6") {
    const apiKey = getAnthropicApiKey();
    if (!apiKey) throw new Error("Anthropic API Key가 없습니다. 설정 → ✨ Anthropic API Key 입력");

    const res = await fetch("/api/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": apiKey },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(`Anthropic 오류 (${res.status}): ${err?.error?.message || res.statusText}`);
    }
    const data = await res.json();
    const text = data?.content?.find((c: any) => c.type === "text")?.text;
    if (!text) throw new Error("Anthropic 응답이 비어있습니다.");
    return text;
  }

  // Kie.ai Claude Sonnet 4.6 — /claude/v1/messages (Anthropic native 형식)
  // 서버 5xx 에러 시 최대 2회 재시도, 이후 4.5 자동 폴백
  if (model === "kie-claude-sonnet-4-6") {
    const kieKey = getKieApiKey();
    if (!kieKey) throw new Error("Kie API Key가 없습니다. 설정 → KIE_API_KEY 입력");

    const callOnce46 = async () => {
      const res = await fetch("https://api.kie.ai/claude/v1/messages", {
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(`Kie.ai Claude 4.6 오류 (${res.status}): ${err?.error?.message || err?.msg || res.statusText}`);
      }
      const data = await res.json();
      if (
        (data?.code != null && data.code >= 400) ||
        data?.type === "error" ||
        (data?.error && !data?.content)
      ) {
        const msg = data?.error?.message || data?.msg || JSON.stringify(data);
        throw new Error(`Kie.ai Claude 4.6 서버 오류 (${data?.code ?? "?"}): ${msg}`);
      }
      const text = Array.isArray(data?.content)
        ? data.content.find((c: any) => c.type === "text")?.text
        : null;
      if (!text) throw new Error(`Kie.ai Claude 4.6 빈 응답. 구조: ${JSON.stringify(data).slice(0, 200)}`);
      return text;
    };

    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await callOnce46();
      } catch (err: any) {
        const msg: string = err?.message || "";
        const isServerError = msg.includes("서버 오류") || msg.includes("500") || msg.includes("Server exception") || msg.includes("try again");
        if (!isServerError) throw err;
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 3000;
          console.warn(`[FullStory Kie46] 서버 오류 — ${delay / 1000}초 후 재시도 (${attempt}/${MAX_RETRIES}):`, msg);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // 재시도 소진 → 4.5 자동 폴백 (Kie.ai Claude Sonnet 4.5 직접 호출)
    console.warn("[FullStory Kie46] 재시도 소진 → Claude Sonnet 4.5로 자동 폴백");
    const res45 = await fetch("https://api.kie.ai/claude-sonnet-4-5/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${kieKey}` },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 16000,
        stream: false,
      }),
    });
    if (!res45.ok) {
      const err45 = await res45.json().catch(() => ({})) as any;
      throw new Error(`[폴백] Kie.ai Claude 4.5 오류 (${res45.status}): ${err45?.msg || res45.statusText}`);
    }
    const data45 = await res45.json();
    if (data45?.code >= 400 || (data45?.msg && !data45?.choices)) {
      throw new Error(`[폴백] Kie.ai Claude 4.5 오류: ${data45?.msg || JSON.stringify(data45)}`);
    }
    const text45 = data45?.choices?.[0]?.message?.content;
    if (!text45) throw new Error(`[폴백] Kie.ai Claude 4.5 빈 응답`);
    return text45;
  }

  // Kie.ai Claude Sonnet 4.5 — /claude-sonnet-4-5/v1/chat/completions (OpenAI 호환)
  if (model === "claude-sonnet-4-5") {
    const kieKey = getKieApiKey();
    if (!kieKey) throw new Error("Kie API Key가 없습니다. 설정 → KIE_API_KEY 입력");

    const res = await fetch("https://api.kie.ai/claude-sonnet-4-5/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${kieKey}` },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 16000,
        stream: false,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(`Kie.ai 오류 (${res.status}): ${err?.msg || err?.error?.message || res.statusText}`);
    }
    const data = await res.json();
    // Kie.ai는 HTTP 200으로 에러를 반환하는 경우가 있음 → body 재검사
    if (data?.code >= 400 || (data?.msg && !data?.choices && !data?.content)) {
      const kieMsg = data?.msg || data?.error?.message || JSON.stringify(data);
      throw new Error(`Kie.ai Claude 오류: "${kieMsg}". Kie.ai 구독에서 Claude 모델 접근 권한을 확인해주세요.`);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Kie.ai Claude 빈 응답. 구조: ${JSON.stringify(data).slice(0, 200)}`);
    return text;
  }

  // Gemini fallback
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("Gemini API Key가 없습니다. 설정 → GEMINI_API_KEY 입력");
  const geminiModel = model.startsWith("gemini") ? model : "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16384 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Gemini 오류 (${res.status}): ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답이 비어있습니다.");
  return text;
}

function parseJson<T>(raw: string, context: string): T {
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

// ─── Phase 1: 캐릭터/의상/장소 바이블 + 화 구조 추출 ─────────

const PHASE1_SYSTEM = `너는 전문 웹툰 기획자이자 구조화 분석 AI다.
주어진 전체 웹툰 스토리 파일을 분석하여 **캐릭터 바이블, 의상 라이브러리, 장소 라이브러리, 화별 구조**만 JSON으로 추출한다.
【절대 규칙】
1. appearance_core = 얼굴/체형/머리/피부/키 등 불변 특징만. 의상·액세서리 절대 포함 금지.
2. 【캐릭터 이름 규칙 — 엄격 준수】 character_bible의 name 필드는 반드시 원작 한국어(한글) 이름으로만 표기하라.
   - 영어 로마자 표기 절대 금지 (예: "seojun" → "서준" 또는 "박서준", "eunseo" → "이은서" 등)
   - 같은 캐릭터는 전체 출력에서 동일한 한국어 이름으로 일관성 유지.
3. 【의상 ID 규칙 — 필수】 outfit_library의 normalized_id는 반드시 '{한국어캐릭터이름}_{의상특징}' 형식으로 생성하라.
   - 형식: 소문자+underscore만 사용, 캐릭터 한국어 이름을 맨 앞에 붙임.
   - 예) 박서준_school_uniform, 이세은_casual_summer, 김민지_office_blazer_white
   - 이름 없거나 불분명한 의상: 의상 특징만으로 ID 생성 (예: school_uniform_winter)
   - 같은 의상이 여러 화·장면에 나와도 반드시 동일한 normalized_id 사용.
4. location.canonical_category = 반드시 아래 목록 중 하나: apartment_interior, cafe, office, street, school, park, hospital, rooftop, subway, convenience_store, classroom, bedroom, living_room, kitchen, bathroom, balcony, forest, beach, mountain 등.
5. total_scenes = 해당 화의 텍스트에서 #숫자 마커를 그대로 세어서 기록. 마커 없으면 문단 수.
6. 출력은 JSON 객체만. 설명·마크다운 금지.
6. 【장소 분리 규칙】 물리적으로 다른 공간은 반드시 별도 항목으로 분리한다.
   - 예) "아파트 단지 앞"과 "엘리베이터"는 같은 아파트 건물 안이라도 별도 항목.
   - 예) "카페 내부"와 "카페 앞 거리"는 별도 항목.
   - 예) "교실"과 "복도"와 "운동장"은 각각 별도 항목.
   - 하나의 location 항목 = 시각적으로 단일한 배경 화면. 두 장소를 한 항목에 혼합 금지.
7. 【공간 일관성 규칙】 같은 건물/거주지에 속하는 방들은 parent_space와 space_style을 반드시 동일하게 작성한다.
   - parent_space: 소유자+건물 유형으로 명시. 예) "이세은의 고급 아파트", "박윤재의 오피스텔", "강남 카페 모모"
   - space_style: 그 건물 전체에 공통되는 인테리어 스타일·색조·분위기를 묘사. 방마다 달라지면 안 됨.
     예) "모던 럭셔리 인테리어. 흰색·베이지 톤. 대형 통창. 고급 대리석·원목 가구. 간접조명."
   - 같은 parent_space의 거실·주방·욕실·침실은 space_style이 100% 동일해야 시각 일관성 유지됨.
   - 독립된 단일 공간(길거리, 공원 등)은 parent_space를 빈 문자열("")로 둔다.`;

function buildPhase1Prompt(storyText: string): string {
  return `아래 전체 웹툰 스토리를 분석하여 다음 JSON 스키마로 반환하라.
씬 상세 내용은 포함하지 말고, 캐릭터/의상/장소 바이블과 화별 구조만 추출할 것.

스키마:
{
  "total_episodes": integer,
  "character_bible": [
    { "name": string, "appearance_core": string, "first_appear_episode": integer, "first_outfit_id": string, "total_appear_count": integer }
  ],
  "outfit_library": [
    { "normalized_id": string, "description": string, "first_appear_episode": integer, "appear_count": integer }
  ],
  "location_library": [
    {
      "canonical_category": string,
      "sub_category": string,
      "parent_space": string,
      "space_style": string,
      "description": string,
      "appear_count": integer
    }
  ],
  "episode_structure": [
    { "episode_number": integer, "title": string, "key_events": [string], "total_scenes": integer }
  ]
}

【location_library 작성 규칙 — 반드시 준수】

▶ 분리 규칙
- 물리적으로 다른 공간은 반드시 별도 항목으로 분리한다.
- 같은 건물·단지 안이라도 시각적으로 다른 공간이면 각각 별도 항목.
  예) 아파트 단지 앞 / 엘리베이터 / 복도 / 거실 / 주방 → 5개 항목
  예) 카페 내부 / 카페 앞 거리 → 2개 항목
  예) 교실 / 복도 / 운동장 → 3개 항목
- 하나의 항목 = 웹툰 한 컷의 배경으로 사용 가능한 단일 공간. 두 장소를 한 항목에 혼합 금지.
- sub_category: 공간의 구체적인 명칭을 한국어로 명확히 기록. 예) "이세은 아파트 거실"

▶ 공간 일관성 규칙 (parent_space + space_style)
- parent_space: 이 공간이 속한 상위 건물/거주지를 "소유자+건물유형"으로 명시.
  예) "이세은의 고급 아파트" / "박윤재의 오피스텔" / "강남 카페 모모"
  독립 공간(길거리·공원·지하철 등)은 parent_space = "" (빈 문자열)
- space_style: 해당 parent_space 전체에 공통되는 인테리어·색조·분위기. 방마다 달라지면 안 됨.
  예) parent_space="이세은의 고급 아파트" → 모든 방의 space_style = "모던 럭셔리. 흰색·베이지 톤. 대형 통창. 고급 대리석·원목 가구. 간접 조명."
  같은 parent_space의 거실·주방·욕실·침실은 space_style을 100% 동일하게 작성할 것.
- description: 해당 방만의 고유한 구체적 묘사 (space_style과 중복 가능하나 그 방만의 특징 추가).
  예) 거실 description = "통창 앞 대형 L자 소파. 아트 오브제. 간접 조명 켜진 저녁 분위기."

[전체 스토리]
${storyText}`;
}

// ─── Phase 2: 화별 씬 단위 정밀 분석 ────────────────────────

const PHASE2_SYSTEM = `너는 전문 웹툰 스토리보드 AI다.
주어진 **하나의 에피소드 텍스트**를 씬 단위로 정밀 분석하여 JSON만 출력한다.
【절대 규칙】
1. 씬 마커(#숫자)가 있으면 **각 #숫자 = 정확히 하나의 씬**. 절대로 합치거나 생략하지 말 것.
   - #1~#55가 있으면 반드시 55개의 scenes 배열 반환.
2. [상상 시작]/[회상 시작]/[꿈 시작] 등 마커를 정확히 감지하여 narrative_mode에 반영.
   - imagination → flux_image_prompt에 "surreal, dream-like, ethereal, soft glow" 추가
   - flashback → "sepia tone, monochrome, nostalgic, blurred edges" 추가
   - dream_sequence → "dreamy, soft focus, ethereal light, floating elements" 추가
3. 캐릭터 appearance_core와 outfit normalized_id는 아래 제공된 바이블과 **정확히 일치**시킬 것.
4. 【캐릭터 이름 규칙】 characters[].name은 반드시 바이블의 한국어 이름과 일치시킬 것. 로마자 표기 금지.
5. 【의상 ID 규칙】 outfit.normalized_id는 바이블에 있는 ID를 그대로 사용. 새 의상이 필요하면 '{한국어이름}_{의상특징}' 형식으로 생성.
6. flux_image_prompt는 FLUX.2 Pro용 완전한 영어 프롬프트.
7. 출력은 JSON 객체만. 설명·마크다운 금지.`;

function buildPhase2Prompt(
  episodeText: string,
  episodeNumber: number,
  bible: FullStoryBible,
  knownSceneCount: number
): string {
  const charBibleStr = bible.character_bible
    .map(c => `  - ${c.name}: ${c.appearance_core} | first_outfit: ${c.first_outfit_id}`)
    .join("\n");
  const outfitStr = bible.outfit_library
    .map(o => `  - ${o.normalized_id}: ${o.description}`)
    .join("\n");
  const locStr = bible.location_library
    .map(l => `  - [${l.canonical_category}] ${l.sub_category}: ${l.description}`)
    .join("\n");

  return `아래 ${episodeNumber}화 텍스트를 정밀 분석하라.
⚠️ 이 화에는 씬이 정확히 ${knownSceneCount}개 있다. scenes 배열에 반드시 ${knownSceneCount}개를 반환해야 한다.

[캐릭터 바이블 — 이 값을 그대로 사용할 것]
${charBibleStr || "  (없음)"}

[의상 라이브러리 — normalized_id를 정확히 일치시킬 것]
${outfitStr || "  (없음)"}

[장소 라이브러리 — canonical_category를 정확히 일치시킬 것]
${locStr || "  (없음)"}

스키마:
{
  "episode_number": ${episodeNumber},
  "title": string,
  "key_events": [string],
  "total_scenes": ${knownSceneCount},
  "scenes": [
    {
      "scene_id": "ep${episodeNumber}_sceneY",
      "scene_number": integer,
      "original_text": string,
      "characters": [
        { "name": string, "appearance_core": string, "outfit": { "normalized_id": string, "description": string, "accessories": [string] }, "expression": string, "pose": string|null }
      ],
      "location": { "canonical_category": string, "sub_category": string, "description": string },
      "background_elements": [string],
      "time_of_day": string|null,
      "narrative_mode": "normal"|"flashback"|"imagination"|"dream_sequence"|"other",
      "special_instructions": string,
      "panel_count": integer,
      "storyboard_description": string,
      "flux_image_prompt": string
    }
  ]
}

[${episodeNumber}화 텍스트]
${episodeText}`;
}

// ─── 메인 분석 함수 (2단계) ──────────────────────────────────

/**
 * 전체 스토리를 2단계로 분석합니다.
 * Phase 1: 바이블 추출 (전체 파일, 경량 출력)
 * Phase 2: 화별 씬 정밀 분석 (화 단위 개별 처리, 씬 수 보장)
 */
export async function analyzeFullStory(
  storyText: string,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<FullStoryAnalysisResult> {
  const report = (
    step: AnalysisProgressStep,
    message: string,
    progress: number,
    currentEpisode?: number,
    totalEpisodes?: number
  ) => onProgress?.({ step, message, progress, currentEpisode, totalEpisodes });

  // ── Step 0: 화별 텍스트 분리 ─────────────────────────────
  report("splitting", "스토리 파일을 화별로 분리 중...", 3);
  const episodeTexts = splitIntoEpisodes(storyText);

  if (episodeTexts.length === 0) throw new Error("화 구분을 찾을 수 없습니다. 파일 형식을 확인해주세요.");

  const totalEps = episodeTexts.length;

  // 각 화별 씬 수를 텍스트에서 미리 카운트 (Phase 2에서 검증용)
  const sceneCountByEp: Record<number, number> = {};
  for (const ep of episodeTexts) {
    sceneCountByEp[ep.number] = countScenesInEpisode(ep.text);
  }

  console.log("[FullStory] 화별 씬 수 (텍스트 카운트):", sceneCountByEp);

  // ── Step 1: Phase 1 — 바이블 추출 ───────────────────────
  report("phase1_bible", "Phase 1: 전체 구조 분석 중 (캐릭터/의상/장소 바이블)...", 8);

  let bible: FullStoryBible;
  try {
    const raw = await callAI(PHASE1_SYSTEM, buildPhase1Prompt(storyText));
    const parsed = parseJson<any>(raw, "Phase 1");

    bible = {
      total_episodes: parsed.total_episodes || totalEps,
      character_bible: parsed.character_bible || [],
      outfit_library: parsed.outfit_library || [],
      location_library: parsed.location_library || [],
      episode_structure: parsed.episode_structure || episodeTexts.map(e => ({
        episode_number: e.number,
        title: `${e.number}화`,
        key_events: [],
        total_scenes: sceneCountByEp[e.number] || 0,
      })),
    };

    // Phase 1 결과의 total_scenes보다 텍스트 카운트를 우선 사용
    for (const epStruct of bible.episode_structure) {
      if (sceneCountByEp[epStruct.episode_number]) {
        epStruct.total_scenes = sceneCountByEp[epStruct.episode_number];
      }
    }

    console.log(`[FullStory] Phase 1 완료: ${bible.character_bible.length}명, ${bible.outfit_library.length}개 의상, ${bible.location_library.length}개 장소`);
  } catch (e: any) {
    throw new Error(`Phase 1 실패: ${e.message}`);
  }

  // ── Step 2: Phase 1 bible에서 에피소드 목록만 구성 (씬 분석은 에피소드별 수동 실행)
  report("parsing", "에피소드 목록 구성 중...", 88);

  const analyzedEpisodes: FullStoryEpisode[] = episodeTexts.map(ep => {
    const epStruct = bible.episode_structure.find(e => e.episode_number === ep.number);
    return {
      episode_number: ep.number,
      title: epStruct?.title || `${ep.number}화`,
      key_events: epStruct?.key_events || [],
      total_scenes: sceneCountByEp[ep.number] || 0,
      scenes: [],   // 씬 분석은 에피소드 탭에서 개별 수동 실행
    };
  });

  console.log(`[FullStory] 에피소드 목록 구성 완료: ${analyzedEpisodes.length}화`);

  report("parsing", "최종 결과 정리 중...", 92);

  // 씬당 평균 3 패널로 추정 (Phase 2 미실행 시 대체값)
  const perEpisodePanelCount = analyzedEpisodes.map(ep => (ep.total_scenes || 0) * 3);
  const totalEstimatedPanels = perEpisodePanelCount.reduce((s, n) => s + n, 0);

  const result: FullStoryAnalysisResult = {
    total_episodes: analyzedEpisodes.length,
    character_bible: bible.character_bible,
    outfit_library: bible.outfit_library,
    location_library: bible.location_library,
    episodes: analyzedEpisodes,
    episodeTexts,  // 화별 원본 텍스트 — Pipeline 씬 텍스트 저장에 사용
    storyboard_overview: {
      total_estimated_panels: totalEstimatedPanels,
      per_episode_panel_count: perEpisodePanelCount,
    },
  };

  console.log(
    `[FullStory] 전체 분석 완료: ${result.total_episodes}화, ` +
    `씬 총 ${result.episodes.reduce((s, e) => s + e.scenes.length, 0)}개, ` +
    `패널 총 ${result.storyboard_overview.total_estimated_panels}개`
  );

  return result;
}

// ─── Firebase 에피소드 일괄 생성 ──────────────────────────────

import type { Character, Location, OutfitEntry } from "@webtoon/shared/types";
import type { Episode } from "@webtoon/shared/types";

/**
 * FullStoryEpisode의 씬들을 Pipeline 씬 텍스트 에디터에서 바로 사용할 수 있는 형태로 조합
 * 각 씬을 #숫자 마커와 original_text로 구성 → PipelinePage textarea에 자동 입력됨
 */
function buildEpisodeSceneText(ep: FullStoryEpisode): string {
  if (!ep.scenes || ep.scenes.length === 0) return "";

  return ep.scenes.map((scene) => {
    const sceneNum = scene.scene_number ?? 0;
    const rawText = (scene.original_text || "").trim();

    // 이미 #숫자 마커가 있으면 그대로 사용, 없으면 붙여줌
    const hasMarker = /^#\d+/.test(rawText);
    if (hasMarker) return rawText;
    return `#${sceneNum}\n${rawText}`;
  }).join("\n\n");
}

export async function createEpisodesFromAnalysis(
  projectId: string,
  analysis: FullStoryAnalysisResult,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ createdEpisodes: Episode[]; characters: Character[]; locations: Location[]; upsertStats: UpsertStats }> {
  const report = (step: AnalysisProgressStep, message: string, progress: number) =>
    onProgress?.({ step, message, progress });

  report("creating_references", "기존 레퍼런스 확인 중...", 93);

  const {
    ensureFirebaseReady,
    saveCharacter,
    saveLocation,
    saveOutfit,
    fetchCharacters,
    fetchLocations,
    fetchOutfits,
    firebaseService,
  } = await import("@/services/firebase");
  await ensureFirebaseReady();

  const now = Date.now();
  const stats: UpsertStats = { created: 0, updated: 0, skipped: 0, saveErrors: [] };

  // ── 기존 데이터 로드 (중복 체크 기준) ────────────────────────
  const [existingChars, existingLocs, existingOutfits, existingEpisodes] = await Promise.all([
    fetchCharacters(projectId).catch(() => [] as Character[]),
    fetchLocations(projectId).catch(() => [] as Location[]),
    fetchOutfits(projectId).catch(() => [] as OutfitEntry[]),
    firebaseService.fetchEpisodes(projectId).catch(() => [] as Episode[]),
  ]);

  // 빠른 조회를 위한 Map 생성
  const existingCharByName = new Map(existingChars.map(c => [c.name.trim(), c]));
  const existingLocByName  = new Map(existingLocs.map(l => [l.name.trim(), l]));
  const existingOutfitById = new Map(existingOutfits.map(o => [o.id, o]));
  const existingEpByNumber = new Map(existingEpisodes.map(e => [e.number, e]));

  // ── 1. 캐릭터 Upsert ─────────────────────────────────────────
  report("creating_references", "캐릭터 upsert 중...", 94);
  const characters: Character[] = [];

  for (const cb of analysis.character_bible) {
    const existing = existingCharByName.get(cb.name.trim());

    if (existing) {
      // 기존 캐릭터 업데이트 (ID 유지, appearance_core만 갱신)
      const updated: Character = {
        ...existing,
        description: cb.appearance_core,
        characterCore: cb.appearance_core,
        defaultPromptSnippet: cb.appearance_core,
        updatedAt: now,
      };
      try {
        await saveCharacter(projectId, updated);
        characters.push(updated);
        stats.updated++;
        console.log(`[FullStory] 캐릭터 업데이트: ${cb.name} (ID: ${existing.id})`);
      } catch (e: any) {
        const msg = `캐릭터 저장 실패 [${cb.name}]: ${e?.message || e}`;
        console.error(`[FullStory] ${msg}`, e);
        characters.push(updated);
        stats.saveErrors.push(msg);
      }
    } else {
      // 신규 캐릭터 생성
      const created: Character = {
        id: `char_${now}_${Math.random().toString(36).slice(2, 7)}`,
        projectId,
        name: cb.name,
        description: cb.appearance_core,
        characterCore: cb.appearance_core,
        defaultPromptSnippet: cb.appearance_core,
        references: [],
        createdAt: now,
        updatedAt: now,
      };
      try {
        await saveCharacter(projectId, created);
        characters.push(created);
        stats.created++;
        console.log(`[FullStory] 캐릭터 신규 생성: ${cb.name}`);
      } catch (e: any) {
        const msg = `캐릭터 저장 실패 [${cb.name}]: ${e?.message || e}`;
        console.error(`[FullStory] ${msg}`, e);
        characters.push(created);
        stats.saveErrors.push(msg);
      }
    }
  }

  // ── 2. 장소 Upsert ───────────────────────────────────────────
  report("creating_references", "장소 upsert 중...", 95);
  const locations: Location[] = [];

  for (const ll of analysis.location_library) {
    const locName = (ll.sub_category || ll.canonical_category).trim();
    const existing = existingLocByName.get(locName);

    if (existing) {
      const updated: Location = {
        ...existing,
        description: ll.description,
        locationCanonical: ll.canonical_category,
        defaultPromptSnippet: ll.description,
        ...(ll.parent_space ? { parentSpace: ll.parent_space } : {}),
        ...(ll.space_style  ? { spaceStyle:  ll.space_style  } : {}),
        updatedAt: now,
      };
      try {
        await saveLocation(projectId, updated);
        locations.push(updated);
        stats.updated++;
        console.log(`[FullStory] 장소 업데이트: ${locName}`);
      } catch (e: any) {
        const msg = `장소 저장 실패 [${locName}]: ${e?.message || e}`;
        console.error(`[FullStory] ${msg}`, e);
        locations.push(updated);
        stats.saveErrors.push(msg);
      }
    } else {
      const created: Location = {
        id: `loc_${now}_${Math.random().toString(36).slice(2, 7)}`,
        projectId,
        name: locName,
        description: ll.description,
        locationCanonical: ll.canonical_category,
        defaultPromptSnippet: ll.description,
        ...(ll.parent_space ? { parentSpace: ll.parent_space } : {}),
        ...(ll.space_style  ? { spaceStyle:  ll.space_style  } : {}),
        references: [],
        createdAt: now,
        updatedAt: now,
      };
      try {
        await saveLocation(projectId, created);
        locations.push(created);
        stats.created++;
        console.log(`[FullStory] 장소 신규 생성: ${locName}`);
      } catch (e: any) {
        const msg = `장소 저장 실패 [${locName}]: ${e?.message || e}`;
        console.error(`[FullStory] ${msg}`, e);
        locations.push(created);
        stats.saveErrors.push(msg);
      }
    }
  }

  // ── 3. 의상 Upsert (normalized_id 기준, OutfitEntry) ──────────────────────
  report("creating_references", "의상 upsert 중...", 96);

  for (const ol of analysis.outfit_library) {
    // 가장 긴 prefix 매칭으로 캐릭터 찾기 (예: "이세은_casual_summer" → "이세은")
    // 단순 find() 대신 longest-match를 사용해 "이" vs "이세은" 같은 오매칭 방지
    let matchedChar: FullStoryCharacter | undefined;
    let longestMatchLen = 0;
    for (const cb of analysis.character_bible) {
      const normalizedCbName = cb.name.toLowerCase().replace(/\s+/g, "_");
      if (
        ol.normalized_id.toLowerCase().startsWith(normalizedCbName + "_") ||
        ol.normalized_id.toLowerCase() === normalizedCbName
      ) {
        if (normalizedCbName.length > longestMatchLen) {
          matchedChar = cb;
          longestMatchLen = normalizedCbName.length;
        }
      }
    }

    let charName: string;
    let charId: string;

    if (matchedChar) {
      charName = matchedChar.name;
      charId = characters.find(c => c.name === charName)?.id || "unknown";
    } else {
      // character_bible 매칭 실패 시 → 로드된 characters 배열에서 직접 prefix 매칭 시도
      let bestChar: typeof characters[0] | undefined;
      let bestMatchLen = 0;
      for (const c of characters) {
        const normalizedCName = c.name.toLowerCase().replace(/\s+/g, "_");
        if (
          ol.normalized_id.toLowerCase().startsWith(normalizedCName + "_") ||
          ol.normalized_id.toLowerCase() === normalizedCName
        ) {
          if (normalizedCName.length > bestMatchLen) {
            bestChar = c;
            bestMatchLen = normalizedCName.length;
          }
        }
      }
      if (bestChar) {
        charName = bestChar.name;
        charId = bestChar.id || "unknown";
      } else {
        // 최종 fallback: normalized_id 에서 한국어/영문 이름 추출 불가 → "unknown"
        charName = ol.normalized_id.split("_")[0];
        charId = "unknown";
        console.warn(`[FullStory] 의상 캐릭터 매칭 실패: ${ol.normalized_id} → charId=unknown`);
      }
    }

    let existing = existingOutfitById.get(ol.normalized_id);

    // ── 중복 의상 감지 (ID가 다르지만 같은 캐릭터·의상인 경우) ──
    // 예: 이전 분석이 "seojun_school_uniform"을 생성하고, 이번 분석이 "박서준_school_uniform"을 생성할 때
    if (!existing && charId !== "unknown") {
      // 현재 의상의 ID 키워드 (캐릭터 이름 prefix 제거 후 남은 부분)
      const charNameNorm = charName.toLowerCase().replace(/\s+/g, "_");
      const idWithoutChar = ol.normalized_id.toLowerCase().startsWith(charNameNorm + "_")
        ? ol.normalized_id.toLowerCase().slice(charNameNorm.length + 1)
        : ol.normalized_id.toLowerCase();

      // 같은 캐릭터의 모든 기존 의상에서 후보 찾기
      for (const [existId, existOutfit] of existingOutfitById) {
        if (existOutfit.characterId !== charId && existOutfit.characterName !== charName) continue;

        // 기존 ID의 캐릭터 prefix 제거
        const existCharNorm = existOutfit.characterName.toLowerCase().replace(/\s+/g, "_");
        const existIdWithoutChar = existId.toLowerCase().startsWith(existCharNorm + "_")
          ? existId.toLowerCase().slice(existCharNorm.length + 1)
          : existId.toLowerCase();

        // 키워드 배열로 변환 후 겹치는 단어 비율 계산
        const newKeywords = idWithoutChar.split("_").filter(w => w.length > 1);
        const existKeywords = existIdWithoutChar.split("_").filter(w => w.length > 1);
        if (newKeywords.length === 0 || existKeywords.length === 0) continue;

        const overlap = newKeywords.filter(w => existKeywords.includes(w)).length;
        const overlapRatio = overlap / Math.max(newKeywords.length, existKeywords.length);

        if (overlapRatio >= 0.6) {
          // 같은 의상으로 판정 → 기존 항목 재사용
          console.log(`[FullStory] 중복 의상 감지: "${ol.normalized_id}" ≈ "${existId}" (겹침 ${Math.round(overlapRatio * 100)}%) → 병합`);
          existing = existOutfit;
          break;
        }
      }
    }

    const outfitData: OutfitEntry = existing
      ? {
          ...existing,
          description: ol.description,
          characterId: charId,
          characterName: charName,
          usageCount: (existing.usageCount || 0) + (ol.appear_count || 1),
          updatedAt: now,
        } as OutfitEntry
      : {
          id: ol.normalized_id,
          projectId,
          characterId: charId,
          characterName: charName,
          label: ol.normalized_id.replace(/_/g, " "),
          description: ol.description,
          references: [],
          usageCount: ol.appear_count || 1,
          createdAt: now,
          updatedAt: now,
        } as OutfitEntry;

    try {
      await saveOutfit(projectId, outfitData);
      if (existing) {
        stats.updated++;
        console.log(`[FullStory] 의상 업데이트: ${ol.normalized_id}`);
      } else {
        stats.created++;
        console.log(`[FullStory] 의상 신규 생성: ${ol.normalized_id}`);
      }
    } catch (e: any) {
      const msg = `의상 저장 실패 [${ol.normalized_id}]: ${e?.message || e}`;
      console.error(`[FullStory] ${msg}`, e);
      stats.saveErrors.push(msg);
    }
  }

  // ── 4. 에피소드 Upsert (화 번호 기준) ────────────────────────
  report("creating_episodes", "에피소드 upsert 중...", 97);
  const createdEpisodes: Episode[] = [];

  for (const ep of analysis.episodes) {
    const existing = existingEpByNumber.get(ep.episode_number);

    const episode: Episode = existing
      ? {
          // 기존 에피소드 → ID·status·createdAt 유지, 씬 데이터만 교체
          ...existing,
          title: ep.title || existing.title,
          sceneData: ep.scenes as unknown[],
          keyEvents: ep.key_events,
          totalScenes: ep.total_scenes,
          updatedAt: now,
        }
      : {
          id: `ep_${now}_${ep.episode_number}`,
          projectId,
          number: ep.episode_number,
          title: ep.title || `${ep.episode_number}화`,
          status: "draft" as const,
          completedSteps: [],
          sceneData: ep.scenes as unknown[],
          keyEvents: ep.key_events,
          totalScenes: ep.total_scenes,
          createdAt: now + ep.episode_number,
          updatedAt: now + ep.episode_number,
        };

    try {
      await firebaseService.saveEpisode(projectId, episode);
      createdEpisodes.push(episode);
      if (existing) {
        console.log(`[FullStory] ${ep.episode_number}화 업데이트 (ID: ${existing.id})`);
        stats.updated++;
      } else {
        console.log(`[FullStory] ${ep.episode_number}화 신규 생성`);
        stats.created++;
      }

      // ── Pipeline 씬 텍스트 저장 — 화별 원본 텍스트를 그대로 저장 ──
      // (씬 단위 분석은 에피소드 탭에서 개별 수동 실행)
      const rawEpText = analysis.episodeTexts.find(t => t.number === ep.episode_number)?.text || "";
      if (rawEpText.trim()) {
        try {
          await firebaseService.savePipelineSnapshot(projectId, episode.id, {
            sceneText: rawEpText,
            analysisMode: null,
            analysis: null,
            editingPanels: [],
            panelPrompts: {},
            generatedImages: {},
            refImages: {},
            _fromFullAnalysis: true,
          });
          console.log(`[FullStory] ${ep.episode_number}화 원본 텍스트 Pipeline 저장 완료`);
        } catch (e) {
          console.warn(`[FullStory] ${ep.episode_number}화 Pipeline 스냅샷 저장 실패`, e);
        }
      }
    } catch (e: any) {
      const msg = `${ep.episode_number}화 저장 실패: ${e?.message || e}`;
      console.error(`[FullStory] ${msg}`, e);
      createdEpisodes.push(episode);
      stats.saveErrors.push(msg);
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  const totalScenes = analysis.episodes.reduce((s, e) => s + e.scenes.length, 0);
  const statsMsg = `신규 ${stats.created}개 · 업데이트 ${stats.updated}개 · 건너뜀 ${stats.skipped}개`;

  report(
    "done",
    `완료! ${createdEpisodes.length}화 · 캐릭터 ${characters.length}명 · 장소 ${locations.length}개 · 씬 ${totalScenes}개 (${statsMsg})`,
    100
  );

  console.log(`[FullStory] Upsert 통계: ${statsMsg}`);
  return { createdEpisodes, characters, locations, upsertStats: stats };
}

/** Upsert 결과 통계 */
export interface UpsertStats {
  created: number;
  updated: number;
  skipped: number;
  /** 실제 Firebase 저장 실패 목록 (에러 메시지) */
  saveErrors: string[];
}
