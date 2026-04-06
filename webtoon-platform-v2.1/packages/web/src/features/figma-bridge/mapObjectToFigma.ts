// ============================================================
// mapObjectToFigma — 에디터 오브젝트 → Figma 전송 형식 변환
// index.html L4974–5046에서 추출
// ============================================================

import type {
  BubbleData,
  BubbleStyleName,
  SvgPathData,
  ImageData,
} from "@webtoon/shared";
import { BUBBLE_TYPES, SVG_BALLOONS, cleanFontFamily } from "@webtoon/shared";

// ─── 에디터 오브젝트 타입 (index.html 내부 형식) ─────────────

export interface EditorObject {
  id: string;
  type: "bubble" | "sfx" | "panel" | "image";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  bubbleStyle?: BubbleStyleName;
  flipBalloon?: string;
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
  bubblePadding?: number;
  concentrationColor?: string;
  concentrationPadding?: number;
  concentrationOuterMargin?: number;
  // SFX 전용
  color?: string;
  stroke?: string;
  rotate?: number;
  skew?: number;
  filterType?: string;
  // 이미지 전용
  src?: string;
  hidden?: boolean;
  zIndex?: number;
  // 꼬리 관련
  tailPos?: number;
  tailSize?: number;
  tailLength?: number;
  tailWidth?: number;
  tailStyle?: string;
  roundness?: number;
  customColor?: string;
  customBg?: string;
  customBgOpacity?: number;
  textOffsetX?: number;
  textOffsetY?: number;
  panelIndex?: number;
  crop?: { x: number; y: number; w: number; h: number };
}

// ─── 변환 함수 ───────────────────────────────────────────────

export function mapObjectToFigma(
  obj: EditorObject,
  pageIndex: number
): BubbleData | ImageData | null {
  if (obj.type === "bubble") {
    const bs = (obj.bubbleStyle || "speech") as BubbleStyleName;
    const bt = BUBBLE_TYPES[bs] || BUBBLE_TYPES.speech;
    const figmaType = bs === "narration" ? "narration" : "dialogue";

    // SVG path 기반 말풍선이면 path 데이터 생성
    let svgPathData: SvgPathData | undefined;
    if (bt.svgBalloon && SVG_BALLOONS[bt.svgBalloon]) {
      const sb = SVG_BALLOONS[bt.svgBalloon];
      const isFlipped = obj.flipBalloon || "default";
      const bStrokeW = obj.strokeWidth ?? bt.borderWidth ?? 2.5;
      const bStrokeC = obj.strokeColor || bt.border || "#333";
      const bFillC = obj.fillColor || bt.bg || "#fff";
      const pathD = sb.path(bStrokeW, bStrokeC, bFillC, isFlipped);
      const pad = obj.bubblePadding ?? (bt.defaultPadding || 0);
      const vbParts = sb.viewBox.split(" ").map(Number);
      const inset = (pad * Math.max(vbParts[2], vbParts[3])) / 100;
      svgPathData = {
        pathD,
        viewBox: sb.viewBox,
        vbX: vbParts[0] + inset,
        vbY: vbParts[1] + inset,
        vbW: vbParts[2] - inset * 2,
        vbH: vbParts[3] - inset * 2,
        fillColor: bFillC,
        strokeColor: bStrokeC,
        strokeWidth: bStrokeW,
      };
    }

    return {
      id: obj.id,
      type: figmaType as any,
      text: obj.text || "",
      bubbleStyle: bs,
      svgPath: svgPathData,
      position: { x: obj.x || 0, y: obj.y || 0 },
      size: { w: obj.w || 200, h: obj.h || 100 },
      style: {
        fontSize: obj.fontSize || 14,
        fontFamily: cleanFontFamily(obj.fontFamily || ""),
        color:
          obj.fillColor === "#fff"
            ? "#000000"
            : obj.strokeColor || bt.color || "#000000",
        bgColor: bt.bg || "#fff",
        borderColor: bt.border || "#333",
        borderWidth: bt.borderWidth || 2,
        radius: bt.radius || 0,
        isEllipse: !!bt.ellipse,
        isBox: !!bt.boxShape,
        isDashed: !!bt.dashed,
        isConcentration: !!bt.concentrationLines,
        concentrationColor: obj.concentrationColor || bt.border || "#000",
        concentrationPadding: obj.concentrationPadding || 0,
        concentrationOuterMargin: obj.concentrationOuterMargin || 0,
      },
      pageIndex,
      objectIndex: 0,
    };
  } else if (obj.type === "sfx") {
    return {
      id: obj.id,
      type: "sfx",
      text: obj.text || "",
      position: { x: obj.x || 0, y: obj.y || 0 },
      size: { w: obj.w || 150, h: obj.h || 60 },
      style: {
        fontSize: obj.fontSize || 32,
        fontFamily: cleanFontFamily(obj.fontFamily || "Nanum Brush Script"),
        color: obj.color || "#ff6b6b",
        strokeColor: obj.stroke,
        strokeWidth: obj.strokeWidth || 1.5,
        fontWeight: 900,
        skewX: obj.skew || 0,
      },
      pageIndex,
      objectIndex: 0,
    } as BubbleData;
  } else if (obj.type === "panel" || obj.type === "image") {
    return {
      id: obj.id,
      pageIndex,
      base64: obj.src || "",
      bounds: { x: obj.x || 0, y: obj.y || 0, w: obj.w || 800, h: obj.h || 600 },
    } as ImageData;
  }
  return null;
}
