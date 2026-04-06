// ============================================================
// NodeFactory — Figma 노드 생성 팩토리
// 각 콘텐츠 타입(이미지, 대사, 나레이션, SFX)별 노드 생성
// ============================================================

import { BubbleData, ImageData, PluginConfig, DEFAULT_CONFIG } from "./types";
import { hexToFigmaColor, base64ToBytes, setNodeMeta } from "./utils";

export class NodeFactory {
  private config: PluginConfig;
  private fontsLoaded = new Set<string>();

  constructor(config: Partial<PluginConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---- 폰트 로딩 ----

  /** 폰트를 안전하게 로딩 (실패 시 대체 폰트 사용) */
  private async loadFont(family: string, style: string): Promise<FontName> {
    const key = `${family}:${style}`;
    if (this.fontsLoaded.has(key)) {
      return { family, style };
    }

    try {
      await figma.loadFontAsync({ family, style });
      this.fontsLoaded.add(key);
      return { family, style };
    } catch {
      // 대체 폰트로 폴백
      console.warn(`폰트 로딩 실패: ${key}, Inter로 대체`);
      const fallback = { family: "Inter", style: "Regular" };
      try {
        await figma.loadFontAsync(fallback);
        this.fontsLoaded.add("Inter:Regular");
      } catch {
        // Inter도 실패하면 기본 폰트
      }
      return fallback;
    }
  }

  // ---- 페이지 프레임 ----

  /** 웹툰 페이지 프레임 생성 */
  async createPageFrame(pageIndex: number): Promise<FrameNode> {
    const frame = figma.createFrame();
    frame.name = `페이지 ${pageIndex + 1}`;
    frame.resize(this.config.pageWidth, this.config.pageHeight);
    frame.x = 0;
    frame.y = pageIndex * (this.config.pageHeight + this.config.pageGap);
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.clipsContent = true;

    setNodeMeta(frame, `page_${pageIndex}`, "page");
    return frame;
  }

  // ---- 패널 이미지 ----

  /** 패널 이미지를 Rectangle + Image Fill로 배치 */
  async placeImage(parent: FrameNode, imageData: ImageData): Promise<RectangleNode> {
    const bytes = base64ToBytes(imageData.base64);
    const image = figma.createImage(bytes);

    const rect = figma.createRectangle();
    rect.name = `패널 이미지`;
    rect.x = imageData.bounds.x * this.config.scaleFactor;
    rect.y = imageData.bounds.y * this.config.scaleFactor;
    rect.resize(
      imageData.bounds.w * this.config.scaleFactor,
      imageData.bounds.h * this.config.scaleFactor
    );
    rect.fills = [{
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode: "FILL",
    }];

    setNodeMeta(rect, imageData.id, "image");
    parent.appendChild(rect);
    return rect;
  }

  /** 기존 이미지 노드 업데이트 (노드 재생성 없이 이미지만 교체) */
  async updateImage(node: RectangleNode, imageData: ImageData): Promise<void> {
    const bytes = base64ToBytes(imageData.base64);
    const image = figma.createImage(bytes);
    node.fills = [{
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode: "FILL",
    }];
    node.setPluginData("lastSync", Date.now().toString());
  }

  // ---- 대사 (말풍선) ----

  /** 대사 말풍선 생성: 타원 배경 + 텍스트 */
  async createDialogue(parent: FrameNode, bubble: BubbleData): Promise<FrameNode> {
    const sx = this.config.scaleFactor;
    const group = figma.createFrame();
    group.name = `대사: ${bubble.text.substring(0, 15)}`;
    group.x = bubble.position.x * sx;
    group.y = bubble.position.y * sx;
    group.resize(bubble.size.w * sx, bubble.size.h * sx);
    group.fills = []; // 투명

    // 말풍선 배경 (타원)
    const bg = figma.createEllipse();
    bg.name = "말풍선 배경";
    bg.resize(bubble.size.w * sx, bubble.size.h * sx);
    bg.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    bg.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    bg.strokeWeight = 2;
    group.appendChild(bg);

    // 대사 텍스트
    const fontName = await this.loadFont(
      bubble.style.fontFamily || this.config.defaultFont.family,
      this.config.defaultFont.style
    );
    const text = figma.createText();
    text.fontName = fontName;
    text.characters = bubble.text;
    text.fontSize = bubble.style.fontSize || 14;
    text.textAlignHorizontal = "CENTER";
    text.textAlignVertical = "CENTER";
    text.resize((bubble.size.w - 20) * sx, (bubble.size.h - 20) * sx);
    text.x = 10 * sx;
    text.y = 10 * sx;
    text.textAutoResize = "HEIGHT";

    if (bubble.style.color) {
      text.fills = [{ type: "SOLID", color: hexToFigmaColor(bubble.style.color) }];
    }
    group.appendChild(text);

    setNodeMeta(group, bubble.id, "dialogue");
    parent.appendChild(group);
    return group;
  }

  // ---- 나레이션 ----

  /** 나레이션 박스 생성: 반투명 사각형 배경 + 흰색 텍스트 */
  async createNarration(parent: FrameNode, bubble: BubbleData): Promise<FrameNode> {
    const sx = this.config.scaleFactor;
    const group = figma.createFrame();
    group.name = `나레이션: ${bubble.text.substring(0, 15)}`;
    group.x = bubble.position.x * sx;
    group.y = bubble.position.y * sx;
    group.resize(bubble.size.w * sx, bubble.size.h * sx);
    group.fills = [];

    // 반투명 어두운 배경
    const bg = figma.createRectangle();
    bg.name = "나레이션 배경";
    bg.resize(bubble.size.w * sx, bubble.size.h * sx);
    bg.fills = [{ type: "SOLID", color: { r: 0.05, g: 0.05, b: 0.1 }, opacity: 0.75 }];
    bg.cornerRadius = 4;
    group.appendChild(bg);

    // 나레이션 텍스트 (흰색)
    const fontName = await this.loadFont(
      bubble.style.fontFamily || this.config.defaultFont.family,
      this.config.defaultFont.style
    );
    const text = figma.createText();
    text.fontName = fontName;
    text.characters = bubble.text;
    text.fontSize = bubble.style.fontSize || 12;
    text.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    text.textAlignHorizontal = "LEFT";
    text.resize((bubble.size.w - 16) * sx, (bubble.size.h - 16) * sx);
    text.x = 8 * sx;
    text.y = 8 * sx;
    text.textAutoResize = "HEIGHT";
    group.appendChild(text);

    setNodeMeta(group, bubble.id, "narration");
    parent.appendChild(group);
    return group;
  }

  // ---- SFX (효과음) ----

  /** SFX 텍스트 생성: 굵은 폰트 + 색상 + 회전 + 외곽선 */
  async createSFX(parent: FrameNode, bubble: BubbleData): Promise<TextNode> {
    const sx = this.config.scaleFactor;
    const fontName = await this.loadFont(
      bubble.style.fontFamily || this.config.sfxFont.family,
      this.config.sfxFont.style
    );

    const text = figma.createText();
    text.name = `SFX: ${bubble.text}`;
    text.fontName = fontName;
    text.characters = bubble.text;
    text.fontSize = bubble.style.fontSize || 32;

    // SFX 색상 (기본: 빨강)
    const color = hexToFigmaColor(bubble.style.color || "#ff6b6b");
    text.fills = [{ type: "SOLID", color }];

    // 위치 및 회전
    text.x = bubble.position.x * sx;
    text.y = bubble.position.y * sx;
    if (bubble.style.rotation) {
      text.rotation = bubble.style.rotation;
    }

    // 외곽선 효과
    if (bubble.style.strokeColor) {
      text.strokes = [{ type: "SOLID", color: hexToFigmaColor(bubble.style.strokeColor) }];
      text.strokeWeight = bubble.style.strokeWeight || 1;
    } else {
      text.strokes = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      text.strokeWeight = 1;
    }

    setNodeMeta(text, bubble.id, "sfx");
    parent.appendChild(text);
    return text;
  }

  // ---- 범용: 타입별 분기 ----

  /** 버블 타입에 따라 적절한 노드 생성 */
  async createBubbleNode(parent: FrameNode, bubble: BubbleData): Promise<SceneNode> {
    switch (bubble.type) {
      case "dialogue":
        return this.createDialogue(parent, bubble);
      case "narration":
        return this.createNarration(parent, bubble);
      case "sfx":
        return this.createSFX(parent, bubble);
      default:
        throw new Error(`알 수 없는 버블 타입: ${(bubble as any).type}`);
    }
  }

  // ---- 업데이트 ----

  /** 기존 버블 노드의 텍스트·위치·스타일 업데이트 */
  async updateBubbleNode(node: SceneNode, bubble: BubbleData): Promise<void> {
    const sx = this.config.scaleFactor;

    // 위치 업데이트
    node.x = bubble.position.x * sx;
    node.y = bubble.position.y * sx;

    // 회전 (SFX)
    if (bubble.style.rotation !== undefined) {
      node.rotation = bubble.style.rotation;
    }

    // 텍스트 업데이트
    let textNode: TextNode | null = null;

    if (node.type === "TEXT") {
      textNode = node;
    } else if (node.type === "FRAME") {
      textNode = (node as FrameNode).findOne(n => n.type === "TEXT") as TextNode | null;
    }

    if (textNode && textNode.characters !== bubble.text) {
      const fontName = await this.loadFont(
        bubble.style.fontFamily || this.config.defaultFont.family,
        bubble.type === "sfx" ? this.config.sfxFont.style : this.config.defaultFont.style
      );
      textNode.fontName = fontName;
      textNode.characters = bubble.text;
      if (bubble.style.fontSize) {
        textNode.fontSize = bubble.style.fontSize;
      }
      if (bubble.style.color) {
        textNode.fills = [{ type: "SOLID", color: hexToFigmaColor(bubble.style.color) }];
      }
    }

    node.setPluginData("lastSync", Date.now().toString());
  }
}
