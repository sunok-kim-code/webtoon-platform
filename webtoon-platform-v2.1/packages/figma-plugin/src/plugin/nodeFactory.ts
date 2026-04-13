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
    var textPad = bubble.svgPath ? 30 : 20;  // 텍스트 패딩 (넉넉하게)

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
      // ★ 타원 + 꼬리로 말풍선 생성 (SVG/Vector 대신 기본 도형 사용 — 고아 노드 방지)
      // 타원 몸체
      var bodyH = h * 0.78;
      var ellipseBg = figma.createEllipse();
      ellipseBg.name = "말풍선 몸체";
      ellipseBg.resize(w, bodyH);
      ellipseBg.x = 0;
      ellipseBg.y = 0;
      ellipseBg.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
      if (strokeC && strokeC !== 'none' && strokeC !== 'transparent') {
        ellipseBg.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
        ellipseBg.strokeWeight = strokeW;
      }
      group.appendChild(ellipseBg);

      // 꼬리 삼각형 (말풍선 아래)
      var tailVec = figma.createVector();
      tailVec.name = "말풍선 꼬리";
      // 꼬리 방향 판단: pathD에서 왼쪽/오른쪽 꼬리 구분
      var isRightTail = sp.pathD.indexOf("104.575") >= 0;
      var tailW2 = w * 0.18;
      var tailH2 = h - bodyH + strokeW;
      var tailCx = isRightTail ? w * 0.65 : w * 0.35;
      var t1x = tailCx - tailW2 / 2;
      var t2x = tailCx + tailW2 / 2;
      var tipX = isRightTail ? w * 0.3 : w * 0.7;
      var tipY = tailH2;
      var tailPath = "M 0,0 L " + tailW2.toFixed(1) + ",0 L " + (tipX - t1x).toFixed(1) + "," + tipY.toFixed(1) + " Z";
      tailVec.vectorPaths = [{ windingRule: "NONZERO", data: tailPath }];
      tailVec.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
      if (strokeC && strokeC !== 'none' && strokeC !== 'transparent') {
        tailVec.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
        tailVec.strokeWeight = strokeW;
      }
      tailVec.x = t1x;
      tailVec.y = bodyH - strokeW;
      tailVec.resize(tailW2, tailH2);
      group.appendChild(tailVec);

      // 타원-꼬리 이음새 가리기 (흰색 사각형)
      var seamCover = figma.createRectangle();
      seamCover.name = "이음새";
      seamCover.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
      seamCover.strokes = [];
      seamCover.resize(tailW2 + strokeW * 2, strokeW * 3);
      seamCover.x = t1x - strokeW;
      seamCover.y = bodyH - strokeW * 2;
      group.appendChild(seamCover);

      // bg는 사용하지 않으므로 더미 (group.appendChild(bg) 방지)
      bg = seamCover;
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
    // SVG 말풍선인 경우 텍스트를 타원 몸체 영역(상위 78%) 중앙에 배치
    var textAreaH = (bubble.svgPath && bubble.svgPath.pathD) ? h * 0.78 : h;
    text.resize(Math.max(20, w - textPad * 2 * sx), textH);
    text.x = (w - text.width) / 2;
    text.y = (textAreaH - textH) / 2;
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
