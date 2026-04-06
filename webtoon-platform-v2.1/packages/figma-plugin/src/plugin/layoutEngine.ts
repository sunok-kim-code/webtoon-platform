// ============================================================
// layoutEngine.ts — 패널 배치 알고리즘 (v2.1 신규)
// 프리셋 기반 패널 배치 + 수동 조정 지원
// ============================================================

/** 레이아웃 프리셋 이름 */
export type LayoutPresetName =
  | "verticalStrip"
  | "twoColumn"
  | "threeRow"
  | "wideTop"
  | "cinematic";

/** 레이아웃 프리셋 정의 */
export interface LayoutPreset {
  name: LayoutPresetName;
  label: string;
  cols: number;
  gap: number;
  overlap?: number;
  custom?: Array<{ w: string; h: string }>;
}

/** 프리셋 레지스트리 */
export const LAYOUT_PRESETS: Record<LayoutPresetName, LayoutPreset> = {
  verticalStrip: { name: "verticalStrip", label: "세로 스트립",   cols: 1, gap: 20 },
  twoColumn:     { name: "twoColumn",     label: "2단 분할",     cols: 2, gap: 20 },
  threeRow:      { name: "threeRow",      label: "3행 균등",     cols: 1, gap: 16 },
  wideTop:       { name: "wideTop",       label: "상단 와이드",   cols: 1, gap: 16,
    custom: [{ w: "100%", h: "55%" }, { w: "48%", h: "43%" }, { w: "48%", h: "43%" }] },
  cinematic:     { name: "cinematic",      label: "시네마틱 오버랩", cols: 1, gap: 0, overlap: 20 },
};

export class LayoutEngine {
  /** 선택된 프레임들에 프리셋 레이아웃 적용 */
  applyPreset(frames: FrameNode[], preset: LayoutPresetName, stripWidth: number): void {
    const config = LAYOUT_PRESETS[preset];
    if (!config) return;

    if (config.custom) {
      this.applyCustomLayout(frames, config, stripWidth);
    } else if (config.cols === 1) {
      this.arrangeVertical(frames, config, stripWidth);
    } else {
      this.arrangeGrid(frames, config, stripWidth);
    }
  }

  /** 세로 배치 */
  private arrangeVertical(frames: FrameNode[], config: LayoutPreset, stripWidth: number): void {
    let y = 0;
    for (const frame of frames) {
      frame.x = 0;
      frame.y = y;
      frame.resize(stripWidth, frame.height);

      if (config.overlap) {
        y += frame.height - config.overlap;
      } else {
        y += frame.height + config.gap;
      }
    }
  }

  /** 그리드 배치 */
  private arrangeGrid(frames: FrameNode[], config: LayoutPreset, stripWidth: number): void {
    const colWidth = (stripWidth - config.gap * (config.cols - 1)) / config.cols;
    let row = 0, col = 0, maxRowH = 0, yOffset = 0;

    for (const frame of frames) {
      frame.x = col * (colWidth + config.gap);
      frame.y = yOffset;
      frame.resize(colWidth, frame.height * (colWidth / frame.width));

      maxRowH = Math.max(maxRowH, frame.height);
      col++;
      if (col >= config.cols) {
        col = 0;
        row++;
        yOffset += maxRowH + config.gap;
        maxRowH = 0;
      }
    }
  }

  /** 커스텀 레이아웃 (wideTop 등) */
  private applyCustomLayout(frames: FrameNode[], config: LayoutPreset, stripWidth: number): void {
    if (!config.custom) return;
    // TODO: 커스텀 비율에 따른 패널 배치 구현
    // config.custom의 w/h 퍼센트를 실제 픽셀로 변환하여 배치
    this.arrangeVertical(frames, config, stripWidth);
  }
}
