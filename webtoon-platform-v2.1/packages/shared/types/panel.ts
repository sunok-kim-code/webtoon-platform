// ============================================================
// Panel & Bubble 타입 정의
// 기존 types.ts에서 추출 + v2.1 확장
// ============================================================

/** 버블(말풍선/나레이션/효과음) 타입 */
export type BubbleType = "dialogue" | "narration" | "sfx";

/** 말풍선 스타일 (v2.1: SVG 기반 버블 포함) */
export type BubbleStyleName =
  | "speech" | "speechWide" | "speechFlat" | "speechRound"
  | "gourd" | "shout" | "thought" | "cloud" | "box" | "wave"
  | "concentration" | "narration" | "whisper" | "text" | "textCircle";

/** SVG 패스 데이터 (말풍선 도형 전달용) */
export interface SvgPathData {
  pathD: string;
  viewBox: string;
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

/** 버블 스타일 속성 */
export interface BubbleStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  rotation?: number;
  opacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
  strokeWidth?: number;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  isEllipse?: boolean;
  isBox?: boolean;
  isDashed?: boolean;
  isConcentration?: boolean;
  concentrationColor?: string;
  concentrationPadding?: number;
  concentrationOuterMargin?: number;
  skewX?: number;
}

/** 버블 데이터 (웹앱 ↔ 플러그인 전송 단위) */
export interface BubbleData {
  id: string;
  type: BubbleType;
  text: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  svgPath?: SvgPathData;
  bubbleStyle?: BubbleStyleName;
  style: BubbleStyle;
  pageIndex: number;
  objectIndex: number;
}

/** 이미지 데이터 (웹앱 → 플러그인 전송 단위) */
export interface ImageData {
  id: string;
  pageIndex: number;
  base64?: string;              // data:image/... (v1 호환)
  storageUrl?: string;          // Firebase Storage URL (v2.1 우선)
  bounds: { x: number; y: number; w: number; h: number };
}

/** 페이지 전체 데이터 (일괄 동기화용) */
export interface PageData {
  pageIndex: number;
  episodeNum: number;
  image?: ImageData;
  images?: ImageData[];
  bubbles: BubbleData[];
  pageSize?: { w: number; h: number };
}
