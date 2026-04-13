"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __publicField = (obj, key, value) => {
    __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
    return value;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // ../shared/types/figmaExport.ts
  var DEFAULT_CONFIG;
  var init_figmaExport = __esm({
    "../shared/types/figmaExport.ts"() {
      "use strict";
      DEFAULT_CONFIG = {
        pageWidth: 800,
        pageHeight: 1200,
        pageGap: 100,
        defaultFont: { family: "Inter", style: "Regular" },
        sfxFont: { family: "Nanum Brush Script", style: "Regular" },
        scaleFactor: 1,
        stripWidth: 800,
        gutterSize: 20
      };
    }
  });

  // src/plugin/utils.ts
  function hexToFigmaColor(hex) {
    if (!hex || hex === "none" || hex === "transparent") {
      return { r: 0, g: 0, b: 0 };
    }
    var clean = hex.replace("#", "");
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    var r = parseInt(clean.substring(0, 2), 16) / 255;
    var g = parseInt(clean.substring(2, 4), 16) / 255;
    var b = parseInt(clean.substring(4, 6), 16) / 255;
    if (isNaN(r))
      r = 0;
    if (isNaN(g))
      g = 0;
    if (isNaN(b))
      b = 0;
    return { r, g, b };
  }
  function base64ToBytes(base64) {
    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
  function setNodeMeta(node, webAppId, type) {
    node.setPluginData("webAppId", webAppId);
    node.setPluginData("syncType", type);
    node.setPluginData("lastSync", Date.now().toString());
  }
  function fetchImageBytes(url) {
    return __async(this, null, function* () {
      try {
        console.log("[fetchImageBytes] \uB2E4\uC6B4\uB85C\uB4DC \uC2DC\uC791:", url.substring(0, 100) + "...");
        var response = yield fetch(url);
        if (!response.ok) {
          console.warn("[fetchImageBytes] HTTP \uC5D0\uB7EC:", response.status, response.statusText);
          return null;
        }
        var buffer = yield response.arrayBuffer();
        console.log("[fetchImageBytes] \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC:", buffer.byteLength, "bytes");
        return new Uint8Array(buffer);
      } catch (e) {
        console.warn("[fetchImageBytes] \uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328:", e);
        return null;
      }
    });
  }
  function getImageBytes(imageData) {
    return __async(this, null, function* () {
      console.log("[getImageBytes] storageUrl:", !!imageData.storageUrl, "base64 len:", (imageData.base64 || "").length);
      if (imageData.storageUrl && imageData.storageUrl.length > 10) {
        return fetchImageBytes(imageData.storageUrl);
      }
      if (imageData.base64 && imageData.base64.length > 10) {
        return base64ToBytes(imageData.base64);
      }
      console.warn("[getImageBytes] \uC774\uBBF8\uC9C0 \uC18C\uC2A4 \uC5C6\uC74C");
      return null;
    });
  }
  function findNodeByWebAppId(parent, webAppId) {
    for (const child of parent.children) {
      if (child.getPluginData("webAppId") === webAppId) {
        return child;
      }
      if ("children" in child) {
        const found = findNodeByWebAppId(child, webAppId);
        if (found)
          return found;
      }
    }
    return null;
  }
  var init_utils = __esm({
    "src/plugin/utils.ts"() {
      "use strict";
    }
  });

  // src/plugin/nodeFactory.ts
  var NodeFactory;
  var init_nodeFactory = __esm({
    "src/plugin/nodeFactory.ts"() {
      "use strict";
      init_figmaExport();
      init_utils();
      NodeFactory = class {
        constructor(config = {}) {
          __publicField(this, "config");
          __publicField(this, "fontsLoaded", /* @__PURE__ */ new Set());
          this.config = Object.assign({}, DEFAULT_CONFIG, config);
        }
        // ---- 폰트 로딩 ----
        /** 폰트를 안전하게 로딩 (실패 시 대체 폰트 사용) */
        loadFont(family, style) {
          return __async(this, null, function* () {
            const key = `${family}:${style}`;
            if (this.fontsLoaded.has(key)) {
              return { family, style };
            }
            try {
              yield figma.loadFontAsync({ family, style });
              this.fontsLoaded.add(key);
              return { family, style };
            } catch (e) {
              console.warn(`\uD3F0\uD2B8 \uB85C\uB529 \uC2E4\uD328: ${key}, Inter\uB85C \uB300\uCCB4`);
              const fallback = { family: "Inter", style: "Regular" };
              try {
                yield figma.loadFontAsync(fallback);
                this.fontsLoaded.add("Inter:Regular");
              } catch (e2) {
              }
              return fallback;
            }
          });
        }
        // ---- 페이지 프레임 ----
        /** 웹툰 페이지 프레임 생성 — pageSize가 있으면 웹앱 실제 크기 사용 */
        createPageFrame(pageIndex, pageSize) {
          return __async(this, null, function* () {
            var w = pageSize && pageSize.w ? pageSize.w : this.config.pageWidth;
            var h = pageSize && pageSize.h ? pageSize.h : this.config.pageHeight;
            var frame = figma.createFrame();
            frame.name = "\uD398\uC774\uC9C0 " + (pageIndex + 1);
            frame.resize(w, h);
            frame.x = 0;
            frame.y = pageIndex * (h + this.config.pageGap);
            frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            frame.clipsContent = true;
            frame.layoutMode = "NONE";
            setNodeMeta(frame, "page_" + pageIndex, "page");
            return frame;
          });
        }
        // ---- 패널 이미지 ----
        /** 패널 이미지를 Rectangle + Image Fill로 배치 */
        placeImage(parent, imageData) {
          return __async(this, null, function* () {
            const bytes = yield getImageBytes(imageData);
            if (!bytes) {
              console.warn("\uC774\uBBF8\uC9C0 \uB370\uC774\uD130\uB97C \uAC00\uC838\uC62C \uC218 \uC5C6\uC74C:", imageData.id);
              const rect2 = figma.createRectangle();
              rect2.name = "\uD328\uB110 \uC774\uBBF8\uC9C0 (\uB85C\uB529 \uC2E4\uD328)";
              rect2.x = imageData.bounds.x * this.config.scaleFactor;
              rect2.y = imageData.bounds.y * this.config.scaleFactor;
              rect2.resize(imageData.bounds.w * this.config.scaleFactor, imageData.bounds.h * this.config.scaleFactor);
              rect2.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
              setNodeMeta(rect2, imageData.id, "image");
              parent.appendChild(rect2);
              return rect2;
            }
            const image = figma.createImage(bytes);
            const rect = figma.createRectangle();
            rect.name = "\uD328\uB110 \uC774\uBBF8\uC9C0";
            rect.x = imageData.bounds.x * this.config.scaleFactor;
            rect.y = imageData.bounds.y * this.config.scaleFactor;
            rect.resize(imageData.bounds.w * this.config.scaleFactor, imageData.bounds.h * this.config.scaleFactor);
            rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
            setNodeMeta(rect, imageData.id, "image");
            parent.appendChild(rect);
            return rect;
          });
        }
        /** 기존 이미지 노드 업데이트 (노드 재생성 없이 이미지만 교체) */
        updateImage(node, imageData) {
          return __async(this, null, function* () {
            const bytes = yield getImageBytes(imageData);
            if (!bytes) {
              console.warn("\uC774\uBBF8\uC9C0 \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328: \uB370\uC774\uD130 \uC5C6\uC74C");
              return;
            }
            const image = figma.createImage(bytes);
            node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
            node.setPluginData("lastSync", Date.now().toString());
          });
        }
        // ---- 대사 (말풍선) ----
        /** 대사 말풍선 생성: 텍스트 크기 측정 → 말풍선 자동 크기 조절 */
        createDialogue(parent, bubble) {
          return __async(this, null, function* () {
            var sx = this.config.scaleFactor;
            var style = bubble.style || {};
            var textPad = bubble.svgPath ? 30 : 20;
            var fontName = yield this.loadFont(
              bubble.style.fontFamily || this.config.defaultFont.family,
              this.config.defaultFont.style
            );
            var text = figma.createText();
            text.fontName = fontName;
            text.characters = bubble.text;
            text.fontSize = bubble.style.fontSize || 14;
            text.textAlignHorizontal = "CENTER";
            text.textAlignVertical = "CENTER";
            var maxTextW = Math.max(60, bubble.size.w - textPad * 2) * sx;
            text.resize(maxTextW, 10);
            text.textAutoResize = "HEIGHT";
            var textW = text.width;
            var textH = text.height;
            var minW = 60 * sx;
            var minH = 40 * sx;
            var fitW = Math.max(minW, Math.min(textW + textPad * 2 * sx, bubble.size.w * sx));
            var fitH = Math.max(minH, textH + textPad * 2 * sx);
            var origW = bubble.size.w * sx;
            var origH = bubble.size.h * sx;
            var w = origW;
            var h = Math.max(origH, fitH);
            if (textH <= (bubble.style.fontSize || 14) * sx * 1.8) {
              w = Math.max(minW, fitW);
            }
            var group = figma.createFrame();
            group.name = style.isConcentration ? "\uC9D1\uC911\uC120: " + bubble.text.substring(0, 15) : "\uB300\uC0AC: " + bubble.text.substring(0, 15);
            group.x = bubble.position.x * sx;
            group.y = bubble.position.y * sx;
            group.resize(w, h);
            group.fills = [];
            group.layoutMode = "NONE";
            group.clipsContent = style.isConcentration ? true : false;
            var bg;
            if (style.isConcentration) {
              var cColor = style.concentrationColor || "#000000";
              var cPad = style.concentrationPadding || 0;
              var cMargin = style.concentrationOuterMargin || 0;
              var cx = w / 2, cy = h / 2;
              var baseR = 0.22;
              var rFactor = Math.max(0.08, Math.min(0.45, baseR + cPad * 4e-3));
              var innerRx = w * rFactor, innerRy = h * rFactor;
              var outerScale = Math.max(0.2, Math.min(1.5, 1 - cMargin * 0.014));
              var rand = function(i, off) {
                var x = Math.sin(42 + i * 127.1 + off * 311.7) * 43758.5453;
                return x - Math.floor(x);
              };
              var svgLines = "";
              var clusterCount = 35;
              var angle = 0;
              for (var c = 0; c < clusterCount; c++) {
                var gap = Math.PI * 2 / clusterCount * (0.7 + rand(c, 0) * 0.6);
                angle += gap;
                var linesInCluster = 2 + Math.floor(rand(c, 1) * 3);
                var clusterSpread = Math.PI * 2 / clusterCount * 0.5;
                for (var li = 0; li < linesInCluster; li++) {
                  var a = angle + (li - (linesInCluster - 1) / 2) * clusterSpread / linesInCluster;
                  var cosA = Math.cos(a), sinA = Math.sin(a);
                  var startDist = 1 + rand(c * 10 + li, 4) * 0.1;
                  var lsx = cx + cosA * innerRx * startDist;
                  var lsy = cy + sinA * innerRy * startDist;
                  var lenType = rand(c * 10 + li, 5);
                  var lenMult = 0;
                  if (lenType < 0.3)
                    lenMult = 0.12 + rand(c * 10 + li, 6) * 0.1;
                  else if (lenType < 0.7)
                    lenMult = 0.22 + rand(c * 10 + li, 6) * 0.13;
                  else
                    lenMult = 0.35 + rand(c * 10 + li, 6) * 0.15;
                  var maxReachX = (cx - innerRx) * outerScale;
                  var maxReachY = (cy - innerRy) * outerScale;
                  var outerDist = innerRx + maxReachX * lenMult;
                  var outerDistY = innerRy + maxReachY * lenMult;
                  var lex = cx + cosA * outerDist;
                  var ley = cy + sinA * outerDistY;
                  var unit = w / 200;
                  var lsw = (0.3 + rand(c * 10 + li, 7) * 0.9) * unit;
                  svgLines += '<line x1="' + lsx.toFixed(1) + '" y1="' + lsy.toFixed(1) + '" x2="' + lex.toFixed(1) + '" y2="' + ley.toFixed(1) + '" stroke="' + cColor + '" stroke-width="' + lsw.toFixed(2) + '" stroke-linecap="round"/>';
                }
              }
              var concSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + svgLines + "</svg>";
              try {
                var concNode = figma.createNodeFromSvg(concSvg);
                concNode.name = "\uC9D1\uC911\uC120";
                concNode.resize(w, h);
                concNode.x = 0;
                concNode.y = 0;
                bg = concNode;
              } catch (e) {
                console.warn("\uC9D1\uC911\uC120 SVG \uC0DD\uC131 \uC2E4\uD328:", e);
                var concFallback = figma.createRectangle();
                concFallback.name = "\uC9D1\uC911\uC120 \uBC30\uACBD";
                concFallback.resize(w, h);
                concFallback.fills = [];
                bg = concFallback;
              }
            } else if (bubble.svgPath && bubble.svgPath.pathD) {
              var sp = bubble.svgPath;
              var fillC = sp.fillColor || "#ffffff";
              var strokeC = sp.strokeColor || "#333333";
              var strokeW = sp.strokeWidth || 2.5;
              var bodyH = h * 0.78;
              var ellipseBg = figma.createEllipse();
              ellipseBg.name = "\uB9D0\uD48D\uC120 \uBAB8\uCCB4";
              ellipseBg.resize(w, bodyH);
              ellipseBg.x = 0;
              ellipseBg.y = 0;
              ellipseBg.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
              if (strokeC && strokeC !== "none" && strokeC !== "transparent") {
                ellipseBg.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
                ellipseBg.strokeWeight = strokeW;
              }
              group.appendChild(ellipseBg);
              var tailVec = figma.createVector();
              tailVec.name = "\uB9D0\uD48D\uC120 \uAF2C\uB9AC";
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
              if (strokeC && strokeC !== "none" && strokeC !== "transparent") {
                tailVec.strokes = [{ type: "SOLID", color: hexToFigmaColor(strokeC) }];
                tailVec.strokeWeight = strokeW;
              }
              tailVec.x = t1x;
              tailVec.y = bodyH - strokeW;
              tailVec.resize(tailW2, tailH2);
              group.appendChild(tailVec);
              var seamCover = figma.createRectangle();
              seamCover.name = "\uC774\uC74C\uC0C8";
              seamCover.fills = [{ type: "SOLID", color: hexToFigmaColor(fillC) }];
              seamCover.strokes = [];
              seamCover.resize(tailW2 + strokeW * 2, strokeW * 3);
              seamCover.x = t1x - strokeW;
              seamCover.y = bodyH - strokeW * 2;
              group.appendChild(seamCover);
              bg = seamCover;
            } else if (style.isEllipse) {
              var ellipse = figma.createEllipse();
              ellipse.name = "\uB9D0\uD48D\uC120 \uBC30\uACBD";
              ellipse.resize(w, h);
              var bgColor = style.bgColor ? hexToFigmaColor(style.bgColor) : { r: 1, g: 1, b: 1 };
              ellipse.fills = [{ type: "SOLID", color: bgColor }];
              if (style.borderColor && style.borderColor !== "none" && style.borderColor !== "transparent") {
                ellipse.strokes = [{ type: "SOLID", color: hexToFigmaColor(style.borderColor) }];
                ellipse.strokeWeight = style.borderWidth || 2;
              }
              if (style.isDashed) {
                ellipse.dashPattern = [6, 4];
              }
              bg = ellipse;
            } else {
              var rect = figma.createRectangle();
              rect.name = "\uB9D0\uD48D\uC120 \uBC30\uACBD";
              rect.resize(w, h);
              var bgColor2 = style.bgColor ? hexToFigmaColor(style.bgColor) : { r: 1, g: 1, b: 1 };
              rect.cornerRadius = style.radius || Math.min(w, h) * 0.3;
              rect.fills = [{ type: "SOLID", color: bgColor2 }];
              if (style.borderColor && style.borderColor !== "none") {
                rect.strokes = [{ type: "SOLID", color: hexToFigmaColor(style.borderColor) }];
                rect.strokeWeight = style.borderWidth || 2;
              }
              if (style.isDashed) {
                rect.dashPattern = [6, 4];
              }
              bg = rect;
            }
            group.appendChild(bg);
            var textAreaH = bubble.svgPath && bubble.svgPath.pathD ? h * 0.78 : h;
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
          });
        }
        // ---- 나레이션 ----
        /** 나레이션 박스 생성: 반투명 사각형 배경 + 흰색 텍스트 */
        createNarration(parent, bubble) {
          return __async(this, null, function* () {
            const sx = this.config.scaleFactor;
            const group = figma.createFrame();
            group.name = "\uB098\uB808\uC774\uC158: " + bubble.text.substring(0, 15);
            group.x = bubble.position.x * sx;
            group.y = bubble.position.y * sx;
            group.resize(bubble.size.w * sx, bubble.size.h * sx);
            group.fills = [];
            group.layoutMode = "NONE";
            group.clipsContent = false;
            const bg = figma.createRectangle();
            bg.name = "\uB098\uB808\uC774\uC158 \uBC30\uACBD";
            bg.resize(bubble.size.w * sx, bubble.size.h * sx);
            bg.fills = [];
            bg.cornerRadius = 0;
            group.appendChild(bg);
            const fontName = yield this.loadFont(
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
          });
        }
        // ---- SFX (효과음) ----
        /** SFX 텍스트 생성: 굵은 폰트 + 색상 + 회전 + 외곽선 */
        createSFX(parent, bubble) {
          return __async(this, null, function* () {
            var sx = this.config.scaleFactor;
            var requestedFamily = bubble.style.fontFamily || this.config.sfxFont.family;
            var fontName = { family: "Inter", style: "Bold" };
            var fontStyles = ["Regular", "Bold"];
            var loaded = false;
            for (var si = 0; si < fontStyles.length && !loaded; si++) {
              try {
                yield figma.loadFontAsync({ family: requestedFamily, style: fontStyles[si] });
                fontName = { family: requestedFamily, style: fontStyles[si] };
                loaded = true;
                console.log("[SFX] \uD3F0\uD2B8 \uB85C\uB529 \uC131\uACF5:", requestedFamily, fontStyles[si]);
              } catch (e) {
                console.log("[SFX] \uD3F0\uD2B8 \uC2DC\uB3C4 \uC2E4\uD328:", requestedFamily, fontStyles[si]);
              }
            }
            if (!loaded) {
              try {
                yield figma.loadFontAsync({ family: "Inter", style: "Bold" });
                fontName = { family: "Inter", style: "Bold" };
              } catch (e2) {
                try {
                  yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
                  fontName = { family: "Inter", style: "Regular" };
                } catch (e3) {
                  console.warn("[SFX] \uBAA8\uB4E0 \uD3F0\uD2B8 \uB85C\uB529 \uC2E4\uD328");
                }
              }
              console.warn("[SFX] '" + requestedFamily + "' \uC5C6\uC74C, " + fontName.family + " " + fontName.style + " \uC0AC\uC6A9");
            }
            var text = figma.createText();
            text.name = "SFX: " + bubble.text;
            text.fontName = fontName;
            text.characters = bubble.text;
            text.fontSize = bubble.style.fontSize || 32;
            var color = hexToFigmaColor(bubble.style.color || "#ff6b6b");
            text.fills = [{ type: "SOLID", color }];
            text.x = bubble.position.x * sx;
            text.y = bubble.position.y * sx;
            var rotation = bubble.style.rotation || 0;
            if (rotation) {
              text.rotation = rotation;
            }
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
          });
        }
        // ---- 범용: 타입별 분기 ----
        /** 버블 타입에 따라 적절한 노드 생성 */
        createBubbleNode(parent, bubble) {
          return __async(this, null, function* () {
            switch (bubble.type) {
              case "dialogue":
                return this.createDialogue(parent, bubble);
              case "narration":
                return this.createNarration(parent, bubble);
              case "sfx":
                return this.createSFX(parent, bubble);
              default:
                throw new Error(`\uC54C \uC218 \uC5C6\uB294 \uBC84\uBE14 \uD0C0\uC785: ${bubble.type}`);
            }
          });
        }
        // ---- 업데이트 ----
        /** 기존 버블 노드의 텍스트·위치·스타일 업데이트 */
        updateBubbleNode(node, bubble) {
          return __async(this, null, function* () {
            const sx = this.config.scaleFactor;
            node.x = bubble.position.x * sx;
            node.y = bubble.position.y * sx;
            if (bubble.style.rotation !== void 0) {
              node.rotation = bubble.style.rotation;
            }
            let textNode = null;
            if (node.type === "TEXT") {
              textNode = node;
            } else if (node.type === "FRAME") {
              textNode = node.findOne((n) => n.type === "TEXT");
            }
            if (textNode && textNode.characters !== bubble.text) {
              const fontName = yield this.loadFont(
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
          });
        }
      };
    }
  });

  // src/plugin/syncEngine.ts
  var SyncEngine;
  var init_syncEngine = __esm({
    "src/plugin/syncEngine.ts"() {
      "use strict";
      init_nodeFactory();
      init_utils();
      SyncEngine = class {
        constructor(config = {}) {
          __publicField(this, "factory");
          __publicField(this, "mappings", /* @__PURE__ */ new Map());
          __publicField(this, "episodePage", null);
          __publicField(this, "currentEpisodeNum", 0);
          this.factory = new NodeFactory(config);
        }
        /** 응답 메시지를 UI로 전송 */
        respond(msg) {
          figma.ui.postMessage(msg);
        }
        // ---- 초기화 ----
        /** 에피소드 Figma Page 생성 또는 기존 Page 선택 */
        init(projectName, episodeNum) {
          return __async(this, null, function* () {
            if (this.currentEpisodeNum !== episodeNum) {
              this.mappings.clear();
            }
            this.currentEpisodeNum = episodeNum;
            const pageName = `${projectName} - \uC5D0\uD53C\uC18C\uB4DC ${episodeNum}`;
            let existing = figma.root.children.find((p) => p.name === pageName);
            if (existing) {
              this.episodePage = existing;
            } else {
              this.episodePage = figma.createPage();
              this.episodePage.name = pageName;
            }
            figma.currentPage = this.episodePage;
            this.restoreMappings();
            this.respond({
              type: "STATUS",
              connected: true,
              pageCount: this.episodePage.children.length,
              lastSync: Date.now()
            });
          });
        }
        /** 플러그인 데이터에서 기존 매핑 복원 */
        restoreMappings() {
          if (!this.episodePage)
            return;
          const walkNodes = (parent) => {
            for (const child of parent.children) {
              const webAppId = child.getPluginData("webAppId");
              const syncType = child.getPluginData("syncType");
              if (webAppId) {
                this.mappings.set(webAppId, {
                  webAppId,
                  figmaNodeId: child.id,
                  type: syncType,
                  contentHash: child.getPluginData("contentHash") || "",
                  lastSyncAt: parseInt(child.getPluginData("lastSync") || "0")
                });
              }
              if ("children" in child) {
                walkNodes(child);
              }
            }
          };
          walkNodes(this.episodePage);
          console.log(`\uB9E4\uD551 \uBCF5\uC6D0 \uC644\uB8CC: ${this.mappings.size}\uAC1C \uB178\uB4DC`);
        }
        // ---- 페이지 동기화 (전체) ----
        /** 단일 페이지의 모든 요소를 동기화 */
        syncPage(data) {
          return __async(this, null, function* () {
            if (!this.episodePage) {
              this.respond({ type: "SYNC_ERROR", id: `page_${data.pageIndex}`, error: "\uC5D0\uD53C\uC18C\uB4DC \uD398\uC774\uC9C0 \uBBF8\uCD08\uAE30\uD654" });
              return;
            }
            try {
              const frameId = `page_${data.pageIndex}`;
              let frame = this.findExistingNode(frameId);
              if (!frame) {
                frame = yield this.factory.createPageFrame(data.pageIndex, data.pageSize);
                this.episodePage.appendChild(frame);
                this.registerMapping(frameId, frame.id, "page");
              } else if (data.pageSize) {
                frame.resize(data.pageSize.w, data.pageSize.h);
              }
              var imageList = data.images || (data.image ? [data.image] : []);
              for (var imgIdx = 0; imgIdx < imageList.length; imgIdx++) {
                console.log("[SyncEngine] \uC774\uBBF8\uC9C0 \uB3D9\uAE30\uD654 " + (imgIdx + 1) + "/" + imageList.length);
                yield this.syncImage(frame, imageList[imgIdx]);
              }
              const sorted = Array.from(data.bubbles).sort((a, b) => {
                const order = { narration: 0, dialogue: 1, sfx: 2 };
                return order[a.type] - order[b.type];
              });
              for (let i = 0; i < sorted.length; i++) {
                try {
                  yield this.syncBubble(frame, sorted[i]);
                } catch (bubbleErr) {
                  console.error("[SyncEngine] \uBC84\uBE14 \uB3D9\uAE30\uD654 \uC2E4\uD328:", sorted[i].id, sorted[i].type, bubbleErr);
                }
                this.respond({
                  type: "PROGRESS",
                  current: i + 1,
                  total: sorted.length,
                  label: `\uD398\uC774\uC9C0 ${data.pageIndex + 1} \uBC84\uBE14 \uB3D9\uAE30\uD654`
                });
              }
              this.cleanupDeletedBubbles(frame, data.bubbles);
              this.respond({ type: "SYNC_OK", id: frameId, figmaNodeId: frame.id });
            } catch (err) {
              this.respond({
                type: "SYNC_ERROR",
                id: `page_${data.pageIndex}`,
                error: String(err)
              });
            }
          });
        }
        /** 여러 페이지 일괄 동기화 */
        batchSync(pages) {
          return __async(this, null, function* () {
            if (this.episodePage) {
              const newPageIndices = new Set(pages.map((p) => p.pageIndex));
              for (const child of Array.from(this.episodePage.children)) {
                const webAppId = child.getPluginData("webAppId");
                const syncType = child.getPluginData("syncType");
                if (webAppId && webAppId.startsWith("page_")) {
                  const pageIdx = parseInt(webAppId.replace("page_", ""));
                  if (!isNaN(pageIdx) && !newPageIndices.has(pageIdx)) {
                    console.log("[SyncEngine] \uC794\uC5EC \uD504\uB808\uC784 \uC81C\uAC70: " + webAppId);
                    child.remove();
                    this.mappings.delete(webAppId);
                  }
                } else if (webAppId && syncType && syncType !== "page") {
                  console.log("[SyncEngine] \uACE0\uC544 \uB178\uB4DC \uC81C\uAC70: " + webAppId + " (type=" + syncType + ")");
                  child.remove();
                  this.mappings.delete(webAppId);
                }
              }
            }
            for (let i = 0; i < pages.length; i++) {
              this.respond({
                type: "PROGRESS",
                current: i + 1,
                total: pages.length,
                label: `\uC5D0\uD53C\uC18C\uB4DC \uB3D9\uAE30\uD654 \uC911 (${i + 1}/${pages.length} \uD398\uC774\uC9C0)`
              });
              yield this.syncPage(pages[i]);
            }
            this.respond({ type: "BATCH_OK", count: pages.length });
          });
        }
        // ---- 이미지 동기화 ----
        syncImage(frame, imageData) {
          return __async(this, null, function* () {
            var hashSource = (imageData.storageUrl || imageData.base64 || "").substring(0, 200);
            var hash = simpleHash(hashSource);
            console.log("[SyncEngine] syncImage:", imageData.id, "storageUrl:", !!imageData.storageUrl, "base64 len:", (imageData.base64 || "").length);
            var existing = this.findExistingNode(imageData.id);
            if (existing) {
              var oldHash = existing.getPluginData("contentHash");
              if (oldHash !== hash) {
                existing.remove();
                this.mappings.delete(imageData.id);
                var node = yield this.factory.placeImage(frame, imageData);
                node.setPluginData("contentHash", hash);
                this.registerMapping(imageData.id, node.id, "image");
              }
            } else {
              var node2 = yield this.factory.placeImage(frame, imageData);
              node2.setPluginData("contentHash", hash);
              this.registerMapping(imageData.id, node2.id, "image");
            }
          });
        }
        // ---- 버블 동기화 (개별) ----
        syncBubble(frame, bubble) {
          return __async(this, null, function* () {
            var hash = simpleHash(JSON.stringify(bubble));
            var existing = this.findExistingNode(bubble.id);
            if (existing) {
              var oldHash = existing.getPluginData("contentHash");
              if (oldHash !== hash) {
                existing.remove();
                this.mappings.delete(bubble.id);
                var node = yield this.factory.createBubbleNode(frame, bubble);
                node.setPluginData("contentHash", hash);
                this.registerMapping(bubble.id, node.id, bubble.type);
              }
            } else {
              var node2 = yield this.factory.createBubbleNode(frame, bubble);
              node2.setPluginData("contentHash", hash);
              this.registerMapping(bubble.id, node2.id, bubble.type);
            }
          });
        }
        /** 개별 버블 추가 (실시간 동기화) */
        addBubble(bubble) {
          return __async(this, null, function* () {
            const frame = this.findExistingNode(`page_${bubble.pageIndex}`);
            if (!frame) {
              this.respond({ type: "SYNC_ERROR", id: bubble.id, error: `\uD398\uC774\uC9C0 ${bubble.pageIndex} \uD504\uB808\uC784 \uC5C6\uC74C` });
              return;
            }
            const node = yield this.factory.createBubbleNode(frame, bubble);
            node.setPluginData("contentHash", simpleHash(JSON.stringify(bubble)));
            this.registerMapping(bubble.id, node.id, bubble.type);
            this.respond({ type: "SYNC_OK", id: bubble.id, figmaNodeId: node.id });
          });
        }
        /** 개별 버블 업데이트 (실시간 동기화) */
        updateBubble(bubble) {
          return __async(this, null, function* () {
            var existing = this.findExistingNode(bubble.id);
            if (!existing) {
              return this.addBubble(bubble);
            }
            var parentNode = existing.parent;
            var frame = parentNode;
            var correctFrame = this.findExistingNode("page_" + bubble.pageIndex);
            if (correctFrame) {
              frame = correctFrame;
            }
            existing.remove();
            this.mappings.delete(bubble.id);
            var node = yield this.factory.createBubbleNode(frame, bubble);
            node.setPluginData("contentHash", simpleHash(JSON.stringify(bubble)));
            this.registerMapping(bubble.id, node.id, bubble.type);
            this.respond({ type: "SYNC_OK", id: bubble.id, figmaNodeId: node.id });
          });
        }
        /** 개별 버블 삭제 */
        deleteBubble(id) {
          const existing = this.findExistingNode(id);
          if (existing) {
            existing.remove();
            this.mappings.delete(id);
            this.respond({ type: "SYNC_OK", id, figmaNodeId: "" });
          }
        }
        // ---- 정리 ----
        /** Figma에 있지만 웹앱에서 삭제된 버블 노드 제거 */
        cleanupDeletedBubbles(frame, currentBubbles) {
          const currentIds = new Set(currentBubbles.map((b) => b.id));
          for (const child of Array.from(frame.children)) {
            const webAppId = child.getPluginData("webAppId");
            const syncType = child.getPluginData("syncType");
            if (webAppId && syncType !== "page" && syncType !== "image" && !currentIds.has(webAppId)) {
              child.remove();
              this.mappings.delete(webAppId);
            }
          }
        }
        // ---- 유틸 ----
        findExistingNode(webAppId) {
          const mapping = this.mappings.get(webAppId);
          if (mapping) {
            try {
              return figma.getNodeById(mapping.figmaNodeId);
            } catch (e) {
              this.mappings.delete(webAppId);
            }
          }
          if (this.episodePage) {
            return findNodeByWebAppId(this.episodePage, webAppId);
          }
          return null;
        }
        registerMapping(webAppId, figmaNodeId, type) {
          this.mappings.set(webAppId, {
            webAppId,
            figmaNodeId,
            type,
            contentHash: "",
            lastSyncAt: Date.now()
          });
        }
        // ---- 메시지 핸들러 (진입점) ----
        /** episodePage가 없거나 에피소드가 바뀌면 초기화 */
        ensureInit(episodeNum) {
          return __async(this, null, function* () {
            var epNum = episodeNum || 1;
            if (this.episodePage && this.currentEpisodeNum === epNum)
              return;
            if (this.currentEpisodeNum !== epNum) {
              this.mappings.clear();
              console.log("[SyncEngine] \uC5D0\uD53C\uC18C\uB4DC \uBCC0\uACBD: EP " + this.currentEpisodeNum + " \u2192 EP " + epNum);
            }
            this.currentEpisodeNum = epNum;
            var pageName = "Webtoon Sync - EP " + epNum;
            var existing = figma.root.children.find(function(p) {
              return p.name === pageName;
            });
            if (existing) {
              this.episodePage = existing;
            } else {
              this.episodePage = figma.createPage();
              this.episodePage.name = pageName;
            }
            figma.currentPage = this.episodePage;
            this.restoreMappings();
            this.respond({
              type: "STATUS",
              connected: true,
              pageCount: this.episodePage.children.length,
              lastSync: Date.now()
            });
            console.log("[SyncEngine] Auto-initialized: " + pageName);
          });
        }
        /** UI에서 전달받은 메시지를 처리 */
        handleMessage(msg) {
          return __async(this, null, function* () {
            switch (msg.type) {
              case "INIT":
                yield this.init(msg.payload.projectName, msg.payload.episodeNum);
                break;
              case "SYNC_PAGE":
                yield this.ensureInit(msg.payload.episodeNum);
                yield this.syncPage(msg.payload);
                break;
              case "BATCH_SYNC":
                var firstEp = Array.isArray(msg.payload) && msg.payload.length > 0 ? msg.payload[0].episodeNum : 1;
                yield this.ensureInit(firstEp);
                yield this.batchSync(msg.payload);
                break;
              case "ADD_BUBBLE":
                yield this.ensureInit(msg.payload.pageIndex !== void 0 ? 1 : 1);
                yield this.addBubble(msg.payload);
                break;
              case "UPDATE_BUBBLE":
                yield this.ensureInit();
                yield this.updateBubble(msg.payload);
                break;
              case "DELETE_BUBBLE":
                this.deleteBubble(msg.payload.id);
                break;
              case "UPDATE_IMAGE":
                yield this.ensureInit();
                if (this.episodePage) {
                  const frame = this.findExistingNode("page_" + msg.payload.pageIndex);
                  if (frame)
                    yield this.syncImage(frame, msg.payload);
                }
                break;
              case "PING":
                this.respond({ type: "PONG" });
                break;
            }
          });
        }
      };
    }
  });

  // ../shared/constants/svgBalloons.ts
  var init_svgBalloons = __esm({
    "../shared/constants/svgBalloons.ts"() {
      "use strict";
    }
  });

  // ../shared/constants/bubbleTypes.ts
  var init_bubbleTypes = __esm({
    "../shared/constants/bubbleTypes.ts"() {
      "use strict";
    }
  });

  // ../shared/constants/sfxPresets.ts
  var SFX_PRESETS, SFX_CATEGORIES;
  var init_sfxPresets = __esm({
    "../shared/constants/sfxPresets.ts"() {
      "use strict";
      SFX_PRESETS = {
        impact: {
          name: "\uD0C0\uACA9",
          examples: ["\uCF85!", "\uD37D!", "\uBE60\uC9C1!", "\uC640\uC7A5\uCC3D!", "\uD0C1!", "\uCFF5!"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 3,
          skew: 0,
          rotate: -5,
          filterType: "outline",
          scale: 1.2
        },
        water: {
          name: "\uBB3C/\uBC14\uB78C",
          examples: ["\uCF78\uCF78", "\uC1A8\uC544", "\uD718\uC774\uC789", "\uC3F4\uC544", "\uD30C\uB2E5"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 2.5,
          skew: -8,
          rotate: -3,
          filterType: "outline",
          scale: 1
        },
        electric: {
          name: "\uC804\uAE30/\uBE5B",
          examples: ["\uCC0C\uC9C1!", "\uBC88\uCA4D!", "\uD30C\uC9C0\uC9C1!", "\uCE58\uC9C0\uC9C1", "\uC2A4\uD30C\uD06C!"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 3,
          skew: -14,
          rotate: 0,
          filterType: "glow",
          scale: 1.1
        },
        speed: {
          name: "\uC774\uB3D9/\uC18D\uB3C4",
          examples: ["\uC288\uC6B0\uC6C5", "\uD719!", "\uBD80\uB989!", "\uBE44\uC774\uC789", "\uC4E9!"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 2.5,
          skew: -20,
          rotate: 0,
          filterType: "motion",
          scale: 1
        },
        rumble: {
          name: "\uC9C4\uB3D9/\uC6B8\uB9BC",
          examples: ["\uC6B0\uC6B0\uC6C5", "\uB4DC\uB974\uB974", "\uC640\uB974\uB974", "\uB35C\uB35C\uB35C", "\uBD80\uB974\uB974", "\uCFF5"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 3,
          skew: -3,
          rotate: -2,
          filterType: "outline",
          scale: 1
        },
        emotion: {
          name: "\uAC10\uC815/\uC2EC\uB9AC",
          examples: ["\uB450\uADFC\uB450\uADFC", "\uC6B8\uCEE5", "\uC2EC\uCFF5", "\uC73C\uC73C", "\uD6C4\uC720"],
          fontFamily: "'Nanum Pen Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 2,
          skew: 0,
          rotate: 0,
          filterType: "outline",
          scale: 1
        },
        silence: {
          name: "\uC815\uC801/\uBD84\uC704\uAE30",
          examples: ["...", "\uC26C\uC787", "\uC870\uC6A9", "\uC2F8\uB298", "\uC11C\uB298"],
          fontFamily: "'Nanum Pen Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 1.5,
          skew: 0,
          rotate: 0,
          filterType: "outline",
          scale: 0.9
        },
        comic: {
          name: "\uCF54\uBBF9",
          examples: ["\uBFC5!", "\uBF55!", "\uC090\uC6A9", "\uBFCC\uC6B0", "\uD5C9!"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 3,
          skew: -6,
          rotate: -4,
          filterType: "outline",
          scale: 1.1
        },
        nature: {
          name: "\uC790\uC5F0/\uD658\uACBD",
          examples: ["\uC6B0\uB974\uB974", "\uBC88\uAC1C!", "\uCD94\uC801\uCD94\uC801", "\uC0AC\uAC01\uC0AC\uAC01", "\uBC14\uC2A4\uB77D"],
          fontFamily: "'Nanum Brush Script',cursive",
          color: "#000000",
          stroke: "#ffffff",
          strokeWidth: 2,
          skew: 2,
          rotate: 0,
          filterType: "outline",
          scale: 1
        }
      };
      SFX_CATEGORIES = Object.keys(SFX_PRESETS);
    }
  });

  // ../shared/constants/fonts.ts
  var FONT_LIST_KR, FONT_LIST_JP, FONT_LIST;
  var init_fonts = __esm({
    "../shared/constants/fonts.ts"() {
      "use strict";
      FONT_LIST_KR = [
        { value: "'Noto Sans KR',sans-serif", label: "\uAE30\uBCF8 (Noto Sans)" },
        { value: "'Gothic A1',sans-serif", label: "\uACE0\uB515" },
        { value: "'Nanum Myeongjo',serif", label: "\uB098\uB214\uBA85\uC870" },
        { value: "'Nanum Gothic',sans-serif", label: "\uB098\uB214\uACE0\uB515" },
        { value: "'Black Han Sans',sans-serif", label: "\uBE14\uB799\uD55C\uC0B0\uC2A4" },
        { value: "'Jua',sans-serif", label: "\uC8FC\uC544" },
        { value: "'Do Hyeon',sans-serif", label: "\uB3C4\uD604" },
        { value: "'Gaegu',cursive", label: "\uAC1C\uAD6C" },
        { value: "'Nanum Brush Script',cursive", label: "\uB098\uB214\uBD93\uCCB4" },
        { value: "'Nanum Pen Script',cursive", label: "\uB098\uB214\uD39C\uCCB4" },
        { value: "monospace", label: "\uBAA8\uB178\uC2A4\uD398\uC774\uC2A4" }
      ];
      FONT_LIST_JP = [
        { value: "'Noto Sans JP',sans-serif", label: "\u{1F1EF}\u{1F1F5} \uAE30\uBCF8 (Noto Sans JP)" },
        { value: "'Noto Serif JP',serif", label: "\u{1F1EF}\u{1F1F5} \uBA85\uC870 (Noto Serif JP)" },
        { value: "'Shippori Mincho',serif", label: "\u{1F1EF}\u{1F1F5} \uC2DC\uD3EC\uB9AC \uBA85\uC870 (\uB098\uB808\uC774\uC158\uC6A9)" },
        { value: "'Shippori Antique',sans-serif", label: "\u{1F1EF}\u{1F1F5} \uC2DC\uD3EC\uB9AC \uC548\uD2F1 (\uB9CC\uD654\uD48D)" },
        { value: "'Mochiy Pop One',sans-serif", label: "\u{1F1EF}\u{1F1F5} \uBAA8\uCC0C\uD31D (\uD6A8\uACFC\uC74C/\uAC15\uC870)" },
        { value: "'Mochiy Pop P One',sans-serif", label: "\u{1F1EF}\u{1F1F5} \uBAA8\uCC0C\uD31DP (\uD6A8\uACFC\uC74C/\uAC15\uC870)" }
      ];
      FONT_LIST = [].concat(FONT_LIST_KR, FONT_LIST_JP);
    }
  });

  // ../shared/constants/layout.ts
  var DEFAULT_STRIP_WIDTH, DEFAULT_GUTTER, SCENE_GAP_MULTIPLIER;
  var init_layout = __esm({
    "../shared/constants/layout.ts"() {
      "use strict";
      DEFAULT_STRIP_WIDTH = 800;
      DEFAULT_GUTTER = 20;
      SCENE_GAP_MULTIPLIER = 3;
    }
  });

  // ../shared/types/reference.ts
  var init_reference = __esm({
    "../shared/types/reference.ts"() {
      "use strict";
    }
  });

  // ../shared/constants/index.ts
  var init_constants = __esm({
    "../shared/constants/index.ts"() {
      init_svgBalloons();
      init_bubbleTypes();
      init_sfxPresets();
      init_fonts();
      init_layout();
      init_figmaExport();
      init_reference();
    }
  });

  // src/plugin/sceneBuilder.ts
  var SceneBuilder;
  var init_sceneBuilder = __esm({
    "src/plugin/sceneBuilder.ts"() {
      "use strict";
      init_constants();
      SceneBuilder = class {
        constructor(stripWidth = DEFAULT_STRIP_WIDTH, gutter = DEFAULT_GUTTER) {
          __publicField(this, "stripWidth");
          __publicField(this, "gutter");
          this.stripWidth = stripWidth;
          this.gutter = gutter;
        }
        /** 에피소드 매니페스트 → Figma 페이지 생성 */
        buildEpisodePage(manifest) {
          return __async(this, null, function* () {
            var _a;
            const page = figma.createPage();
            page.name = `EP${manifest.episodeNumber} - ${manifest.title}`;
            let yOffset = 0;
            const scenes = this.groupByScene(manifest.panels, manifest.sceneBreaks);
            for (const scene of scenes) {
              const sceneFrame = figma.createFrame();
              sceneFrame.name = `Scene ${scene.index}`;
              sceneFrame.layoutMode = "VERTICAL";
              sceneFrame.itemSpacing = this.gutter;
              sceneFrame.resize(this.stripWidth, 100);
              sceneFrame.y = yOffset;
              for (const panel of scene.panels) {
                yield this.createPanelFrame(sceneFrame, panel);
                figma.ui.postMessage({
                  type: "PROGRESS",
                  current: panel.index + 1,
                  total: manifest.panels.length,
                  label: `\uD328\uB110 ${panel.index + 1}/${manifest.panels.length} \uC784\uD3EC\uD2B8 \uC911`
                });
              }
              page.appendChild(sceneFrame);
              yOffset += sceneFrame.height + this.gutter * SCENE_GAP_MULTIPLIER;
            }
            if ((_a = manifest.dialogueHints) == null ? void 0 : _a.length) {
              yield this.placeDialogueHints(page, manifest);
            }
            figma.currentPage = page;
            figma.viewport.scrollAndZoomIntoView(page.children);
          });
        }
        /** 패널 프레임 생성 + 이미지 배치 */
        createPanelFrame(parent, panel) {
          return __async(this, null, function* () {
            const panelFrame = figma.createFrame();
            panelFrame.name = `Panel ${panel.index}`;
            const aspectRatio = panel.height / panel.width;
            panelFrame.resize(this.stripWidth, this.stripWidth * aspectRatio);
            try {
              const imageData = yield figma.createImageAsync(panel.imageUrl);
              const rect = figma.createRectangle();
              rect.fills = [{ type: "IMAGE", imageHash: imageData.hash, scaleMode: "FILL" }];
              rect.resize(panelFrame.width, panelFrame.height);
              panelFrame.appendChild(rect);
            } catch (err) {
              const placeholder = figma.createRectangle();
              placeholder.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
              placeholder.resize(panelFrame.width, panelFrame.height);
              panelFrame.appendChild(placeholder);
              console.warn(`Panel ${panel.index} \uC774\uBBF8\uC9C0 \uB85C\uB4DC \uC2E4\uD328:`, err);
            }
            parent.appendChild(panelFrame);
          });
        }
        /** 대사 힌트를 텍스트 레이어로 배치 */
        placeDialogueHints(page, manifest) {
          return __async(this, null, function* () {
            const panelFrameMap = /* @__PURE__ */ new Map();
            for (const scene of page.children) {
              if (scene.type !== "FRAME")
                continue;
              const sceneFrame = scene;
              for (const panel of sceneFrame.children) {
                if (panel.type !== "FRAME")
                  continue;
                const panelFrame = panel;
                const panelIndex = parseInt(panelFrame.name.replace("Panel ", "")) || 0;
                panelFrameMap.set(panelIndex, panelFrame);
              }
            }
            for (const hint of manifest.dialogueHints) {
              const panelFrame = panelFrameMap.get(hint.panelIndex);
              if (!panelFrame)
                continue;
              const textNode = figma.createText();
              textNode.name = `Dialogue Hint: ${hint.character}`;
              textNode.characters = `[${hint.character}] ${hint.text}`;
              textNode.fontSize = 12;
              textNode.fontFamily = "Inter";
              yield figma.loadFontAsync(textNode.fontFamily, textNode.fontStyle);
              const panelHeight = panelFrame.height;
              textNode.y = panelHeight + this.gutter / 2;
              textNode.x = 0;
              textNode.textAutoResize = "HEIGHT";
              panelFrame.appendChild(textNode);
            }
          });
        }
        /** 패널을 씬 브레이크 기준으로 그룹화 */
        groupByScene(panels, sceneBreaks) {
          const breaks = new Set(sceneBreaks);
          const groups = [];
          let current = [];
          let sceneIdx = 0;
          for (const panel of panels) {
            if (breaks.has(panel.index) && current.length > 0) {
              groups.push({ index: sceneIdx++, panels: current });
              current = [];
            }
            current.push(panel);
          }
          if (current.length > 0) {
            groups.push({ index: sceneIdx, panels: current });
          }
          return groups;
        }
      };
    }
  });

  // src/plugin/exporter.ts
  var Exporter;
  var init_exporter = __esm({
    "src/plugin/exporter.ts"() {
      "use strict";
      Exporter = class {
        /** 현재 페이지의 씬 프레임들을 PNG로 내보내기 */
        exportAsImages(scale = 2) {
          return __async(this, null, function* () {
            const page = figma.currentPage;
            const sceneFrames = page.children.filter(
              (n) => n.type === "FRAME" && n.name.startsWith("Scene")
            );
            const images = [];
            for (let i = 0; i < sceneFrames.length; i++) {
              figma.ui.postMessage({
                type: "PROGRESS",
                current: i + 1,
                total: sceneFrames.length,
                label: `\uD504\uB808\uC784 ${i + 1}/${sceneFrames.length} \uB0B4\uBCF4\uB0B4\uAE30 \uC911`
              });
              const bytes = yield sceneFrames[i].exportAsync({
                format: "PNG",
                constraint: { type: "SCALE", value: scale }
              });
              images.push(bytes);
            }
            return images;
          });
        }
        /** 버블 데이터 추출 (텍스트 + 위치) */
        extractBubbleData() {
          const page = figma.currentPage;
          const result = [];
          for (const scene of page.children) {
            if (scene.type !== "FRAME")
              continue;
            for (const panel of scene.children) {
              if (panel.type !== "FRAME")
                continue;
              const panelIndex = parseInt(panel.name.replace("Panel ", "")) || 0;
              const bubbles = [];
              const textNodes = panel.findAll((n) => n.type === "TEXT");
              for (const tn of textNodes) {
                bubbles.push({
                  type: tn.name.includes("Dialogue") ? "dialogue" : "sfx",
                  text: tn.characters,
                  position: { x: tn.x, y: tn.y }
                });
              }
              if (bubbles.length > 0) {
                result.push({ panelIndex, bubbles });
              }
            }
          }
          return result;
        }
        /** 전체 내보내기 + 동기화 데이터 구성 */
        exportAndSync() {
          return __async(this, null, function* () {
            figma.ui.postMessage({
              type: "PROGRESS",
              current: 0,
              total: 3,
              label: "PNG \uC774\uBBF8\uC9C0\uB85C \uB0B4\uBCF4\uB0B4\uAE30 \uC911..."
            });
            const images = yield this.exportAsImages();
            figma.ui.postMessage({
              type: "PROGRESS",
              current: 1,
              total: 3,
              label: "\uBC84\uBE14 \uB370\uC774\uD130 \uCD94\uCD9C \uC911..."
            });
            const bubbleData = this.extractBubbleData();
            figma.ui.postMessage({
              type: "PROGRESS",
              current: 2,
              total: 3,
              label: "\uB3D9\uAE30\uD654 \uB370\uC774\uD130 \uAD6C\uC131 \uC911..."
            });
            const composedPages = images.map((imageBytes, i) => {
              const binaryString = Array.from(imageBytes).map(function(b) {
                return String.fromCharCode(b);
              }).join("");
              const base64Data = btoa(binaryString);
              const sceneFrame = figma.currentPage.children[i];
              const height = (sceneFrame == null ? void 0 : sceneFrame.type) === "FRAME" ? sceneFrame.height : 0;
              return {
                storageUrl: "",
                // UI에서 Firebase 업로드 후 채워짐
                pageIndex: i,
                width: 800,
                height: Math.round(height)
              };
            });
            figma.ui.postMessage({
              type: "EXPORT_IMAGES_FOR_UPLOAD",
              images: images.map((bytes, i) => ({
                pageIndex: i,
                base64: "data:image/png;base64," + Array.from(bytes).map((b) => String.fromCharCode(b)).join("")
              }))
            });
            figma.ui.postMessage({
              type: "PROGRESS",
              current: 3,
              total: 3,
              label: "\uB0B4\uBCF4\uB0B4\uAE30 \uC644\uB8CC!"
            });
            return {
              composedPages,
              bubbleData,
              completedAt: Date.now()
            };
          });
        }
      };
    }
  });

  // src/plugin/controller.ts
  var require_controller = __commonJS({
    "src/plugin/controller.ts"(exports) {
      init_syncEngine();
      init_sceneBuilder();
      init_exporter();
      var engine = new SyncEngine();
      var sceneBuilder = new SceneBuilder();
      var exporter = new Exporter();
      figma.showUI(__html__, {
        width: 360,
        height: 520,
        themeColors: true,
        title: "Webtoon Studio"
      });
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        if (msg.type === "SAVE_CONFIG") {
          yield figma.clientStorage.setAsync("fb_config", msg.config);
          yield figma.clientStorage.setAsync("project_id", msg.projectId);
          return;
        }
        if (msg.type === "RESTORE_CONFIG") {
          const config = yield figma.clientStorage.getAsync("fb_config");
          const projectId = yield figma.clientStorage.getAsync("project_id");
          figma.ui.postMessage({ type: "RESTORED_CONFIG", config: config || "", projectId: projectId || "" });
          return;
        }
        try {
          const message = msg;
          if (message.type === "IMPORT_EPISODE") {
            yield sceneBuilder.buildEpisodePage(message.payload);
            figma.ui.postMessage({ type: "IMPORT_OK", panelCount: message.payload.panels.length });
            return;
          }
          if (message.type === "EXPORT_SYNC") {
            const { episodeId } = message.payload;
            figma.ui.postMessage({ type: "PROGRESS", current: 0, total: 1, label: "\uB0B4\uBCF4\uB0B4\uAE30 \uC2DC\uC791..." });
            const syncBack = yield exporter.exportAndSync();
            figma.ui.postMessage({
              type: "EXPORT_OK",
              syncBack
            });
            figma.notify("\uB0B4\uBCF4\uB0B4\uAE30 \uC644\uB8CC \u2014 \uB3D9\uAE30\uD654 \uB300\uAE30 \uC911...");
            return;
          }
          yield engine.handleMessage(message);
        } catch (err) {
          figma.ui.postMessage({
            type: "SYNC_ERROR",
            id: "unknown",
            error: `\uCC98\uB9AC \uC2E4\uD328: ${String(err)}`
          });
          figma.notify(`\uB3D9\uAE30\uD654 \uC624\uB958: ${String(err)}`, { error: true });
        }
      });
      figma.on("close", () => {
        console.log("Webtoon Studio \uD50C\uB7EC\uADF8\uC778 \uC885\uB8CC");
      });
      figma.notify("Webtoon Studio \uC5F0\uACB0 \uB300\uAE30 \uC911...");
    }
  });
  require_controller();
})();
