// ============================================================
// BubbleSvg — 에디터에서 말풍선을 SVG로 렌더링하는 React 컴포넌트
// index.html L11220–11289에서 추출
// ============================================================

import React from "react";
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

// ─── 타입 ────────────────────────────────────────────────────

interface BubbleSvgProps {
  bubbleStyle: string;
  width: number;
  height: number;
  scale: number;
  // SVG balloon 관련
  flipBalloon?: string;
  bubblePadding?: number;
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
  // Tail 관련
  tailPos?: number;
  tailLength?: number;
  tailWidth?: number;
  roundness?: number;
  tailStyle?: string;
  // 집중선
  concentrationPadding?: number;
  concentrationOuterMargin?: number;
  concentrationColor?: string;
  // 커스텀 배경
  customBg?: string;
  customBgOpacity?: number;
  // 그림자
  shadow?: boolean;
}

// ─── SVG 도형 렌더러 ─────────────────────────────────────────

function renderShape(props: BubbleSvgProps, bt: BubbleTypeDef): React.ReactNode {
  const {
    width, height, scale,
    flipBalloon, bubblePadding,
    tailPos = 0.3, tailLength = 1, tailWidth = 1,
    roundness,
  } = props;

  const bw2 = props.strokeWidth ?? bt.borderWidth ?? 2;
  const strokeColor = (props.strokeColor || bt.border) === "none"
    ? "transparent"
    : (props.strokeColor || bt.border);
  const fillColor = props.fillColor || bt.bg || "#fff";
  const dash = bt.dashed ? "6 4" : "none";
  const W = width * scale;
  const H = height * scale;

  // ── SVG Balloon (speech, gourd, shout 등) ──
  if (bt.svgBalloon && SVG_BALLOONS[bt.svgBalloon]) {
    const sb = SVG_BALLOONS[bt.svgBalloon];
    const isFlipped = flipBalloon || "default";
    const pathD = sb.path(bw2, strokeColor, fillColor, isFlipped);
    return (
      <path
        d={pathD}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={bw2}
        strokeLinejoin="round"
        strokeLinecap="round"
        paintOrder="stroke fill"
      />
    );
  }

  // ── plainText (사각형/타원) ──
  if (bt.plainText && !bt.ellipse) {
    const effBg = getEffectiveBg(props, bt);
    return (
      <rect x="0" y="0" width={W} height={H}
        rx={(bt.radius || 2) * scale} ry={(bt.radius || 2) * scale}
        fill={effBg} stroke="none" />
    );
  }
  if (bt.plainText && bt.ellipse) {
    const effBg = getEffectiveBg(props, bt);
    return (
      <ellipse cx={W / 2} cy={H / 2} rx={W / 2} ry={H / 2}
        fill={effBg} stroke="none" />
    );
  }

  // ── spiky ──
  if ((bt as any).spiky) {
    const pathD = buildSpikyPath(W, H, (bt as any).spikeCount || 16, tailPos, tailLength, tailWidth, 1);
    return (
      <path d={pathD} fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
        strokeLinejoin="round" fillRule="evenodd" />
    );
  }

  // ── cloud ──
  if (bt.cloudShape) {
    const pathD = buildCloudPath(W, H, tailPos, tailLength, tailWidth, 1);
    return (
      <path d={pathD} fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
        strokeLinejoin="round" fillRule="evenodd" />
    );
  }

  // ── box ──
  if (bt.boxShape) {
    const pathD = buildBoxPath(W, H, (bt.radius || 10) * scale, tailPos, tailLength, tailWidth, 1);
    return (
      <path d={pathD} fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
        strokeLinejoin="round" />
    );
  }

  // ── wave ──
  if (bt.waveShape) {
    const pathD = buildWavePath(W, H, tailPos, tailLength, tailWidth, scale);
    return (
      <path d={pathD} fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
        strokeLinejoin="round" />
    );
  }

  // ── concentrationLines (집중선) ──
  if (bt.concentrationLines) {
    const cl = buildConcentrationLines(
      W, H,
      props.concentrationPadding || 0,
      props.concentrationOuterMargin || 0
    );
    const clColor = props.concentrationColor || strokeColor;
    return (
      <g>
        {cl.lines.map((ln: any, li: number) => (
          <line key={li}
            x1={ln.sx} y1={ln.sy} x2={ln.ex} y2={ln.ey}
            stroke={clColor} strokeWidth={ln.sw} strokeLinecap="round" />
        ))}
        <path d={cl.ellipse} fill="transparent" stroke="none" />
      </g>
    );
  }

  // ── ellipse ──
  if (bt.ellipse) {
    const rx2 = W / 2 - 2, ry2 = H / 2 - 2;
    const rn2 = roundness ?? 100;
    if (bt.tail) {
      const pathD = buildBubblePath(
        W / 2, H / 2, rx2, ry2,
        tailPos, tailLength, tailWidth, W, H, 1,
        roundness, props.tailStyle as any
      );
      return (
        <path d={pathD} fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
          strokeDasharray={dash} strokeLinejoin="round" />
      );
    }
    const cr2 = Math.min(rx2, ry2) * Math.max(0.04, rn2 / 100);
    return (
      <rect x="2" y="2" width={W - 4} height={H - 4}
        rx={cr2} ry={cr2} fill={bt.bg}
        stroke={strokeColor} strokeWidth={bw2} strokeDasharray={dash} />
    );
  }

  // ── rounded rect with tail ──
  if (bt.tail) {
    const rrRx = W / 2 - 2, rrRy = H / 2 - 2;
    const rrRn = roundness ?? 30;
    const pathD = buildBubblePath(
      W / 2, H / 2, rrRx, rrRy,
      tailPos, tailLength, tailWidth, W, H, 1,
      rrRn, props.tailStyle as any
    );
    return (
      <path d={pathD} fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
        strokeDasharray={dash} strokeLinejoin="round" />
    );
  }

  // ── 기본 사각형 ──
  return (
    <rect x="1" y="1" width={W - 2} height={H - 2}
      rx={(bt.radius || 8) * scale} ry={(bt.radius || 8) * scale}
      fill={bt.bg} stroke={strokeColor} strokeWidth={bw2}
      strokeDasharray={dash} />
  );
}

// ─── 유틸 ────────────────────────────────────────────────────

function getEffectiveBg(props: BubbleSvgProps, bt: BubbleTypeDef): string {
  if (bt.plainText && props.customBg) {
    const op = (props.customBgOpacity ?? 100) / 100;
    const hex = props.customBg;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${op})`;
  }
  if (bt.plainText && props.customBgOpacity !== undefined) {
    const op = props.customBgOpacity / 100;
    return `rgba(255,255,255,${op})`;
  }
  return bt.bg;
}

function computeViewBox(props: BubbleSvgProps, bt: BubbleTypeDef): string | undefined {
  if (bt.svgBalloon && SVG_BALLOONS[bt.svgBalloon]) {
    const sb = SVG_BALLOONS[bt.svgBalloon];
    const pad = props.bubblePadding ?? (bt.defaultPadding || 0);
    if (pad === 0) return sb.viewBox;
    const vb = sb.viewBox.split(" ").map(Number);
    const inset = (pad * Math.max(vb[2], vb[3])) / 100;
    return `${vb[0] + inset} ${vb[1] + inset} ${vb[2] - inset * 2} ${vb[3] - inset * 2}`;
  }
  return undefined;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────

export const BubbleSvg: React.FC<BubbleSvgProps> = (props) => {
  const bt = BUBBLE_TYPES[props.bubbleStyle as keyof typeof BUBBLE_TYPES] || BUBBLE_TYPES.speech;
  const W = props.width * props.scale;
  const H = props.height * props.scale;
  const viewBox = computeViewBox(props, bt);
  const preserveAR = viewBox ? "none" : undefined;
  const svgH = viewBox ? H : H;

  return (
    <svg
      width={W}
      height={svgH}
      className="be-bubble-svg"
      viewBox={viewBox}
      preserveAspectRatio={preserveAR}
      style={{
        filter: (props.shadow ?? bt.shadow) ? "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" : "none",
      }}
    >
      {renderShape(props, bt)}
    </svg>
  );
};
