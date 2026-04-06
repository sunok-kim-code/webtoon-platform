// ============================================================
// Reference & Continuity System 타입 (v2.1 신규)
// Production-driven 레퍼런스 시스템
// ============================================================

/** 캐릭터 레퍼런스 태그 */
export interface CharacterRefTags {
  emotion: string;          // happy, angry, sad, neutral, ...
  outfit: string;           // uniform, casual, formal, ...
  angle: string;            // front, side, back, three-quarter
  action?: string;          // standing, sitting, running, ...
}

/** 로케이션 레퍼런스 태그 */
export interface LocationRefTags {
  timeOfDay: string;        // morning, afternoon, evening, night
  weather?: string;         // clear, rainy, cloudy, ...
  mood?: string;            // bright, dark, mysterious, ...
}

/** 레퍼런스 이미지 (캐릭터 또는 로케이션) */
export interface ReferenceImage {
  id: string;
  storageUrl: string;       // Firebase Storage URL
  tags: CharacterRefTags | LocationRefTags;
  sourceEpisode: string;    // 출처 에피소드 ID
  sourcePanel: number;      // 출처 패널 인덱스
  usageCount: number;       // 사용 횟수 (검증된 레퍼런스일수록 높음)
  quality: number;          // 1-5 사용자 평가
  createdAt: number;
}

/** 의상 변형 — 캐릭터별 의상 카탈로그 항목 */
export interface OutfitVariant {
  id: string;
  name: string;                    // "교복", "캐주얼", "정장" 등
  description: string;             // 상세 의상 설명 (프롬프트용)
  promptSnippet: string;           // AI 생성 시 사용할 프롬프트
  accessories?: string[];          // 소품: ["안경", "목걸이", "가방"] 등
  colorPalette?: string[];         // 주요 색상: ["navy", "white", "red"]
  thumbnailRefId?: string;         // 대표 레퍼런스 이미지 ID
  isDefault?: boolean;             // 기본 의상 여부
  createdAt: number;
}

/** 캐릭터 시각 특성 (사용자 편집 가능) */
export interface CharacterTraits {
  gender?: string;            // 성별: male, female, androgynous
  age?: string;               // 나이대: child, teen, 20s, 30s, 40s+
  hairStyle?: string;         // 헤어스타일: short bob, long straight, wavy, etc.
  hairColor?: string;         // 머리색: black, brown, blonde, red, etc.
  eyeColor?: string;          // 눈 색: dark brown, blue, green, etc.
  eyeShape?: string;          // 눈 모양: round, almond, sharp, droopy, etc.
  skinTone?: string;          // 피부색: fair, light, medium, tan, dark
  bodyType?: string;          // 체형: slim, average, athletic, curvy, muscular
  height?: string;            // 키: short, average, tall
  faceShape?: string;         // 얼굴형: oval, round, square, heart, long
  distinctFeatures?: string;  // 특징: scar on left cheek, glasses, mole under eye, etc.
  personality?: string;       // 성격 (표정 기본값에 영향): cheerful, cold, shy, etc.
}

/** 캐릭터 프로필 */
export interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
  defaultPromptSnippet: string;   // AI 프롬프트에 자동 포함되는 텍스트
  characterCore?: string;          // 기본 외형 설명 (의상 제외): 얼굴·체형·헤어 등
  baseRefImageId?: string;         // 사용자가 지정한 기준 외형 레퍼런스 이미지 ID
  references: ReferenceImage[];
  currentOutfitId?: string;         // 현재 씬의 활성 의상 ID (OutfitEntry.id 참조)
  traits?: CharacterTraits;          // 시각 특성 (사용자 편집 가능)
  createdAt: number;
  updatedAt: number;
}

/** 로케이션(장소) 프로필 */
export interface Location {
  id: string;
  projectId: string;
  name: string;
  description: string;
  defaultPromptSnippet: string;
  locationCanonical?: string;    // 표준 카테고리: "apartment_living_room", "office_interior", etc.
  parentSpace?: string;          // 같은 건물/거주지 묶음 식별자 (예: "이세은의 고급 아파트")
  spaceStyle?: string;           // 건물 전체 공통 인테리어 스타일·색조 묘사
  references: ReferenceImage[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// 의상 라이브러리 (Outfit Library) — v2.1 신규
// 캐릭터와 독립적으로 의상을 관리하고 씬 간 재사용
// ============================================================

/** 의상 라이브러리 엔트리 */
export interface OutfitEntry {
  id: string;                    // normalized_id: e.g., "지호_outfit_suit_black"
  projectId: string;
  characterId: string;           // 소속 캐릭터 ID
  characterName: string;         // 빠른 조회용 캐릭터 이름
  label: string;                 // 표시명: "검정 정장", "교복", "캐주얼" 등
  description: string;           // 의상 전용 프롬프트 텍스트 (character_core와 결합)
  references: ReferenceImage[];  // 이 의상 전용 레퍼런스 이미지
  colorPalette?: string[];       // 주요 색상: ["navy", "white"]
  accessories?: string[];        // 소품: ["안경", "가방"]
  isDefault?: boolean;           // 기본 의상 여부
  usageCount: number;            // 사용 횟수
  createdAt: number;
  updatedAt: number;
}

/** 장소 canonical 카테고리 목록 */
export const LOCATION_CANONICAL_CATEGORIES: Record<string, string> = {
  // 실내 주거
  apartment_living_room: "아파트 거실",
  apartment_bedroom: "아파트 침실",
  apartment_kitchen: "아파트 주방",
  house_exterior: "주택 외관",
  // 교육
  school_classroom: "학교 교실",
  school_hallway: "학교 복도",
  school_rooftop: "학교 옥상",
  school_gym: "학교 체육관",
  school_library: "학교 도서관",
  // 업무
  office_interior: "사무실 내부",
  office_meeting_room: "회의실",
  office_lobby: "오피스 로비",
  // 상업
  cafe_interior: "카페 내부",
  restaurant_interior: "레스토랑 내부",
  convenience_store: "편의점",
  shopping_mall: "쇼핑몰",
  // 야외
  park_daytime: "공원 낮",
  park_night: "공원 밤",
  street_urban: "도심 거리",
  street_suburban: "주택가 거리",
  alley: "골목길",
  // 자연
  forest: "숲",
  beach: "해변",
  mountain: "산",
  // 교통
  subway_interior: "지하철 내부",
  subway_station: "지하철역",
  bus_interior: "버스 내부",
  car_interior: "자동차 내부",
  // 기타
  hospital_corridor: "병원 복도",
  gym_fitness: "헬스장",
  rooftop_urban: "도심 옥상",
  fantasy_castle: "판타지 성",
  fantasy_forest: "판타지 숲",
};

/** 컨텍스트 체인 — 씬 연속성 추적 */
export interface ContextChain {
  episodeId: string;
  scenes: SceneContext[];
}

export interface SceneContext {
  sceneId: string;
  startPanel: number;
  endPanel: number;
  characters: string[];           // character IDs
  locationId?: string;
  panelResults: PanelResult[];
}

export interface PanelResult {
  panelIndex: number;
  storageUrl: string;
  prompt: string;
  providerId: string;
}

/** 레퍼런스 스코어링 가중치 (캐릭터) */
export const CHARACTER_SCORE_WEIGHTS = {
  emotionMatch: 0.30,
  outfitMatch: 0.25,
  angleMatch: 0.15,
  qualityRating: 0.15,
  recencyBonus: 0.10,
  usageBonus: 0.05,
} as const;

/** 레퍼런스 스코어링 가중치 (로케이션) */
export const LOCATION_SCORE_WEIGHTS = {
  timeOfDayMatch: 0.35,
  weatherMatch: 0.25,
  moodMatch: 0.20,
  qualityRating: 0.15,
  usageBonus: 0.05,
} as const;

/** 의상 동의어/정규화 맵 — 다양한 표현을 표준 키로 매핑 */
export const OUTFIT_SYNONYMS: Record<string, string[]> = {
  uniform: ["uniform", "school uniform", "교복", "유니폼", "제복"],
  casual: ["casual", "캐주얼", "일상복", "평상복", "사복", "hoodie", "t-shirt", "tee", "sweatshirt", "jogger", "jeans", "denim", "sneakers"],
  formal: ["formal", "정장", "수트", "suit", "business", "dress shirt", "blazer", "necktie", "tie", "vest", "tailored"],
  school: ["school", "school uniform", "교복", "학교"],
  sport: ["sport", "sports", "운동복", "체육복", "tracksuit", "athletic", "gym"],
  pajamas: ["pajamas", "잠옷", "파자마", "sleepwear", "nightgown", "robe"],
  swimwear: ["swimwear", "수영복", "비키니", "bikini", "swim trunks"],
  traditional: ["traditional", "한복", "hanbok", "기모노", "kimono"],
  military: ["military", "군복", "전투복", "combat", "camouflage"],
  costume: ["costume", "코스튬", "변장", "disguise"],
};

/** 의상 문자열을 표준 키로 정규화 */
export function normalizeOutfit(outfit: string): string {
  if (!outfit) return "default";
  const lower = outfit.toLowerCase().trim();
  for (const [key, synonyms] of Object.entries(OUTFIT_SYNONYMS)) {
    if (synonyms.some(s => lower.includes(s) || s.includes(lower))) {
      return key;
    }
  }
  return lower;
}
