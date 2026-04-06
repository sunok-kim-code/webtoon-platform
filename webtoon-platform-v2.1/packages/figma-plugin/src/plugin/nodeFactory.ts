// ============================================================
// NodeFactory — Figma 노드 생성 팩토리
// 각 콘텐츠 타입(이미지, 대사, 나레이션, SFX)별 노드 생성
// ============================================================

import type { BubbleData, ImageData } from "@webtoon/shared/types/panel";
import type { PluginConfig } from "@webtoon/shared/types/figmaExport";
import { DEFAULT_CONFIG } from "@webtoon/shared/types/figmaExport";
import { hexToFigmaColor, base64ToBytes, setNodeMeta, getImageBytes } from "./utils";

export class NodeFactory {
  private config: PluginConfig;
  private fontsLoaded = new Set<string>();

  constructor(config: Partial<PluginConfig> = {}) {
    this.config = Object.assign({}, DEFAULT_CONFIG, config);
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

  /** 웹툰 페이지 프레임 생성 — pageSize가 있으면 웹앱 실제 크기 사용 */
  async createPageFrame(pageIndex: number, pageSize?: { w: number; h: number }): Promise<FrameNode> {
    var w = (pageSize && pageSize.w) ? pageSize.w : this.config.pageWidth;
    var h = (pageSize && pageSize.h) ? pageSize.h : this.config.pageHeight;
    var frame = figma.createFrame();
    frame.name = "페이지 " + (pageIndex + 1);
    frame.resize(w, h);
    frame.x = 0;
    frame.y = pageIndex * (h + this.config.pageGap);
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.clipsContent = true;
    // 자동 레이아웃 비활성화 — 모든 자식을 절대 좌표로 배치
    frame.layoutMode = "NONE";

    setNodeMeta(frame, "page_" + pageIndex, "page");
    return frame;
  }

  // ---- 패널 이미지 ----

  /** 패널 이미지를 Rectangle + Image Fill로 배치 */
  async placeImage(parent: FrameNode, imageData: ImageData): Promise<RectangleNode> {
    const bytes = await getImageBytes(imageData);
    if (!bytes) {
      console.warn("이미지 데이터를 가져올 수 없음:", imageData.id);
      // 빈 사각형이라도 생성
      const rect = figma.createRectangle();
      rect.name = "패널 이미지 (로딩 실패)";
      rect.x = imageData.bounds.x * this.config.scaleFactor;
      rect.y = imageData.bounds.y * this.config.scaleFactor;
      rect.resize(imageData.bounds.w * this.config.scaleFactor, imageData.bounds.h * this.config.scaleFactor);
      rect.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
      setNodeMeta(rect, imageData.id, "image");
      parent.appendChild(rect);
      return rect;
    }
    const image = figma.createImage(bytes);
    const rect = figma.createRectangle();
    rect.name = "패널 이미지";
    rect.x = imageData.bounds.x * this.config.scaleFactor;
    rect.y = imageData.bounds.y * this.config.scaleFactor;
    rect.resize(imageData.bounds.w * this.config.scaleFactor, imageData.bounds.h * this.config.scaleFactor);
    rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    setNodeMeta(rect, imageData.id, "image");
    parent.appendChild(rect);
    return rect;
  }

  /** 기존 이미지 노드 업데이트 (노드 재생성 없이 이미지만 교체) */
  async updateImage(node: RectangleNode, imageData: ImageData): Promise<void> {
    const bytes = await getImageBytes(imageData);
    if (!bytes) { console.warn("이미지 업데이트 실패: 데이터 없음"); return; }
    const image = figma.createImage(bytes);
    node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    node.setPluginData("lastSync", Date.now().toString());
  }

  // ---- 대사 (말풍선) ----

  /** 대사 말풍선 생성: 텍스트 크기 측정 → 말풍선 자동 크기 조절 */
  async createDialogue(parent: FrameNode, bubble: BubbleData): Promise<FrameNode> {
    var sx = this.config.scaleFactor;
    var style = bubble.style || {};
    var textPad = bubble.svgPath ? 25 : 15;  // 텍스트 패딩

    // ★ 1단계: 텍스트를 먼저 생성하여 실제 크기 측정
    var fontName = await this.loadFont(
      bubble.style.fontFamily || this.config.defaultFont.family,
      this.config.defaultFont.style
    );
    var text = figma.createText();
    text.fontName = fontName;
    text.characters = bubble.text;
    text.fontSize = bubble.style.fontSize || 14;
    text.textAlignHorizontal = "CENTER";
    text.textAlignVertical = "CENTER";

    // 최대 텍스트 너비 설정 (웹앱 원본 크기 기반)
    var maxTextW = Math.max(60, (bubble.size.w - textPad * 2)) * sx;
    text.resize(maxTextW, 10);  // 임시 높이
    text.textAutoResize = "HEIGHT";  // 높이를 텍스트에 맞춰 자동 조절

    // 텍스트 실제 크기 측정
    var textW = text.width;
    var textH = text.height;

    // ★ 2단계: 텍스트 크기에 기반한 말풍선 크기 계산
    var minW = 60 * sx;
    var minH = 40 * sx;
    // 짧은 텍스트면 텍스트 폭에 맞춤, 길면 maxTextW 유지
    var fitW = Math.max(minW, Math.min(textW + textPad * 2 * sx, bubble.size.w * sx));
    var fitH = Math.max(minH, textH + textPad * 2 * sx);

    // 원본 크기와 자동 크기 중 적절한 값 사용
    var origW = bubble.size.w * sx;
    var origH = bubble.size.h * sx;
    var w = origW;
    var h = Math.max(origH, fitH);  // 높이는 텍스트가 넘치면 키움

    // 짧은 텍스트 (한 줄)면 너비도 텍스트에 맞춤
    if (textH <= (bubble.style.fontSize || 14) * sx * 1.8) {
      w = Math.max(minW, fitW);
    }

    // ★ 3단계: 그룹 프레임 생성
    var group = figma.createFrame();
    group.name = style.isConcentration ? "집중선: " + bubble.text.substring(0, 15) : "대사: " + bubble.text.substring(0, 15);
    group.x = bubble.position.x * sx;
    group.y = bubble.position.y * sx;
    group.resize(w, h);
    group.fills = [];
    group.layoutMode = "NONE";
    group.clipsContent = style.isConcentration ? true : false;

    // ★ 4단계: 말풍선 배경 생성 (계산된 크기 사용)
    var bg: SceneNode;

    if (style.isConcentration) {
      // ★ 집중선 — 방사형 선들을 SVG로 생성
      var cColor = style.concentrationColor || '#000000';
      var cPad = style.concentrationPadding || 0;
      var cMargin = style.concentrationOuterMargin || 0;
      var cx = w / 2, cy = h / 2;
      var baseR = 0.22;
      var rFactor = Math.max(0.08, Math.min(0.45, baseR + cPad * 0.004));
      var innerRx = w * rFactor, innerRy = h * rFactor;
      var outerScale = Math.max(0.2, Math.min(1.5, 1.0 - cMargin * 0.014));

      // 의사 난수 함수 (웹앱과 동일)
      var rand = function(i: number, off: number) {
        var x = Math.sin(42 + i * 127.1 + off * 311.7) * 43758.5453;
        return x - Math.floor(x);
      };

      var svgLines = '';
      var clusterCount = 35;
      var angle = 0;
      for (var c = 0; c < clusterCount; c++) {
        var gap = (Math.PI * 2 / clusterCount) * (0.7 + rand(c, 0) * 0.6);
        angle += gap;
        var linesInCluster = 2 + Math.floor(rand(c, 1) * 3);
        var clusterSpread = (Math.PI * 2 / clusterCount) * 0.5;
        for (var li = 0; li < linesInCluster; li++) {
          var a = angle + (li - (linesInCluster - 1) / 2) * clusterSpread / linesInCluster;
          var cosA = Math.cos(a), sinA = Math.sin(a);
          var startDist = 1.0 + rand(c * 10 + li, 4) * 0.1;
          var lsx = cx + cosA * innerRx * startDist;
          var lsy = cy + sinA * innerRy * startDist;
          var lenType = rand(c * 10 + li, 5);
          var lenMult = 0;
          if (lenType < 0.3) lenMult = 0.12 + rand(c * 10 + li, 6) * 0.1;
          else if (lenType < 0.7) lenMult = 0.22 + rand(c * 10 + li, 6) * 0.13;
          else lenMult = 0.35 + rand(c * 10 + li, 6) * 0.15;
          var maxReachX = (cx - innerRx) * outerScale;
          var maxReachY = (cy - innerRy) * outerScale;
          var outerDist = innerRx + maxReachX * lenMult;
          var outerDistY = innerRy + maxReachY * lenMult;
          var lex = cx + cosA * outerDist;
          var ley = cy + sinA * outerDistY;
          var unit = w / 200;
          var lsw = (0.3 + rand(c * 10 + li, 7) * 0.9) * unit;
          svgLines += '<line x1="' + lsx.toFixed(1) + '" y1="' + lsy.toFixed(1)
            + '" x2="' + lex.toFixed(1) + '" y2="' + ley.toFixed(1)
            + '" stroke="' + cColor + '" stroke-width="' + lsw.toFixed(2)
            + '" stroke-linecap="round"/>';
        }
      }
      var concSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h
        + '" viewBox="0 0 ' + w + ' ' + h + '">' + svgLines + '</svg>';
      try {
        var concNode = figma.createNodeFromSvg(concSvg);
        concNode.name = "집중선";
        concNode.resize(w, h);
        concNode.x = 0;
        concNode.y = 0;
        bg = concNode;
      } catch (e) {
        console.warn("집중선 SVG 생성 실패:", e);
        var concFallback = figma.createRectangle();
        concFallback.name = "집중선 배경";
        concFallback.resize(w, h);
        concFallback.fills = [];
        bg = concFallback;
      }
    } else if (bubble.svgPath && bubble.svgPath.pathD) {
      var sp = bubble.svgPath;
      var fillC = sp.fillColor || '#ffffff';
      var strokeC = sp.strokeColor || '#333333';
      var strokeW = sp.strokeWidth || 2.5;
      // ★ createVector API 사용 — createNodeFromSvg의 preserveAspectRatio/clipsContent 문제 우회
      // 패스 좌표를 실제 말풍선 크기(w,h)에 맞게 사전 변환
      try {
        var vbX = sp.vbX || 0, vbY = sp.vbY || 0;
        var vbW = sp.vbW || 200, vbH = sp.vbH || 200;
        var scX = w / vbW, scY = h / vbH;
        // 좌표 쌍(x,y)을 viewBox→실제 크기로 변환
        var transformedPath = sp.pathD.replace(
          /(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)/g,
          function(_m: string, xStr: string, yStr: string) {
            var nx = ((parseFloat(xStr) - vbX) * scX);
            var ny = ((parseFloat(yStr) - vbY) * scY);
            return nx.toFixed(2) + ',' + ny.toFixed(2);
          }
        );
        var vector = figma.createVector();
        vector.name = "말풍선 배경";
        vector.vectorPaths = [{
          windingRule: "NONZERO",
          data: transformedPath
        }];
        vector.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
        if (strokeC && strokeC !== 'none' && strokeC !== 'transparent') {
          vector.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
          vector.strokeWeight = strokeW;
          vector.strokeJoin = "ROUND";
          vector.strokeCap = "ROUND";
        }
        // 벡터 크기를 정확히 w×h로 맞춤 (패스 바운딩 박스와 약간 다를 수 있으므로)
        vector.resize(w, h);
        vector.x = 0;
        vector.y = 0;
        bg = vector;
      } catch (e) {
        console.warn("Vector 말풍선 생성 실패, SVG 대체 시도:", e);
        // Fallback: SVG import (기존 방식)
        try {
          var svgStr = '<svg xmlns="http://www.w3.org/2000/svg"'
            + ' width="' + w + '" height="' + h + '"'
            + ' viewBox="' + sp.vbX + ' ' + sp.vbY + ' ' + sp.vbW + ' ' + sp.vbH + '"'
            + ' preserveAspectRatio="none">'
            + '<path d="' + sp.pathD + '"'
            + ' fill="' + fillC + '"'
            + ' stroke="' + strokeC + '"'
            + ' stroke-width="' + strokeW + '"'
            + ' stroke-linejoin="round"/>'
            + '</svg>';
          var svgNode = figma.createNodeFromSvg(svgStr);
          svgNode.name = "말풍선 배경";
          // 프레임 + 내부 자식 모두 리사이즈하여 꼬리까지 배경 채움
          for (var ci = 0; ci < svgNode.children.length; ci++) {
            var child = svgNode.children[ci] as SceneNode;
            if ('resize' in child) (child as any).resize(w, h);
          }
          svgNode.resize(w, h);
          if ('clipsContent' in svgNode) (svgNode as FrameNode).clipsContent = false;
          svgNode.x = 0;
          svgNode.y = 0;
          bg = svgNode;
        } catch (e2) {
          console.warn("SVG 말풍선도 실패, 사각형으로 대체:", e2);
          var fallbackRect = figma.createRectangle();
          fallbackRect.name = "말풍선 배경";
          fallbackRect.resize(w, h);
          fallbackRect.cornerRadius = Math.min(w, h) * 0.3;
          fallbackRect.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
          fallbackRect.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
          fallbackRect.strokeWeight = strokeW;
          bg = fallbackRect;
        }
      }
    } else if (style.isEllipse) {
      var ellipse = figma.createEllipse();
      ellipse.name = "말풍선 배경";
      ellipse.resize(w, h);
      var bgColor = style.bgColor ? hexToFigmaColor(style.bgColor) : { r: 1, g: 1, b: 1 };
      ellipse.fills = [{ type: "SOLID", color: bgColor }];
      // border가 'none'이면 stroke 없음
      if (style.borderColor && style.borderColor !== 'none' && style.borderColor !== 'transparent') {
        ellipse.strokes = [{ type: "SOLID", color: hexToFigmaColor(style.borderColor) }];
        ellipse.strokeWeight = style.borderWidth || 2;
      }
      if (style.isDashed) { ellipse.dashPattern = [6, 4]; }
      bg = ellipse;
    } else {
      var rect = figma.createRectangle();
      rect.name = "말풍선 배경";
      rect.resize(w, h);
      var bgColor2 = style.bgColor ? hexToFigmaColor(style.bgColor) : { r: 1, g: 1, b: 1 };
      rect.cornerRadius = style.radius || Math.min(w, h) * 0.3;
      rect.fills = [{ type: "SOLID", color: bgColor2 }];
      if (style.borderColor && style.borderColor !== 'none') {
        rect.strokes = [{ type: "SOLID", color: hexToFigmaColor(style.borderColor) }];
        rect.strokeWeight = style.borderWidth || 2;
      }
      if (style.isDashed) { rect.dashPattern = [6, 4]; }
      bg = rect;
    }
    group.appendChild(bg);

    // ★ 5단계: 텍스트 위치 배치 (중앙 정렬)
    text.resize(Math.max(20, w - textPad * 2 * sx), textH);
    text.x = (w - text.width) / 2;
    text.y = (h - textH) / 2;
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
    group.name = "나레이션: " + bubble.text.substring(0, 15);
    group.x = bubble.position.x * sx;
    group.y = bubble.position.y * sx;
    group.resize(bubble.size.w * sx, bubble.size.h * sx);
    group.fills = [];
    group.layoutMode = "NONE";
    group.clipsContent = false;

    // 투명 배경 (배경 없음)
    const bg = figma.createRectangle();
    bg.name = "나레이션 배경";
    bg.resize(bubble.size.w * sx, bubble.size.h * sx);
    bg.fills = [];
    bg.cornerRadius = 0;
    group.appendChild(bg);

    // 나레이션 텍스트 (블랙)
    const fontName = await this.loadFont(
      bubble.style.fontFamily || this.config.defaultFont.family,
      this.config.defaultFont.style
    );
    const text = figma.createText();
    text.fontName = fontName;
    text.characters = bubble.text;
    text.fontSize = bubble.style.fontSize || 12;
    text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
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
    var sx = this.config.scaleFactor;
    var requestedFamily = bubble.style.fontFamily || this.config.sfxFont.family;

    // SFX 폰트 로딩: 요청 폰트 여러 스타일 시도 → 최종 Inter 폴백
    var fontName: FontName = { family: "Inter", style: "Bold" };
    var fontStyles = ["Regular", "Bold"];
    var loaded = false;
    for (var si = 0; si < fontStyles.length && !loaded; si++) {
      try {
        await figma.loadFontAsync({ family: requestedFamily, style: fontStyles[si] });
        fontName = { family: requestedFamily, style: fontStyles[si] };
        loaded = true;
        console.log("[SFX] 폰트 로딩 성공:", requestedFamily, fontStyles[si]);
      } catch (e) {
        console.log("[SFX] 폰트 시도 실패:", requestedFamily, fontStyles[si]);
      }
    }
    if (!loaded) {
      // Inter Bold → Inter Regular 순으로 폴백
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); fontName = { family: "Inter", style: "Bold" }; }
      catch (e2) {
        try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); fontName = { family: "Inter", style: "Regular" }; }
        catch (e3) { console.warn("[SFX] 모든 폰트 로딩 실패"); }
      }
      console.warn("[SFX] '" + requestedFamily + "' 없음, " + fontName.family + " " + fontName.style + " 사용");
    }

    var text = figma.createText();
    text.name = "SFX: " + bubble.text;
    text.fontName = fontName;
    text.characters = bubble.text;
    text.fontSize = bubble.style.fontSize || 32;

    // SFX 색상 (기본: 빨강)
    var color = hexToFigmaColor(bubble.style.color || "#ff6b6b");
    text.fills = [{ type: "SOLID", color: color }];

    // 위치
    text.x = bubble.position.x * sx;
    text.y = bubble.position.y * sx;

    // 회전
    var rotation = bubble.style.rotation || 0;
    if (rotation) {
      text.rotation = rotation;
    }

    // 외곽선 효과
    if (bubble.style.strokeColor) {
      text.strokes = [{ type: "SOLID", color: hexToFigmaColor(bubble.style.strokeColor) }];
      text.strokeWeight = bubble.style.strokeWidth || bubble.style.strokeWeight || 1.5;
    } else {
      text.strokes = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      text.strokeWeight = 1.5;
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
