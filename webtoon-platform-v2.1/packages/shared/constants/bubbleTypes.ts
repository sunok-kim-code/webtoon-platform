// ============================================================
// 버블(말풍선) 유형 정의 (index.html L4379–4395에서 추출)
// UI 렌더링 + Figma 내보내기에서 공통 사용
// ============================================================

import type { BubbleStyleName } from "../types/panel";

export interface BubbleTypeDef {
  name: string;               // 한글 표시명
  tail: boolean;              // 캔버스 꼬리 그리기 여부
  bg: string;                 // 배경색
  border: string;             // 테두리색
  borderWidth: number;
  fontWeight: number;
  shadow: boolean;

  // SVG path 기반 말풍선 (speech, speechWide, speechFlat, speechRound, gourd, shout)
  svgBalloon?: string;
  defaultPadding?: number;

  // 특수 도형 플래그
  ellipse?: boolean;
  boxShape?: boolean;
  cloudShape?: boolean;
  waveShape?: boolean;
  concentrationLines?: boolean;
  plainText?: boolean;
  dashed?: boolean;

  // 기본 스타일 오버라이드
  color?: string;
  radius?: number;
}

export const BUBBLE_TYPES: Record<BubbleStyleName, BubbleTypeDef> = {
  speech: {
    name: "기본 타원",
    tail: false,
    bg: "#fff",
    border: "#333",
    borderWidth: 2.5,
    fontWeight: 500,
    shadow: true,
    svgBalloon: "speech",
    defaultPadding: 6,
  },
  speechWide: {
    name: "넓은 타원",
    tail: false,
    bg: "#fff",
    border: "#333",
    borderWidth: 2.5,
    fontWeight: 500,
    shadow: true,
    svgBalloon: "speechWide",
    defaultPadding: 2,
  },
  speechFlat: {
    name: "원형 (우측)",
    tail: false,
    bg: "#fff",
    border: "#333",
    borderWidth: 2.5,
    fontWeight: 500,
    shadow: true,
    svgBalloon: "speechFlat",
    defaultPadding: 1,
  },
  speechRound: {
    name: "원형 (우측하단)",
    tail: false,
    bg: "#fff",
    border: "#333",
    borderWidth: 2.5,
    fontWeight: 500,
    shadow: true,
    svgBalloon: "speechRound",
    defaultPadding: 1,
  },
  shout: {
    name: "폭발형",
    tail: false,
    bg: "#fff",
    border: "#333",
    borderWidth: 2.5,
    fontWeight: 700,
    shadow: true,
    svgBalloon: "shout",
  },
  gourd: {
    name: "이중",
    tail: false,
    bg: "#fff",
    border: "#333",
    borderWidth: 2.5,
    fontWeight: 500,
    shadow: true,
    svgBalloon: "gourd",
    defaultPadding: 4,
  },
  thought: {
    name: "생각",
    tail: true,
    bg: "#fff",
    border: "#999",
    borderWidth: 2,
    ellipse: true,
    fontWeight: 400,
    dashed: true,
    shadow: true,
  },
  cloud: {
    name: "구름",
    tail: true,
    bg: "#fff",
    border: "#888",
    borderWidth: 2,
    cloudShape: true,
    fontWeight: 400,
    shadow: true,
  },
  box: {
    name: "사각형",
    tail: true,
    bg: "#fff",
    border: "#222",
    borderWidth: 3,
    boxShape: true,
    radius: 10,
    fontWeight: 500,
    shadow: true,
  },
  wave: {
    name: "물결",
    tail: true,
    bg: "#fff",
    border: "#5555cc",
    borderWidth: 2,
    waveShape: true,
    fontWeight: 400,
    shadow: true,
    color: "#333",
  },
  concentration: {
    name: "집중선",
    tail: false,
    bg: "transparent",
    border: "#000",
    borderWidth: 1.5,
    fontWeight: 700,
    shadow: false,
    concentrationLines: true,
  },
  narration: {
    name: "나레이션",
    tail: false,
    bg: "transparent",
    border: "none",
    borderWidth: 0,
    radius: 0,
    fontWeight: 500,
    color: "#000",
    shadow: false,
  },
  whisper: {
    name: "속삭임",
    tail: true,
    bg: "#f0f0f0",
    border: "#aaa",
    borderWidth: 2,
    ellipse: true,
    fontWeight: 400,
    dashed: true,
    color: "#555",
    shadow: true,
  },
  text: {
    name: "텍스트",
    tail: false,
    bg: "#ffffff",
    border: "none",
    borderWidth: 0,
    radius: 2,
    fontWeight: 500,
    color: "#111",
    shadow: false,
    plainText: true,
  },
  textCircle: {
    name: "텍스트원형",
    tail: false,
    bg: "#ffffff",
    border: "none",
    borderWidth: 0,
    ellipse: true,
    fontWeight: 500,
    color: "#111",
    shadow: false,
    plainText: true,
  },
};

/** 버블 스타일 이름 → 한글 레이블 */
export function getBubbleLabel(style: BubbleStyleName): string {
  return BUBBLE_TYPES[style]?.name ?? style;
}

/** SVG 말풍선을 사용하는 스타일인지 여부 */
export function isSvgBalloonStyle(style: BubbleStyleName): boolean {
  return !!BUBBLE_TYPES[style]?.svgBalloon;
}
