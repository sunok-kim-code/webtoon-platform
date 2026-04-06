// ============================================================
// Canvas 렌더링 — drawBubbleOnCanvas + drawSfxOnCanvas
// index.html L5817–6096에서 추출
// 캔버스 내보내기(JPG/PSD)에서 사용하는 2D Canvas 렌더링 로직
// ============================================================

import {
  BUBBLE_TYPES,
  SVG_BALLOONS,
  type BubbleTypeDef,
} from "@webtoon/shared";
import {
  buildBubblePath,
  buildCloudPath,
  buildBoxPath,
  buildWavePath,
  buildSpikyPath,
  buildConcentrationLines,
} from "@webtoon/shared/utils/pathBuilders";
import type { EditorObject } from "../figma-bridge/mapObjectToFigma";

// ─── 텍스트 헬퍼 ────────────────────────────────────────────

function getObjText(obj: EditorObject): string {
  return obj.text || "";
}

function getObjFont(obj: EditorObject, defaultFont: string): string {
  return obj.fontFamily || defaultFont;
}

// ─── 말풍선 캔버스 렌더링 ────────────────────────────────────
// index.html L5817–6031

export function drawBubbleOnCanvas(
  ctx: CanvasRenderingContext2D,
  b: EditorObject,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  scale: number
): void {
  const bt: BubbleTypeDef = BUBBLE_TYPES[(b.bubbleStyle || "speech") as keyof typeof BUBBLE_TYPES] || BUBBLE_TYPES.speech;
  const tailPos = b.tailPos ?? 0.3;
  const tailSz = b.tailSize ?? 1.0;
  const tailLen = b.tailLength ?? tailSz;
  const tailWid = b.tailWidth ?? tailSz;
  ctx.save();

  // Drop shadow
  if (bt.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;
  }

  // Effective background (plainText with custom colors)
  const effBg = (() => {
    if (bt.plainText && b.customBg) {
      const op = (b.customBgOpacity ?? 100) / 100;
      const hex = b.customBg;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const bl = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${bl},${op})`;
    }
    if (bt.plainText && b.customBgOpacity !== undefined) {
      const op = b.customBgOpacity / 100;
      return `rgba(255,255,255,${op})`;
    }
    return bt.bg;
  })();

  // ── Shape rendering branches ──

  if (bt.plainText && !bt.ellipse) {
    ctx.fillStyle = effBg;
    ctx.fillRect(bx, by, bw, bh);
  } else if (bt.plainText && bt.ellipse) {
    ctx.beginPath();
    ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = effBg;
    ctx.fill();
  } else if (bt.svgBalloon && SVG_BALLOONS[bt.svgBalloon]) {
    // SVG path-based balloons
    const sb = SVG_BALLOONS[bt.svgBalloon];
    const isFlipped = (b as any).flipBalloon || "default";
    const bStrokeW = (b as any).strokeWidth ?? bt.borderWidth ?? 2.5;
    const bStrokeC = (b as any).strokeColor || bt.border || "#333";
    const bFillC = (b as any).fillColor || bt.bg || "#fff";
    const pathD = sb.path(bStrokeW, bStrokeC, bFillC, isFlipped);
    const vbParts = sb.viewBox.split(" ").map(Number);
    const pad = (b as any).bubblePadding ?? (bt.defaultPadding || 0);
    const inset = (pad * Math.max(vbParts[2], vbParts[3])) / 100;
    const vbX = vbParts[0] + inset, vbY = vbParts[1] + inset;
    const vbW = vbParts[2] - inset * 2, vbH = vbParts[3] - inset * 2;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(bw / vbW, bh / vbH);
    ctx.translate(-vbX, -vbY);
    const p2d = new Path2D(pathD);
    ctx.fillStyle = bFillC;
    ctx.fill(p2d);
    ctx.shadowColor = "transparent";
    if (bStrokeC !== "none") {
      ctx.lineWidth = bStrokeW / Math.min(bw / vbW, bh / vbH);
      ctx.strokeStyle = bStrokeC;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(p2d);
      // Re-fill to cover internal stroke artifacts
      ctx.fillStyle = bFillC;
      ctx.fill(p2d);
    }
    ctx.restore();
  } else if (bt.concentrationLines) {
    // 집중선
    ctx.save();
    ctx.translate(bx, by);
    const cl = buildConcentrationLines(
      bw, bh,
      (b as any).concentrationPadding || 0,
      (b as any).concentrationOuterMargin || 0
    );
    ctx.strokeStyle = (b as any).concentrationColor || bt.border || "#000";
    ctx.lineCap = "round";
    for (const ln of cl.lines) {
      ctx.lineWidth = ln.sw;
      ctx.beginPath();
      ctx.moveTo(ln.sx, ln.sy);
      ctx.lineTo(ln.ex, ln.ey);
      ctx.stroke();
    }
    const ep = new Path2D(cl.ellipse);
    ctx.fillStyle = "transparent";
    ctx.fill(ep);
    ctx.shadowColor = "transparent";
    ctx.restore();
  } else if ((bt as any).spiky || bt.cloudShape || bt.boxShape || bt.waveShape) {
    let pathStr: string;
    if ((bt as any).spiky) pathStr = buildSpikyPath(bw, bh, (bt as any).spikeCount || 16, tailPos, tailLen, tailWid, scale);
    else if (bt.cloudShape) pathStr = buildCloudPath(bw, bh, tailPos, tailLen, tailWid, scale);
    else if (bt.boxShape) pathStr = buildBoxPath(bw, bh, (bt.radius || 10) * scale, tailPos, tailLen, tailWid, scale);
    else pathStr = buildWavePath(bw, bh, tailPos, tailLen, tailWid, scale);

    ctx.save();
    ctx.translate(bx, by);
    const p2d = new Path2D(pathStr);
    ctx.fillStyle = bt.bg;
    ctx.fill(p2d, bt.cloudShape || (bt as any).spiky ? "evenodd" : "nonzero");
    ctx.shadowColor = "transparent";
    if (bt.border !== "none") {
      ctx.lineWidth = (bt.borderWidth || 2) * scale;
      ctx.strokeStyle = bt.border;
      ctx.lineJoin = "round";
      ctx.stroke(p2d);
    }
    ctx.restore();
  } else if (bt.ellipse) {
    const rx = bw / 2 - 2 * scale, ry = bh / 2 - 2 * scale;
    if (bt.tail) {
      const pathStr = buildBubblePath(
        bw / 2, bh / 2, rx, ry,
        tailPos, tailLen, tailWid, bw, bh, 1,
        (b as any).roundness, (b as any).tailStyle
      );
      ctx.save();
      ctx.translate(bx, by);
      const p2d = new Path2D(pathStr);
      ctx.fillStyle = bt.bg;
      ctx.fill(p2d);
      ctx.shadowColor = "transparent";
      if (bt.border !== "none") {
        ctx.lineWidth = (bt.borderWidth || 2) * scale;
        ctx.strokeStyle = bt.border;
        if (bt.dashed) ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.stroke(p2d);
        ctx.setLineDash([]);
      }
      ctx.restore();
    } else {
      const rn2 = (b as any).roundness ?? 100;
      const cr2 = Math.min(rx, ry) * Math.max(0.04, rn2 / 100);
      ctx.beginPath();
      ctx.roundRect(bx + 2, by + 2, bw - 4, bh - 4, cr2);
      ctx.fillStyle = bt.bg;
      ctx.fill();
      if (bt.border !== "none") {
        ctx.lineWidth = (bt.borderWidth || 2) * scale;
        ctx.strokeStyle = bt.border;
        if (bt.dashed) ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.stroke();
      }
    }
  } else {
    // Rounded rect (narration etc.)
    if (bt.tail) {
      const rrRx = bw / 2 - 2 * scale, rrRy = bh / 2 - 2 * scale;
      const rrRoundness = (b as any).roundness ?? 30;
      const pathStr = buildBubblePath(
        bw / 2, bh / 2, rrRx, rrRy,
        tailPos, tailLen, tailWid, bw, bh, 1,
        rrRoundness, (b as any).tailStyle
      );
      ctx.save();
      ctx.translate(bx, by);
      const p2d = new Path2D(pathStr);
      ctx.fillStyle = bt.bg;
      ctx.fill(p2d);
      ctx.shadowColor = "transparent";
      if (bt.border !== "none") {
        ctx.lineWidth = (bt.borderWidth || 2) * scale;
        ctx.strokeStyle = bt.border;
        if (bt.dashed) ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.lineJoin = "round";
        ctx.stroke(p2d);
        ctx.setLineDash([]);
      }
      ctx.restore();
    } else {
      const r = ((bt.radius || 8) * scale) / 2;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, r);
      ctx.fillStyle = bt.bg;
      ctx.fill();
      if (bt.border !== "none") {
        ctx.lineWidth = (bt.borderWidth || 2) * scale;
        ctx.strokeStyle = bt.border;
        if (bt.dashed) ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.stroke();
      }
    }
  }

  // ── Text rendering ──
  ctx.shadowColor = "transparent";
  const displayText = getObjText(b);
  if (displayText) {
    const fs = Math.max(12, (b.fontSize || 25)) * scale;
    const ff = getObjFont(b, "'Noto Sans KR',sans-serif");
    ctx.font = `${b.fontWeight || bt.fontWeight} ${fs}px ${ff}`;
    ctx.fillStyle = b.customColor || bt.color || "#111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = displayText.split("\n");
    const lh = fs * 1.3;
    const txOff = (b.textOffsetX || 0) * scale;
    const tyOff = (b.textOffsetY || 0) * scale;

    const sb = bt.svgBalloon ? SVG_BALLOONS[bt.svgBalloon] : undefined;
    const ta = sb?.textArea;
    let textCenterX = bx + bw / 2 + txOff;
    let textCenterY = by + bh / 2 + tyOff;
    let maxTextW = bw - 16 * scale;

    if (bt.concentrationLines) {
      const cBaseR2 = 0.22;
      const cRF2 = Math.max(0.08, Math.min(0.45, cBaseR2 + ((b as any).concentrationPadding || 0) * 0.004));
      maxTextW = bw * Math.min(0.85, cRF2 * 2.05);
    } else if (ta) {
      const taLeft = parseFloat(ta.left) / 100;
      const taTop = parseFloat(ta.top) / 100;
      const taW = parseFloat(ta.width) / 100;
      const taH = parseFloat(ta.height) / 100;
      textCenterX = bx + (taLeft + taW / 2) * bw + txOff;
      textCenterY = by + (taTop + taH / 2) * bh + tyOff;
      maxTextW = taW * bw;
    }

    const sy = textCenterY - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, li) => ctx.fillText(l, textCenterX, sy + li * lh, maxTextW));
  }
  ctx.restore();
}

// ─── SFX 카테고리 정의 ──────────────────────────────────────

interface SfxCategory {
  fontWeight: string;
  fontStyle: string;
  letterSpacing: number;
  scaleY: number;
  defaultStroke: string;
  defaultFill: string;
}

const SFX_CATEGORIES: Record<string, SfxCategory> = {
  impact: {
    fontWeight: "900",
    fontStyle: "normal",
    letterSpacing: 2,
    scaleY: 1.1,
    defaultStroke: "#5c0000",
    defaultFill: "#ff2200",
  },
  motion: {
    fontWeight: "700",
    fontStyle: "italic",
    letterSpacing: 4,
    scaleY: 0.95,
    defaultStroke: "#003366",
    defaultFill: "#0066cc",
  },
  emotion: {
    fontWeight: "bold",
    fontStyle: "normal",
    letterSpacing: 1,
    scaleY: 1.0,
    defaultStroke: "#660066",
    defaultFill: "#ff00ff",
  },
  effect: {
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 3,
    scaleY: 1.05,
    defaultStroke: "#333333",
    defaultFill: "#ffaa00",
  },
};

// ─── SFX 캔버스 렌더링 ──────────────────────────────────────
// index.html L6034–6096
// 향상된 SFX 렌더링: 회전, 스케일, 극적인 타이포그래피

export function drawSfxOnCanvas(
  ctx: CanvasRenderingContext2D,
  obj: EditorObject,
  ox: number,
  oy: number,
  scale: number
): void {
  ctx.save();

  // 중심점 계산
  const cx = ox + (obj.w || 150) * scale / 2;
  const cy = oy + (obj.h || 60) * scale / 2;
  ctx.translate(cx, cy);

  // 회전 적용
  if (obj.rotate) {
    ctx.rotate((obj.rotate * Math.PI) / 180);
  }

  // 왜곡(skew) 적용
  if (obj.skew) {
    const skewRad = Math.tan(((obj.skew || 0) * Math.PI) / 180);
    ctx.transform(1, 0, skewRad, 1, 0, 0);
  }

  // SFX 카테고리 결정
  const sfxType = (obj as any).sfxType || (obj.filterType === "shake" ? "impact" : "effect");
  const category = SFX_CATEGORIES[sfxType] || SFX_CATEGORIES.effect;

  // 폰트 및 크기 설정
  const fs = (obj.fontSize || 48) * scale;
  const ff = getObjFont(obj, "'Nanum Brush Script','Arial Black',sans-serif");
  const fontWeightStr = category.fontWeight;
  ctx.font = `${fontWeightStr} ${fs}px ${ff}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 색상 설정
  const strokeColor = obj.stroke || category.defaultStroke;
  const fillColor = obj.color || category.defaultFill;
  const strokeWidth = obj.strokeWidth || 2;

  // ── 필터 타입별 그림자 설정 ──
  const filterType = obj.filterType || "";

  if (filterType === "shake") {
    // 흔들림 효과: 여러 오프셋으로 표현
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;
  } else if (filterType === "motion" || sfxType === "motion") {
    // 모션 효과: 방향감 있는 그림자
    ctx.shadowColor = strokeColor + "88";
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetX = 6 * scale;
    ctx.shadowOffsetY = 2 * scale;
  } else if (filterType === "glow") {
    // 발광 효과: 부드러운 빛
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 12 * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else if (filterType === "outline") {
    // 아웃라인 효과: 명확한 경계
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 2 * scale;
    ctx.shadowOffsetX = 3 * scale;
    ctx.shadowOffsetY = 3 * scale;
  } else {
    // 기본 그림자
    ctx.shadowColor = strokeColor + "66";
    ctx.shadowBlur = 2 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;
  }

  // ── 텍스트 추출 및 분할 ──
  const sfxText = getObjText(obj);
  const lines = sfxText.split("\n");
  const lh = fs * 1.15; // 라인 높이

  // ── 스트로크 렌더링 (paint-order: stroke fill) ──
  if (strokeColor !== "none" && strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth * scale * 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 2;

    const startY = -((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => {
      const y = startY + i * lh;
      ctx.strokeText(l, 0, y);
    });
  }

  // ── 채우기 렌더링 ──
  ctx.shadowColor = "transparent";
  ctx.fillStyle = fillColor;

  // 카테고리별 스타일 적용
  if (category.fontStyle === "italic") {
    ctx.font = `italic ${fontWeightStr} ${fs}px ${ff}`;
  }

  // 텍스트 스케일 변형 (세로 늘림)
  const scaleY = category.scaleY;
  if (scaleY !== 1.0) {
    ctx.save();
    ctx.scale(1, scaleY);
  }

  const startY = -((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    const y = scaleY !== 1.0 ? (startY + i * lh) / scaleY : startY + i * lh;
    ctx.fillText(l, 0, y);
  });

  if (scaleY !== 1.0) {
    ctx.restore();
  }

  // ── 추가 장식 효과 ──
  // Impact SFX: 별 모양 데코레이션
  if (sfxType === "impact") {
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = 0.4;
    const starCount = 3;
    const starRadius = fs * 0.3;
    const angleStep = (Math.PI * 2) / starCount;

    for (let i = 0; i < starCount; i++) {
      const angle = angleStep * i;
      const x = Math.cos(angle) * (fs * 0.8);
      const y = Math.sin(angle) * (fs * 0.8);
      drawStar(ctx, x, y, 5, starRadius * 0.5, starRadius);
    }
    ctx.globalAlpha = 1.0;
  }

  // Motion SFX: 속도선 배경
  if (sfxType === "motion") {
    ctx.strokeStyle = fillColor;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1 * scale;
    const lineCount = 4;
    for (let i = -lineCount; i <= lineCount; i++) {
      const offset = (i * fs) / lineCount;
      ctx.beginPath();
      ctx.moveTo(-fs * 1.2, offset);
      ctx.lineTo(fs * 1.2, offset + fs * 0.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}

/**
 * 별 모양 그리기 (SFX 데코레이션용)
 */
function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  innerRadius: number,
  outerRadius: number
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}
