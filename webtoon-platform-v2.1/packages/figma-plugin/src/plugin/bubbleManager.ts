// ============================================================
// bubbleManager.ts — 말풍선 Figma 컴포넌트 관리 (v2.1)
// 기존 nodeFactory.ts의 말풍선 생성 로직을 분리 + 컴포넌트 라이브러리 연동
// ============================================================
//
// TODO: nodeFactory.ts의 createDialogue() 로직을 이 모듈로 이전
//
// v2.1 목표:
// - Figma Component Set으로 말풍선 타입 관리 (Speech, Thought, Narration, Shout, Whisper)
// - 컴포넌트 인스턴스 생성 → 텍스트 자동 배치
// - SVG 패스 기반 커스텀 말풍선 (gourd, cloud, wave 등)
// - createVector API 사용하여 꼬리까지 배경 완전 채움

import type { BubbleData, BubbleStyleName } from "@webtoon/shared/types/panel";
import { hexToFigmaColor } from "./utils";

/** 말풍선 타입별 기본 스타일 */
const BUBBLE_DEFAULTS: Record<string, { radius: number; fontWeight: number; border: string }> = {
  speech:    { radius: 24, fontWeight: 500, border: "#333333" },
  thought:   { radius: 50, fontWeight: 400, border: "#999999" },
  narration: { radius: 4,  fontWeight: 500, border: "none" },
  shout:     { radius: 6,  fontWeight: 800, border: "#222222" },
  whisper:   { radius: 30, fontWeight: 400, border: "#aaaaaa" },
};

/** 컴포넌트 라이브러리에서 검색할 버블 컴포넌트명 매핑 */
const BUBBLE_COMPONENT_NAMES: Record<string, string> = {
  speech:    "Bubbles/Speech",
  thought:   "Bubbles/Thought",
  narration: "Bubbles/Narration",
  shout:     "Bubbles/Shout",
  whisper:   "Bubbles/Whisper",
  gourd:     "Bubbles/Gourd",
  cloud:     "Bubbles/Cloud",
  wave:      "Bubbles/Wave",
};

export class BubbleManager {
  private componentCache: Map<string, ComponentNode> = new Map();

  /** 말풍선 생성 (컴포넌트 라이브러리 → SVG 패스 → 기본 도형 순서) */
  async createBubble(parent: FrameNode, bubble: BubbleData): Promise<SceneNode> {
    // 1. 컴포넌트 라이브러리 검색 시도
    if (bubble.bubbleStyle) {
      const componentNode = await this.findBubbleComponent(bubble.bubbleStyle);
      if (componentNode) {
        return this.createBubbleFromComponent(parent, bubble, componentNode);
      }
    }

    // 2. SVG 패스 기반 생성
    if (bubble.svgPath?.pathD) {
      return this.createSvgBubble(parent, bubble);
    }

    // 3. 기본 도형으로 폴백
    return this.createBasicBubble(parent, bubble);
  }

  /** 컴포넌트 라이브러리에서 말풍선 컴포넌트 찾기 */
  private async findBubbleComponent(bubbleStyle: string): Promise<ComponentNode | null> {
    const componentName = BUBBLE_COMPONENT_NAMES[bubbleStyle];
    if (!componentName) return null;

    // 캐시 확인
    if (this.componentCache.has(componentName)) {
      return this.componentCache.get(componentName) || null;
    }

    try {
      // Figma API로 모든 컴포넌트 검색 (현재 파일의 라이브러리)
      const allNodes = figma.root.findAll(
        (n) => n.type === "COMPONENT" && n.name.includes(bubbleStyle)
      ) as ComponentNode[];

      if (allNodes.length > 0) {
        this.componentCache.set(componentName, allNodes[0]);
        return allNodes[0];
      }
    } catch (err) {
      console.warn(`컴포넌트 검색 실패 (${componentName}):`, err);
    }

    return null;
  }

  /** 컴포넌트 인스턴스로 말풍선 생성 */
  private async createBubbleFromComponent(
    parent: FrameNode,
    bubble: BubbleData,
    componentNode: ComponentNode
  ): Promise<SceneNode> {
    // 컴포넌트 인스턴스 생성
    const instance = componentNode.createInstance();
    instance.name = `말풍선: ${bubble.text.substring(0, 15)}`;
    instance.x = bubble.position.x;
    instance.y = bubble.position.y;
    instance.resize(bubble.size.w, bubble.size.h);

    // 인스턴스 내의 텍스트 노드 찾아서 텍스트 업데이트
    const textNodes = instance.findAll((n) => n.type === "TEXT") as TextNode[];
    if (textNodes.length > 0) {
      textNodes[0].characters = bubble.text;
    }

    parent.appendChild(instance);
    return instance;
  }

  /** SVG 패스 기반 말풍선 — createVector API 사용 */
  private async createSvgBubble(parent: FrameNode, bubble: BubbleData): Promise<SceneNode> {
    const sp = bubble.svgPath!;
    const w = bubble.size.w;
    const h = bubble.size.h;
    const fillC = sp.fillColor || "#ffffff";
    const strokeC = sp.strokeColor || "#333333";
    const strokeW = sp.strokeWidth || 2.5;

    // 좌표를 viewBox → 실제 크기로 변환
    const vbX = sp.vbX || 0, vbY = sp.vbY || 0;
    const vbW = sp.vbW || 200, vbH = sp.vbH || 200;
    const scX = w / vbW, scY = h / vbH;

    const transformedPath = sp.pathD.replace(
      /(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)/g,
      (_m: string, xStr: string, yStr: string) => {
        const nx = (parseFloat(xStr) - vbX) * scX;
        const ny = (parseFloat(yStr) - vbY) * scY;
        return nx.toFixed(2) + "," + ny.toFixed(2);
      }
    );

    const vector = figma.createVector();
    vector.name = `말풍선: ${bubble.text.substring(0, 15)}`;
    vector.vectorPaths = [{ windingRule: "NONZERO", data: transformedPath }];
    vector.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
    if (strokeC !== "none" && strokeC !== "transparent") {
      vector.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
      vector.strokeWeight = strokeW;
      vector.strokeJoin = "ROUND";
      vector.strokeCap = "ROUND";
    }
    vector.resize(w, h);
    vector.x = bubble.position.x;
    vector.y = bubble.position.y;

    parent.appendChild(vector);
    return vector;
  }

  /** 기본 도형 말풍선 (사각형/타원) */
  private async createBasicBubble(parent: FrameNode, bubble: BubbleData): Promise<SceneNode> {
    const defaults = BUBBLE_DEFAULTS[bubble.bubbleStyle || "speech"] || BUBBLE_DEFAULTS.speech;
    const w = bubble.size.w;
    const h = bubble.size.h;

    const shape = bubble.style.isEllipse ? figma.createEllipse() : figma.createRectangle();
    shape.name = `말풍선: ${bubble.text.substring(0, 15)}`;
    shape.resize(w, h);
    shape.x = bubble.position.x;
    shape.y = bubble.position.y;

    const bgColor = bubble.style.bgColor || "#ffffff";
    shape.fills = [{ type: "SOLID", color: hexToFigmaColor(bgColor) }];

    if (defaults.border !== "none") {
      const borderColor = bubble.style.borderColor || defaults.border;
      shape.strokes = [{ type: "SOLID", color: hexToFigmaColor(borderColor) }];
      shape.strokeWeight = bubble.style.borderWidth || 2;
    }

    if (!bubble.style.isEllipse && "cornerRadius" in shape) {
      (shape as RectangleNode).cornerRadius = bubble.style.radius || defaults.radius;
    }

    parent.appendChild(shape);
    return shape;
  }

  /** 말풍선 텍스트 업데이트 */
  async updateBubbleText(nodeId: string, text: string): Promise<void> {
    const node = figma.getNodeById(nodeId);
    if (node && node.type === "TEXT") {
      (node as TextNode).characters = text;
    }
  }
}
