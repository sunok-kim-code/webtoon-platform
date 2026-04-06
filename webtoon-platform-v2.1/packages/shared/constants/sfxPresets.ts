// ============================================================
// SFX(효과음) 프리셋 정의 (index.html L4424–4434에서 추출)
// 붓글씨 스타일 효과음 — 웹앱 UI + Figma 내보내기 공통
// ============================================================

export type SfxFilterType = "outline" | "glow" | "motion" | "shake" | "";

export type SfxCategory =
  | "impact"
  | "water"
  | "electric"
  | "speed"
  | "rumble"
  | "emotion"
  | "silence"
  | "comic"
  | "nature";

export interface SfxPresetDef {
  name: string;             // 한글 카테고리명
  examples: string[];       // 예시 효과음 텍스트
  fontFamily: string;       // CSS font-family
  color: string;
  stroke: string;
  strokeWidth: number;
  skew: number;             // CSS skewX 각도
  rotate: number;           // CSS rotate 각도
  filterType: SfxFilterType;
  scale: number;
}

export const SFX_PRESETS: Record<SfxCategory, SfxPresetDef> = {
  impact: {
    name: "타격",
    examples: ["쾅!", "퍽!", "빠직!", "와장창!", "탁!", "쿵!"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 3,
    skew: 0,
    rotate: -5,
    filterType: "outline",
    scale: 1.2,
  },
  water: {
    name: "물/바람",
    examples: ["콸콸", "솨아", "휘이잉", "쏴아", "파닥"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 2.5,
    skew: -8,
    rotate: -3,
    filterType: "outline",
    scale: 1.0,
  },
  electric: {
    name: "전기/빛",
    examples: ["찌직!", "번쩍!", "파지직!", "치지직", "스파크!"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 3,
    skew: -14,
    rotate: 0,
    filterType: "glow",
    scale: 1.1,
  },
  speed: {
    name: "이동/속도",
    examples: ["슈우웅", "휙!", "부릉!", "비이잉", "쓩!"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 2.5,
    skew: -20,
    rotate: 0,
    filterType: "motion",
    scale: 1.0,
  },
  rumble: {
    name: "진동/울림",
    examples: ["우우웅", "드르르", "와르르", "덜덜덜", "부르르", "쿵"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 3,
    skew: -3,
    rotate: -2,
    filterType: "outline",
    scale: 1.0,
  },
  emotion: {
    name: "감정/심리",
    examples: ["두근두근", "울컥", "심쿵", "으으", "후유"],
    fontFamily: "'Nanum Pen Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 2,
    skew: 0,
    rotate: 0,
    filterType: "outline",
    scale: 1.0,
  },
  silence: {
    name: "정적/분위기",
    examples: ["...", "쉬잇", "조용", "싸늘", "서늘"],
    fontFamily: "'Nanum Pen Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 1.5,
    skew: 0,
    rotate: 0,
    filterType: "outline",
    scale: 0.9,
  },
  comic: {
    name: "코믹",
    examples: ["뿅!", "뽕!", "삐용", "뿌우", "헉!"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 3,
    skew: -6,
    rotate: -4,
    filterType: "outline",
    scale: 1.1,
  },
  nature: {
    name: "자연/환경",
    examples: ["우르르", "번개!", "추적추적", "사각사각", "바스락"],
    fontFamily: "'Nanum Brush Script',cursive",
    color: "#000000",
    stroke: "#ffffff",
    strokeWidth: 2,
    skew: 2,
    rotate: 0,
    filterType: "outline",
    scale: 1.0,
  },
};

/** SFX CSS filter 문자열 생성 (index.html L4437–4446에서 추출) */
export function getSfxCssFilter(
  filterType: SfxFilterType,
  strokeColor: string,
  color: string
): string {
  switch (filterType) {
    case "shake":
      return `drop-shadow(2px 2px 0 ${strokeColor})`;
    case "motion":
      return `drop-shadow(4px 0 3px ${strokeColor}66)`;
    case "glow":
      return `drop-shadow(0 0 8px ${color})`;
    case "outline":
      return `drop-shadow(3px 3px 0 ${strokeColor})`;
    default:
      return "";
  }
}

/** 프리셋의 모든 카테고리 키 */
export const SFX_CATEGORIES = Object.keys(SFX_PRESETS) as SfxCategory[];
