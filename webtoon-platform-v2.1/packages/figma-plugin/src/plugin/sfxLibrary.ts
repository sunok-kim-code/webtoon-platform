// ============================================================
// sfxLibrary.ts — 효과음(SFX) 프리셋 라이브러리 (v2.1 신규)
// 한국 웹툰 효과음 프리셋 관리 및 배치
// ============================================================

/** SFX 카테고리 */
export type SfxCategory = "impact" | "motion" | "emotion" | "environment" | "dialogue";

/** SFX 프리셋 */
export interface SfxPreset {
  text: string;
  category: SfxCategory;
  defaultStyle: {
    fontSize: number;
    fontWeight: number;
    rotation: number;
    italic: boolean;
    color: string;
  };
}

/** 한국 웹툰 SFX 프리셋 라이브러리 */
export const SFX_PRESETS: SfxPreset[] = [
  // Impact
  { text: "쿡",   category: "impact",  defaultStyle: { fontSize: 48, fontWeight: 900, rotation: -5, italic: false, color: "#000000" } },
  { text: "탁",   category: "impact",  defaultStyle: { fontSize: 52, fontWeight: 900, rotation: 3,  italic: false, color: "#000000" } },
  { text: "박",   category: "impact",  defaultStyle: { fontSize: 56, fontWeight: 900, rotation: -8, italic: false, color: "#CC0000" } },
  { text: "부앙",  category: "impact",  defaultStyle: { fontSize: 44, fontWeight: 800, rotation: 0,  italic: false, color: "#000000" } },
  { text: "택",   category: "impact",  defaultStyle: { fontSize: 40, fontWeight: 900, rotation: 5,  italic: false, color: "#000000" } },

  // Motion
  { text: "스익",  category: "motion",  defaultStyle: { fontSize: 36, fontWeight: 400, rotation: -15, italic: true,  color: "#333333" } },
  { text: "힛드득", category: "motion",  defaultStyle: { fontSize: 32, fontWeight: 500, rotation: 10,  italic: true,  color: "#444444" } },
  { text: "탁탁",  category: "motion",  defaultStyle: { fontSize: 38, fontWeight: 700, rotation: -5,  italic: false, color: "#222222" } },
  { text: "바스락", category: "motion",  defaultStyle: { fontSize: 28, fontWeight: 400, rotation: 0,   italic: true,  color: "#555555" } },

  // Emotion
  { text: "두근두근", category: "emotion", defaultStyle: { fontSize: 30, fontWeight: 600, rotation: 0,  italic: false, color: "#CC3366" } },
  { text: "울렁",    category: "emotion", defaultStyle: { fontSize: 28, fontWeight: 500, rotation: 3,  italic: true,  color: "#6633CC" } },
  { text: "떨림",    category: "emotion", defaultStyle: { fontSize: 26, fontWeight: 500, rotation: -2, italic: true,  color: "#333333" } },
  { text: "허덕",    category: "emotion", defaultStyle: { fontSize: 24, fontWeight: 400, rotation: 0,  italic: false, color: "#666666" } },

  // Environment
  { text: "셰셰",  category: "environment", defaultStyle: { fontSize: 24, fontWeight: 300, rotation: 0, italic: true,  color: "#888888" } },
  { text: "우르르", category: "environment", defaultStyle: { fontSize: 36, fontWeight: 700, rotation: 0, italic: false, color: "#555555" } },
  { text: "삐삐",  category: "environment", defaultStyle: { fontSize: 22, fontWeight: 400, rotation: 0, italic: false, color: "#CC6600" } },

  // Dialogue
  { text: "속삭",  category: "dialogue", defaultStyle: { fontSize: 20, fontWeight: 300, rotation: 0, italic: true,  color: "#999999" } },
  { text: "아하하", category: "dialogue", defaultStyle: { fontSize: 26, fontWeight: 500, rotation: 5, italic: false, color: "#333333" } },
  { text: "히히",  category: "dialogue", defaultStyle: { fontSize: 22, fontWeight: 400, rotation: 3, italic: false, color: "#666666" } },
];

export class SfxLibrary {
  /** 카테고리별 SFX 프리셋 검색 */
  getByCategory(category: SfxCategory): SfxPreset[] {
    return SFX_PRESETS.filter(p => p.category === category);
  }

  /** 텍스트 검색 */
  search(query: string): SfxPreset[] {
    return SFX_PRESETS.filter(p => p.text.includes(query));
  }

  /** SFX를 Figma 캔버스에 배치 */
  async placeSfx(parent: FrameNode, preset: SfxPreset, x: number, y: number): Promise<TextNode> {
    const font = { family: "Nanum Brush Script", style: "Regular" };
    await figma.loadFontAsync(font);

    const text = figma.createText();
    text.fontName = font;
    text.characters = preset.text;
    text.fontSize = preset.defaultStyle.fontSize;
    text.fills = [{ type: "SOLID", color: this.hexToRgb(preset.defaultStyle.color) }];
    text.x = x;
    text.y = y;

    if (preset.defaultStyle.rotation) {
      text.rotation = preset.defaultStyle.rotation;
    }

    parent.appendChild(text);
    return text;
  }

  private hexToRgb(hex: string): RGB {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16) / 255,
      g: parseInt(clean.slice(2, 4), 16) / 255,
      b: parseInt(clean.slice(4, 6), 16) / 255,
    };
  }
}
