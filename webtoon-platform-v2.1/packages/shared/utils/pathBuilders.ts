// ============================================================
// SVG 패스 빌더 유틸리티 (index.html L5536–5813에서 추출)
// 말풍선 도형, 구름, 박스, 물결, 스파이크, 집중선 패스 생성
// 웹앱 에디터 + 캔버스 렌더링 + Figma 내보내기 공통 사용
// ============================================================

// ─── 말풍선 패스 (타원/사각형 + 꼬리) ────────────────────────

export type TailStyle = "normal" | "straight" | "round";

/**
 * 말풍선 본체 + 꼬리를 단일 패스로 생성
 * PowerPoint 스타일 callout (본체와 꼬리가 하나의 도형)
 */
export function buildBubblePath(
  cx: number, cy: number,
  rx: number, ry: number,
  tailPos: number, tailLen: number, tailWid: number,
  bubbleW: number, bubbleH: number,
  scale: number,
  roundness?: number,
  tailStyle?: TailStyle
): string {
  const rn = roundness ?? 100;
  const ts = tailStyle || "normal";
  const tw = 12 * tailWid * scale;
  const th = 18 * tailLen * scale;
  const tailBaseX = bubbleW * tailPos;
  const tailTipX = tailBaseX;
  const tailTipY = bubbleH + th;
  const pad = 2;

  const buildTailSegments = (
    leftPt: { x: number; y: number },
    rightPt: { x: number; y: number },
    leftTan: { x: number; y: number },
    rightTan: { x: number; y: number }
  ): string[] => {
    if (ts === "straight") {
      return [
        `L ${rightPt.x} ${rightPt.y}`,
        `L ${tailTipX} ${tailTipY}`,
        `L ${leftPt.x} ${leftPt.y}`,
      ];
    } else if (ts === "round") {
      const tipRadius = Math.max(tw * 0.25, 3);
      const cR1x = rightPt.x + rightTan.x * th * 0.5;
      const cR1y = rightPt.y + rightTan.y * th * 0.5;
      const cR2x = tailTipX + tipRadius * 0.8;
      const cR2y = tailTipY - th * 0.1;
      const cL1x = tailTipX - tipRadius * 0.8;
      const cL1y = tailTipY - th * 0.1;
      const cL2x = leftPt.x + leftTan.x * th * 0.5;
      const cL2y = leftPt.y + leftTan.y * th * 0.5;
      return [
        `C ${cR1x} ${cR1y} ${cR2x} ${cR2y} ${tailTipX + tipRadius * 0.3} ${tailTipY}`,
        `A ${tipRadius} ${tipRadius * 0.8} 0 1 1 ${tailTipX - tipRadius * 0.3} ${tailTipY}`,
        `C ${cL1x} ${cL1y} ${cL2x} ${cL2y} ${leftPt.x} ${leftPt.y}`,
      ];
    } else {
      // normal — smooth S-curve bezier
      const handleLen = th * 0.55;
      const pinchFactor = 0.2;
      const cR1x = rightPt.x + rightTan.x * handleLen;
      const cR1y = rightPt.y + rightTan.y * handleLen;
      const cR2x = tailTipX + tw * pinchFactor;
      const cR2y = tailTipY - th * 0.12;
      const cL1x = tailTipX - tw * pinchFactor * 1.2;
      const cL1y = tailTipY - th * 0.12;
      const cL2x = leftPt.x + leftTan.x * handleLen;
      const cL2y = leftPt.y + leftTan.y * handleLen;
      return [
        `C ${cR1x} ${cR1y} ${cR2x} ${cR2y} ${tailTipX} ${tailTipY}`,
        `C ${cL1x} ${cL1y} ${cL2x} ${cL2y} ${leftPt.x} ${leftPt.y}`,
      ];
    }
  };

  const maxR = Math.min(rx, ry);
  const cr = maxR * Math.max(0.04, rn / 100);
  const L = pad, T = pad, R = bubbleW - pad, B = bubbleH - pad;

  const tRight = Math.min(R - cr - 2, tailBaseX + tw);
  const tLeft = Math.max(L + cr + 2, tailBaseX - tw);

  const rightPt = { x: tRight, y: B };
  const leftPt = { x: tLeft, y: B };
  const rightTan = { x: 0.15, y: 1 };
  const leftTan = { x: -0.15, y: 1 };

  const tailSegs = buildTailSegments(leftPt, rightPt, leftTan, rightTan);

  // Cubic bezier corners (kappa ≈ 0.5523 for quarter-circle approximation)
  const k = 0.5523;
  const crx = Math.min(cr, (R - L) / 2);
  const cry = Math.min(cr, (B - T) / 2);

  const path = [
    `M ${L + crx} ${T}`,
    `L ${R - crx} ${T}`,
    `C ${R - crx + crx * k} ${T} ${R} ${T + cry - cry * k} ${R} ${T + cry}`,
    `L ${R} ${B - cry}`,
    `C ${R} ${B - cry + cry * k} ${R - crx + crx * k} ${B} ${R - crx} ${B}`,
    `L ${tRight} ${B}`,
    ...tailSegs,
    `L ${L + crx} ${B}`,
    `C ${L + crx - crx * k} ${B} ${L} ${B - cry + cry * k} ${L} ${B - cry}`,
    `L ${L} ${T + cry}`,
    `C ${L} ${T + cry - cry * k} ${L + crx - crx * k} ${T} ${L + crx} ${T}`,
    "Z",
  ];
  return path.join(" ");
}

// ─── 구름형 말풍선 패스 ──────────────────────────────────────

export function buildCloudPath(
  w: number, h: number,
  tailPos: number, tailLen: number, tailWid: number,
  scale: number
): string {
  const bumps = 10;
  const cx = w / 2, cy = h / 2;
  const rx = w / 2 - 4, ry = h / 2 - 4;
  const pts: string[] = [];

  for (let i = 0; i <= bumps; i++) {
    const a = (Math.PI * 2 * i) / bumps - Math.PI / 2;
    const bumpR = 0.18 * (i % 2 === 0 ? 1 : 0.7);
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    if (i === 0) {
      pts.push(`M ${px} ${py}`);
    } else {
      const prevA = (Math.PI * 2 * (i - 1)) / bumps - Math.PI / 2;
      const midA = (prevA + a) / 2;
      const cpx = cx + Math.cos(midA) * rx * (1 + bumpR * 1.5);
      const cpy = cy + Math.sin(midA) * ry * (1 + bumpR * 1.5);
      pts.push(`Q ${cpx} ${cpy} ${px} ${py}`);
    }
  }
  pts.push("Z");
  let path = pts.join(" ");

  // Cloud tail (small circles)
  const tw = 10 * tailWid * scale;
  const th = 14 * tailLen * scale;
  const tx = w * tailPos;
  const c1x = tx, c1y = h - 2;
  const c2x = tx + tw * 0.3, c2y = h + th * 0.35;
  const c3x = tx + tw * 0.1, c3y = h + th * 0.7;
  path += ` M ${c1x + 6} ${c1y} A 6 5 0 1 1 ${c1x - 6} ${c1y} A 6 5 0 1 1 ${c1x + 6} ${c1y}`;
  path += ` M ${c2x + 4} ${c2y} A 4 3 0 1 1 ${c2x - 4} ${c2y} A 4 3 0 1 1 ${c2x + 4} ${c2y}`;
  path += ` M ${c3x + 2.5} ${c3y} A 2.5 2 0 1 1 ${c3x - 2.5} ${c3y} A 2.5 2 0 1 1 ${c3x + 2.5} ${c3y}`;
  return path;
}

// ─── 박스형 말풍선 패스 ──────────────────────────────────────

export function buildBoxPath(
  w: number, h: number,
  r: number,
  tailPos: number, tailLen: number, tailWid: number,
  scale: number
): string {
  const tw = 10 * tailWid * scale;
  const th = 16 * tailLen * scale;
  const tx = Math.max(r + tw, Math.min(w - r - tw, w * tailPos));
  const pts = [
    `M ${r} 0`, `L ${w - r} 0`, `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`, `Q ${w} ${h} ${w - r} ${h}`,
    `L ${tx + tw} ${h}`,
    `C ${tx + tw * 0.6} ${h} ${tx + tw * 0.2} ${h + th * 0.3} ${tx} ${h + th}`,
    `C ${tx - tw * 0.2} ${h + th * 0.3} ${tx - tw * 0.6} ${h} ${tx - tw} ${h}`,
    `L ${r} ${h}`, `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`, `Q 0 0 ${r} 0`, "Z",
  ];
  return pts.join(" ");
}

// ─── 물결형 말풍선 패스 ──────────────────────────────────────

export function buildWavePath(
  w: number, h: number,
  tailPos: number, tailLen: number, tailWid: number,
  scale: number
): string {
  const waves = 6;
  const amp = 4 * scale;
  const tw = 10 * tailWid * scale;
  const th = 16 * tailLen * scale;
  const tx = w * tailPos;
  const pts = [`M 0 ${amp}`];

  // Top edge (wavy)
  for (let i = 0; i < waves; i++) {
    const seg = w / waves;
    const x1 = seg * i + seg * 0.25, y1 = -amp;
    const x2 = seg * i + seg * 0.75, y2 = amp;
    const x3 = seg * (i + 1), y3 = amp;
    pts.push(`C ${x1} ${y1} ${x2} ${y2 * 0.3} ${x3} ${y3 * 0.5}`);
  }
  // Right edge (wavy)
  for (let i = 0; i < 3; i++) {
    const seg = h / 3;
    const y1 = seg * i + seg * 0.25, x1 = w + amp;
    const y2 = seg * i + seg * 0.75, x2 = w - amp;
    const y3 = seg * (i + 1);
    pts.push(`C ${x1} ${y1} ${x2} ${y2} ${w} ${y3}`);
  }
  // Bottom edge with tail
  const rightTail = Math.min(w, tx + tw);
  const leftTail = Math.max(0, tx - tw);
  pts.push(`L ${rightTail} ${h}`);
  pts.push(`C ${tx + tw * 0.5} ${h} ${tx + tw * 0.15} ${h + th * 0.4} ${tx} ${h + th}`);
  pts.push(`C ${tx - tw * 0.15} ${h + th * 0.4} ${tx - tw * 0.5} ${h} ${leftTail} ${h}`);
  pts.push(`L 0 ${h}`);
  // Left edge (wavy)
  for (let i = 2; i >= 0; i--) {
    const seg = h / 3;
    const y1 = seg * i + seg * 0.75, x1 = -amp;
    const y2 = seg * i + seg * 0.25, x2 = amp;
    const y3 = seg * i;
    pts.push(`C ${x1} ${y1} ${x2} ${y2} 0 ${y3}`);
  }
  pts.push("Z");
  return pts.join(" ");
}

// ─── 스파이크/폭발형 말풍선 패스 ─────────────────────────────

export function buildSpikyPath(
  w: number, h: number,
  spikeCount: number,
  tailPos: number, tailLen: number, tailWid: number,
  scale: number
): string {
  const cx = w / 2, cy = h / 2;
  const n = spikeCount || 16;
  const pts: string[] = [];

  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const outerR = i % 2 === 0 ? 1.0 : 0.65;
    const px = cx + Math.cos(a) * (w / 2) * outerR;
    const py = cy + Math.sin(a) * (h / 2) * outerR;
    pts.push(i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`);
  }
  pts.push("Z");

  // Tail
  const tw = 10 * tailWid * scale;
  const th = 16 * tailLen * scale;
  const tx = w * tailPos;
  pts.push(`M ${tx - tw} ${h * 0.85}`);
  pts.push(`L ${tx} ${h + th}`);
  pts.push(`L ${tx + tw} ${h * 0.85}`);
  pts.push("Z");
  return pts.join(" ");
}

// ─── 집중선 (만화 스타일 방사선) ─────────────────────────────

export interface ConcentrationLineData {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  sw: number;
}

export interface ConcentrationResult {
  ellipse: string;
  lines: ConcentrationLineData[];
  innerRx: number;
  innerRy: number;
}

export function buildConcentrationLines(
  w: number, h: number,
  padding: number,
  outerMargin: number
): ConcentrationResult {
  const cx = w / 2, cy = h / 2;
  const baseR = 0.22;
  const rFactor = Math.max(0.08, Math.min(0.45, baseR + (padding || 0) * 0.004));
  const innerRx = w * rFactor, innerRy = h * rFactor;
  const outerScale = Math.max(0.2, Math.min(1.5, 1.0 - (outerMargin || 0) * 0.014));
  const lines: ConcentrationLineData[] = [];

  const rand = (i: number, off: number) => {
    const x = Math.sin(42 + i * 127.1 + off * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const clusterCount = 35;
  let angle = 0;
  for (let c = 0; c < clusterCount; c++) {
    const gap = (Math.PI * 2 / clusterCount) * (0.7 + rand(c, 0) * 0.6);
    angle += gap;
    const linesInCluster = 2 + Math.floor(rand(c, 1) * 3);
    const clusterSpread = (Math.PI * 2 / clusterCount) * 0.5;

    for (let li = 0; li < linesInCluster; li++) {
      const a = angle + (li - (linesInCluster - 1) / 2) * clusterSpread / linesInCluster;
      const cosA = Math.cos(a), sinA = Math.sin(a);

      const startDist = 1.0 + rand(c * 10 + li, 4) * 0.1;
      const sx = cx + cosA * innerRx * startDist;
      const sy = cy + sinA * innerRy * startDist;

      const lenType = rand(c * 10 + li, 5);
      let lenMult: number;
      if (lenType < 0.3) lenMult = 0.12 + rand(c * 10 + li, 6) * 0.1;
      else if (lenType < 0.7) lenMult = 0.22 + rand(c * 10 + li, 6) * 0.13;
      else lenMult = 0.35 + rand(c * 10 + li, 6) * 0.15;

      const maxReachX = (cx - innerRx) * outerScale;
      const maxReachY = (cy - innerRy) * outerScale;
      const outerDist = innerRx + maxReachX * lenMult;
      const outerDistY = innerRy + maxReachY * lenMult;
      const ex = cx + cosA * outerDist;
      const ey = cy + sinA * outerDistY;

      const unit = w / 200;
      const sw = (0.3 + rand(c * 10 + li, 7) * 0.9) * unit;
      lines.push({ sx, sy, ex, ey, sw });
    }
  }

  // Inner ellipse path
  const k = 0.5523;
  const ellipse = `M ${cx - innerRx} ${cy} C ${cx - innerRx} ${cy - innerRy * k} ${cx - innerRx * k} ${cy - innerRy} ${cx} ${cy - innerRy} C ${cx + innerRx * k} ${cy - innerRy} ${cx + innerRx} ${cy - innerRy * k} ${cx + innerRx} ${cy} C ${cx + innerRx} ${cy + innerRy * k} ${cx + innerRx * k} ${cy + innerRy} ${cx} ${cy + innerRy} C ${cx - innerRx * k} ${cy + innerRy} ${cx - innerRx} ${cy + innerRy * k} ${cx - innerRx} ${cy} Z`;

  return { ellipse, lines, innerRx, innerRy };
}
