// ============================================================
// Figma Sync 서비스 — 디바운스 동기화 + 일괄 전송
// index.html L5050–5121에서 추출
// ============================================================

import type { BubbleData, ImageData, PageData } from "@webtoon/shared";
import { PAGE_W } from "@webtoon/shared";
import { mapObjectToFigma, type EditorObject } from "./mapObjectToFigma";

// ─── 타입 ────────────────────────────────────────────────────

export type SyncAction = "create" | "update" | "delete";

interface SyncEvent {
  type: string;
  payload: any;
}

interface FigmaSendFn {
  (msg: SyncEvent): void;
}

// ─── Sync 서비스 클래스 ──────────────────────────────────────

export class FigmaSyncService {
  private queue: SyncEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private figmaSend: FigmaSendFn;
  private debounceMs: number;

  constructor(figmaSend: FigmaSendFn, debounceMs = 500) {
    this.figmaSend = figmaSend;
    this.debounceMs = debounceMs;
  }

  /** 개별 오브젝트 변경 시 디바운스 동기화 (index.html L5050–5068) */
  queueSync(action: SyncAction, obj: EditorObject, pageIndex: number): void {
    const mapped = mapObjectToFigma(obj, pageIndex);
    if (!mapped) return;

    const msgType =
      "bounds" in mapped
        ? "UPDATE_IMAGE"
        : action === "create"
        ? "ADD_BUBBLE"
        : action === "delete"
        ? "DELETE_BUBBLE"
        : "UPDATE_BUBBLE";

    const event: SyncEvent = {
      type: msgType,
      payload:
        action === "delete"
          ? { id: mapped.id, pageIndex }
          : mapped,
    };

    // 같은 ID 업데이트면 덮어쓰기
    const idx = this.queue.findIndex((e) => e.payload?.id === mapped.id);
    if (idx >= 0) this.queue[idx] = event;
    else this.queue.push(event);

    // 디바운스
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const batch = [...this.queue];
      this.queue = [];
      batch.forEach((e) => this.figmaSend(e));
    }, this.debounceMs);
  }

  /** 전체 에피소드 일괄 전송 (index.html L5096–5107) */
  syncFullEpisode(
    editorPages: Array<{ objects: EditorObject[] }>,
    currentEpisode: number
  ): void {
    const pages = editorPages.map((page, pi) => {
      const bubbles = (page.objects || [])
        .filter((o) => o.type === "bubble" || o.type === "sfx")
        .map((o) => mapObjectToFigma(o, pi))
        .filter(Boolean) as BubbleData[];

      const images = getPageImages(page.objects, pi);
      const pageSize = getPageContentSize(page.objects);

      return {
        pageIndex: pi,
        episodeNum: currentEpisode || 1,
        images,
        bubbles,
        pageSize,
      };
    });
    this.figmaSend({ type: "BATCH_SYNC", payload: pages });
  }

  /** 현재 페이지만 전송 (index.html L5110–5121) */
  syncCurrentPage(
    page: { objects: EditorObject[] },
    pageIndex: number,
    currentEpisode: number
  ): void {
    const bubbles = (page.objects || [])
      .filter((o) => o.type === "bubble" || o.type === "sfx")
      .map((o) => mapObjectToFigma(o, pageIndex))
      .filter(Boolean) as BubbleData[];

    const images = getPageImages(page.objects, pageIndex);
    const pageSize = getPageContentSize(page.objects);

    this.figmaSend({
      type: "SYNC_PAGE",
      payload: {
        pageIndex,
        episodeNum: currentEpisode || 1,
        images,
        bubbles,
        pageSize,
      },
    });
  }

  /** 큐 비우기 */
  flush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const batch = [...this.queue];
    this.queue = [];
    batch.forEach((e) => this.figmaSend(e));
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.queue = [];
  }
}

// ─── 헬퍼 함수 ──────────────────────────────────────────────

/** 페이지의 실제 컨텐츠 크기 계산 (index.html L5071–5082) */
function getPageContentSize(objects: EditorObject[]): { w: number; h: number } {
  if (!objects || objects.length === 0) return { w: PAGE_W, h: 1200 };
  let maxX = PAGE_W;
  let maxY = 0;
  for (const o of objects) {
    const right = (o.x || 0) + (o.w || 0);
    const bottom = (o.y || 0) + (o.h || 0);
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  return { w: Math.max(PAGE_W, maxX), h: Math.max(400, maxY + 50) };
}

/** 페이지의 이미지 목록을 Figma 형식으로 변환 (index.html L5085–5093) */
function getPageImages(objects: EditorObject[], pageIndex: number): ImageData[] {
  return (objects || [])
    .filter((o) => (o.type === "panel" || o.type === "image") && o.src && !o.hidden)
    .map((img) => ({
      id: img.id,
      pageIndex,
      base64: img.src || "",
      bounds: {
        x: img.x || 0,
        y: img.y || 0,
        w: img.w || 800,
        h: img.h || 600,
      },
    }));
}
