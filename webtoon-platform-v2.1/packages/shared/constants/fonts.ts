// ============================================================
// 폰트 목록 정의 (index.html L4396–4417에서 추출)
// 한국어 + 일본어 Google Fonts
// ============================================================

export interface FontEntry {
  value: string;   // CSS font-family 값
  label: string;   // 표시명
}

/** 한국어 폰트 목록 */
export const FONT_LIST_KR: FontEntry[] = [
  { value: "'Noto Sans KR',sans-serif", label: "기본 (Noto Sans)" },
  { value: "'Gothic A1',sans-serif", label: "고딕" },
  { value: "'Nanum Myeongjo',serif", label: "나눔명조" },
  { value: "'Nanum Gothic',sans-serif", label: "나눔고딕" },
  { value: "'Black Han Sans',sans-serif", label: "블랙한산스" },
  { value: "'Jua',sans-serif", label: "주아" },
  { value: "'Do Hyeon',sans-serif", label: "도현" },
  { value: "'Gaegu',cursive", label: "개구" },
  { value: "'Nanum Brush Script',cursive", label: "나눔붓체" },
  { value: "'Nanum Pen Script',cursive", label: "나눔펜체" },
  { value: "monospace", label: "모노스페이스" },
];

/** 일본어 폰트 목록 */
export const FONT_LIST_JP: FontEntry[] = [
  { value: "'Noto Sans JP',sans-serif", label: "🇯🇵 기본 (Noto Sans JP)" },
  { value: "'Noto Serif JP',serif", label: "🇯🇵 명조 (Noto Serif JP)" },
  { value: "'Shippori Mincho',serif", label: "🇯🇵 시포리 명조 (나레이션용)" },
  { value: "'Shippori Antique',sans-serif", label: "🇯🇵 시포리 안틱 (만화풍)" },
  { value: "'Mochiy Pop One',sans-serif", label: "🇯🇵 모찌팝 (효과음/강조)" },
  { value: "'Mochiy Pop P One',sans-serif", label: "🇯🇵 모찌팝P (효과음/강조)" },
];

/** 전체 폰트 목록 (한국어 + 일본어) */
export const FONT_LIST: FontEntry[] = [...FONT_LIST_KR, ...FONT_LIST_JP];

/** CSS font-family → Figma 폰트명 변환 (따옴표/fallback 제거) */
export function cleanFontFamily(cssFont: string): string {
  return cssFont ? cssFont.split(",")[0].replace(/'/g, "").trim() : "Noto Sans KR";
}
