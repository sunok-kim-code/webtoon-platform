// ============================================================
// 공유 상수 — 통합 내보내기
// ============================================================

// ─── SVG 말풍선 도형 ─────────────────────────────────────────
export { SVG_BALLOONS } from "./svgBalloons";
export type { SvgBalloonDef, SvgBalloonTextArea, FlipValue } from "./svgBalloons";

// ─── 버블(말풍선) 유형 ──────────────────────────────────────
export { BUBBLE_TYPES, getBubbleLabel, isSvgBalloonStyle } from "./bubbleTypes";
export type { BubbleTypeDef } from "./bubbleTypes";

// ─── SFX(효과음) 프리셋 ─────────────────────────────────────
export { SFX_PRESETS, getSfxCssFilter, SFX_CATEGORIES } from "./sfxPresets";
export type { SfxPresetDef, SfxFilterType, SfxCategory } from "./sfxPresets";

// ─── 폰트 목록 ──────────────────────────────────────────────
export { FONT_LIST, FONT_LIST_KR, FONT_LIST_JP, cleanFontFamily } from "./fonts";
export type { FontEntry } from "./fonts";

// ─── 페이지/레이아웃 상수 ────────────────────────────────────
export {
  PAGE_W,
  PAGE_H,
  PAGE_H_MAX,
  PANEL_GAP,
  DEFAULT_STRIP_WIDTH,
  DEFAULT_GUTTER,
  SCENE_GAP_MULTIPLIER,
} from "./layout";

// ─── Firebase Storage 경로 ───────────────────────────────────
export const STORAGE_PATHS = {
  panelImage: (pid: string, eid: string, idx: number) =>
    `projects/${pid}/episodes/${eid}/panels/${idx}.png`,
  finalPage: (pid: string, eid: string, idx: number) =>
    `projects/${pid}/episodes/${eid}/final/${idx}.png`,
  characterRef: (pid: string, cid: string, refId: string) =>
    `projects/${pid}/characters/${cid}/refs/${refId}.png`,
  locationRef: (pid: string, lid: string, refId: string) =>
    `projects/${pid}/locations/${lid}/refs/${refId}.png`,
} as const;

// ─── 타입 재내보내기 (편의) ──────────────────────────────────
export { DEFAULT_CONFIG } from "../types/figmaExport";
export { CHARACTER_SCORE_WEIGHTS, LOCATION_SCORE_WEIGHTS } from "../types/reference";
