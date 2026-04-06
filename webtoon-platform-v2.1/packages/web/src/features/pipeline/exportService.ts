// ============================================================
// 페이지 내보내기 서비스 — JPG 분할 내보내기
// index.html L6099–6218에서 추출
// ============================================================

import { PAGE_W, PAGE_H } from "@webtoon/shared";
import { drawBubbleOnCanvas, drawSfxOnCanvas } from "./canvasRenderer";
import type { EditorObject } from "../figma-bridge/mapObjectToFigma";

// ─── 이미지 프리로딩 ─────────────────────────────────────────
// index.html L6099–6147

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function preloadEditorImages(
  objects: EditorObject[],
  panels: string[] = [],
  proxyEndpoint = "/api/proxy-image",
  onProgress?: (loaded: number, total: number) => void
): Promise<Record<string, HTMLImageElement>> {
  const cache: Record<string, HTMLImageElement> = {};
  const imageObjs = objects.filter(
    (o) => (o.type === "panel" || o.type === "image") && o.src && !cache[o.src]
  );
  const uniqueSrcs = [...new Set(imageObjs.map((o) => o.src!))];

  // panelIndex → src lookup for [img:] fallback
  const panelIdxMap: Record<string, number> = {};
  for (const o of imageObjs) {
    if (o.panelIndex !== undefined && o.src) panelIdxMap[o.src] = o.panelIndex;
  }

  const total = uniqueSrcs.length;
  let loaded = 0;

  const BATCH = 5;
  for (let i = 0; i < uniqueSrcs.length; i += BATCH) {
    const batch = uniqueSrcs.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (src) => {
        let imgSrc = src;

        // [img:] token fallback
        if (imgSrc.startsWith("[img:")) {
          const pi = panelIdxMap[src];
          const restored = pi !== undefined && panels[pi] ? panels[pi] : null;
          if (restored && !restored.startsWith("[img:")) {
            imgSrc = restored;
          } else {
            loaded++;
            return;
          }
        }

        // External URL → proxy
        if (imgSrc.startsWith("http") && !imgSrc.startsWith("data:")) {
          try {
            const proxyResp = await fetch(
              `${proxyEndpoint}?url=${encodeURIComponent(imgSrc)}`
            );
            const proxyData = await proxyResp.json();
            if (proxyData.dataUri) imgSrc = proxyData.dataUri;
          } catch (e) {
            console.warn("Proxy failed:", src.substring(0, 60));
          }
        }

        try {
          cache[src] = await loadImage(imgSrc);
        } catch {
          console.warn("Image load failed:", src.substring(0, 60));
        }
        loaded++;
      })
    );
    onProgress?.(Math.min(loaded, total), total);
  }
  return cache;
}

// ─── JPG 내보내기 (720 × 4000 분할) ─────────────────────────
// index.html L6151–6218

export interface ExportPage {
  objects: EditorObject[];
}

export async function exportAllPagesAsJpeg(
  editorPages: ExportPage[],
  panels: string[] = [],
  onProgress?: (msg: string) => void
): Promise<string[]> {
  if (editorPages.length === 0) return [];
  const page = editorPages[0];

  // Calculate content height
  let contentH = 0;
  for (const obj of page.objects) {
    if (obj.hidden) continue;
    const bottom = (obj.y || 0) + (obj.h || 0);
    if (bottom > contentH) contentH = bottom;
  }
  contentH = Math.max(contentH + 20, 100);

  const sorted = [...page.objects]
    .filter((o) => !o.hidden)
    .sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1));
  const totalPages = Math.ceil(contentH / PAGE_H);

  onProgress?.(`이미지 로딩 중... (${sorted.filter((o) => o.type === "panel" || o.type === "image").length}개)`);
  const imgCache = await preloadEditorImages(sorted, panels);

  const results: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    const startY = p * PAGE_H;
    const sliceH = Math.min(PAGE_H, contentH - startY);
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = sliceH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, PAGE_W, sliceH);

    for (const obj of sorted) {
      const objTop = obj.y || 0;
      const objBottom = objTop + (obj.h || 0);
      if (objBottom <= startY || objTop >= startY + sliceH) continue;

      const drawY = objTop - startY;
      if (obj.type === "panel" || obj.type === "image") {
        const img = obj.src ? imgCache[obj.src] : undefined;
        if (img) {
          if (obj.crop && obj.crop.w > 0 && obj.crop.h > 0) {
            const sx = (img.naturalWidth * obj.crop.x) / 100;
            const sy = (img.naturalHeight * obj.crop.y) / 100;
            const sw = (img.naturalWidth * obj.crop.w) / 100;
            const sh = (img.naturalHeight * obj.crop.h) / 100;
            ctx.drawImage(img, sx, sy, sw, sh, obj.x || 0, drawY, obj.w || 800, obj.h || 600);
          } else {
            ctx.drawImage(img, obj.x || 0, drawY, obj.w || 800, obj.h || 600);
          }
        }
      } else if (obj.type === "bubble") {
        drawBubbleOnCanvas(ctx, obj, obj.x || 0, drawY, obj.w || 200, obj.h || 100, 1);
      } else if (obj.type === "sfx") {
        drawSfxOnCanvas(ctx, obj, obj.x || 0, drawY, 1);
      }
    }
    results.push(canvas.toDataURL("image/jpeg", 0.95));
  }
  return results;
}

export async function exportPageAsJpeg(
  editorPages: ExportPage[],
  pageIdx: number,
  panels: string[] = []
): Promise<string | null> {
  const all = await exportAllPagesAsJpeg(editorPages, panels);
  return all[pageIdx] || all[0] || null;
}
