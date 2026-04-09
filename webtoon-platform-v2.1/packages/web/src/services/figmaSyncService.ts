// ============================================================
// Figma Sync Service (v2.1)
// V1 Firestore-based 동기화 패턴 포팅
// webtoon_projects/{projectId}/figma_sync/queue ← 웹앱 쓰기
// webtoon_projects/{projectId}/figma_sync/status ← 플러그인 쓰기
// ============================================================

import type {
  EpisodeManifest,
  ManifestPanel,
  DialogueHint,
  PageData,
  ImageData,
  BubbleData,
} from "@webtoon/shared/types";

// ─── 타입 정의 ──────────────────────────────────────────────

export interface FigmaSyncStatus {
  connected: boolean;
  lastSyncAt: number;
  message?: string;
  progress?: { current: number; total: number; label: string };
}

export interface FigmaSyncQueueItem {
  type: "BATCH_SYNC" | "IMPORT_EPISODE" | "SYNC_PAGE";
  payload: any;
  createdAt: number;
  status: "pending" | "processing" | "done" | "error";
}

// ─── Firestore 큐 쓰기 (V1 figmaSend 포팅) ─────────────────

/**
 * Figma 플러그인에 데이터를 전송합니다.
 * Firestore figma_sync/queue 문서에 쓰기 → 플러그인이 onSnapshot으로 수신
 */
export async function figmaSend(
  projectId: string,
  type: string,
  payload: any
): Promise<void> {
  const { collection, doc, setDoc } = await import("firebase/firestore");
  const { getDb } = await import("@/services/firebase");
  const { ensureFirebaseReady } = await import("@/services");
  await ensureFirebaseReady();
  const db = getDb();

  const projectRef = doc(collection(db, "webtoon_projects"), projectId);
  const queueRef = doc(collection(projectRef, "figma_sync"), "queue");

  await setDoc(queueRef, {
    type,
    payload,
    createdAt: Date.now(),
    sentAt: Date.now(),
    messageId: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
  });

  console.log(`[FigmaSync] Queue written: ${type} → project ${projectId}`);
}

// ─── BATCH_SYNC 전송 (V1 figmaSyncFullEpisode 포팅) ────────

/**
 * 에피소드의 전체 패널을 Figma로 일괄 전송합니다.
 * V1의 figmaSyncFullEpisode + processPayloadForFirestore 역할
 */
export async function figmaSyncFullEpisode(
  projectId: string,
  episodeId: string,
  episodeNumber: number,
  title: string,
  panels: Array<{
    index: number;
    imageUrl: string;
    width: number;
    height: number;
    prompt?: string;
  }>,
  dialogueHints: DialogueHint[],
  sceneBreaks: number[]
): Promise<void> {
  // EpisodeManifest 구성
  const manifest: EpisodeManifest = {
    projectId,
    episodeId,
    episodeNumber,
    title,
    panels: panels.map(p => ({
      index: p.index,
      imageUrl: p.imageUrl,
      width: p.width,
      height: p.height,
      prompt: p.prompt,
    })),
    dialogueHints,
    sceneBreaks,
  };

  // IMPORT_EPISODE 메시지로 전송 (V2.1 플러그인의 sceneBuilder가 처리)
  await figmaSend(projectId, "IMPORT_EPISODE", manifest);

  // Figma export 메타데이터 저장
  const { saveFigmaExport } = await import("@/services/firebase");
  await saveFigmaExport(projectId, episodeId, {
    status: "pending",
    exportedAt: Date.now(),
    manifest,
  });

  console.log(`[FigmaSync] Full episode synced: ${panels.length} panels, ${dialogueHints.length} dialogues`);
}

// ─── BATCH_SYNC (V1 호환 — PageData[] 기반) ────────────────

/**
 * V1 호환 BATCH_SYNC: PageData[] 형태로 전송
 * 패널 이미지 + 대사 말풍선을 페이지별로 구성
 */
export async function figmaBatchSync(
  projectId: string,
  pages: PageData[]
): Promise<void> {
  await figmaSend(projectId, "BATCH_SYNC", pages);
  console.log(`[FigmaSync] Batch sync: ${pages.length} pages`);
}

// ─── 패널 데이터 → PageData 변환 유틸 ──────────────────────

const DEFAULT_STRIP_WIDTH = 720;
const DEFAULT_PANEL_HEIGHT = 960; // 720 * 4/3
const PANEL_GAP = 200; // 패널 사이 간격

// ── 말풍선 SVG Path 생성 (video-prompt-engine 호환) ──
function makeSpeechBubbleSvgPath(w: number, h: number, tailSide: "left" | "right" = "left") {
  // 둥근 사각형 + 꼬리(tail) 말풍선
  const r = Math.min(w, h) * 0.25; // 모서리 반경
  const bodyH = h * 0.82; // 본체 높이 (꼬리 공간 확보)
  const tailW = w * 0.12;
  const tailH = h - bodyH;
  const tailX = tailSide === "left" ? w * 0.2 : w * 0.65;

  const pathD = [
    `M ${r} 0`,
    `H ${w - r}`,
    `Q ${w} 0 ${w} ${r}`,
    `V ${bodyH - r}`,
    `Q ${w} ${bodyH} ${w - r} ${bodyH}`,
    // 꼬리 오른쪽
    `H ${tailX + tailW}`,
    `L ${tailX + tailW * 0.3} ${bodyH + tailH}`,
    `L ${tailX} ${bodyH}`,
    // 왼쪽으로
    `H ${r}`,
    `Q 0 ${bodyH} 0 ${bodyH - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    `Z`,
  ].join(" ");

  return {
    pathD,
    viewBox: `0 0 ${w} ${h}`,
    vbX: 0,
    vbY: 0,
    vbW: w,
    vbH: h,
    fillColor: "#FFFFFF",
    strokeColor: "#333333",
    strokeWidth: 2.5,
  };
}

/**
 * 생성된 패널 이미지와 대사를 단일 페이지 PageData[]로 변환합니다.
 * 웹툰 스트립 형식: 모든 패널을 하나의 세로 스트립에 쌓기 (패널 간 200px 간격)
 */
export function buildPageDataFromPanels(
  panels: Array<{
    index: number;
    imageUrl: string;
    description: string;
  }>,
  dialogueHints: DialogueHint[],
  episodeNumber: number = 1,
  stripWidth: number = DEFAULT_STRIP_WIDTH
): PageData[] {
  // 패널 높이 = stripWidth * 4/3
  const panelH = Math.round(stripWidth * 4 / 3);
  // 전체 높이 = (패널 높이 + 간격) × 패널 수 - 마지막 간격
  const totalHeight = panels.length * panelH + Math.max(0, panels.length - 1) * PANEL_GAP;

  const images: ImageData[] = panels.map((panel, i) => ({
    id: `panel_img_${panel.index}`,
    pageIndex: 0,
    storageUrl: panel.imageUrl,
    bounds: { x: 0, y: i * (panelH + PANEL_GAP), w: stripWidth, h: panelH },
  }));

  const bubbles: BubbleData[] = [];
  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi];
    const panelDialogues = dialogueHints.filter(d => d.panelIndex === panel.index);
    const panelY = pi * (panelH + PANEL_GAP);

    panelDialogues.forEach((d, di) => {
      const bw = 240;
      const bh = 80;
      const isLeft = di % 2 === 0;
      const bx = isLeft ? stripWidth * 0.06 : stripWidth * 0.52;
      const by = panelY + panelH * 0.55 + di * 90;

      bubbles.push({
        id: `bubble_${panel.index}_${di}`,
        type: "dialogue" as const,
        text: `${d.character}: ${d.text}`,
        position: { x: bx, y: by },
        size: { w: bw, h: bh },
        svgPath: makeSpeechBubbleSvgPath(bw, bh, isLeft ? "left" : "right"),
        style: {
          fontSize: 14,
          fontFamily: "Pretendard",
          color: "#000000",
          bgColor: "#FFFFFF",
          borderColor: "#333333",
          borderWidth: 2.5,
          radius: 20,
        },
        bubbleStyle: "speech" as const,
        pageIndex: 0,
        objectIndex: bubbles.length,
      } as any);
    });
  }

  return [{
    pageIndex: 0,
    episodeNum: episodeNumber,
    image: images[0],
    images,
    bubbles,
    pageSize: { w: stripWidth, h: totalHeight },
  }];
}

// ─── Figma 연결 상태 리스너 ─────────────────────────────────

/**
 * Figma 플러그인의 연결 상태를 실시간으로 감시합니다.
 * Firestore figma_sync/status 문서의 onSnapshot
 */
export function listenFigmaStatus(
  projectId: string,
  callback: (status: FigmaSyncStatus) => void
): () => void {
  let unsubscribe: (() => void) | null = null;

  (async () => {
    try {
      const { collection, doc, onSnapshot } = await import("firebase/firestore");
      const { getDb } = await import("@/services/firebase");
      const { ensureFirebaseReady } = await import("@/services");
      await ensureFirebaseReady();
      const db = getDb();

      const projectRef = doc(collection(db, "webtoon_projects"), projectId);
      const statusRef = doc(collection(projectRef, "figma_sync"), "status");

      unsubscribe = onSnapshot(statusRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          callback({
            connected: data.connected ?? false,
            lastSyncAt: data.lastSyncAt ?? 0,
            message: data.message,
            progress: data.progress,
          });
        } else {
          callback({ connected: false, lastSyncAt: 0 });
        }
      });
    } catch (e) {
      console.error("[FigmaSync] Status listener error:", e);
      callback({ connected: false, lastSyncAt: 0 });
    }
  })();

  return () => {
    if (unsubscribe) unsubscribe();
  };
}

// ─── 대사 추출 유틸 ─────────────────────────────────────────

/**
 * 씬 텍스트에서 대사(DialogueHint)를 추출합니다.
 * 패턴: "캐릭터이름: 대사" 또는 "캐릭터이름: (액션) 대사"
 */
export function extractDialogueHints(
  sceneText: string,
  panelDescriptions: Array<{ index: number; description: string; characters: string[] }>
): DialogueHint[] {
  const hints: DialogueHint[] = [];
  const dialoguePattern = /^([가-힣a-zA-Z]{1,10})\s*[:：]\s*(?:\([^)]*\)\s*)?[""]?(.+?)[""]?\s*$/gm;

  for (const panel of panelDescriptions) {
    const desc = panel.description;
    let match;
    dialoguePattern.lastIndex = 0;

    while ((match = dialoguePattern.exec(desc)) !== null) {
      const character = match[1].trim();
      const text = match[2].trim().replace(/^[""]|[""]$/g, "");

      if (text.length > 0 && panel.characters.some(c => c === character || character.includes(c))) {
        hints.push({
          panelIndex: panel.index,
          character,
          text,
        });
      }
    }
  }

  // 씬 텍스트 전체에서도 추출 (패널에 매핑)
  if (hints.length === 0) {
    const lines = sceneText.split("\n");
    let currentPanelIdx = 0;

    for (const line of lines) {
      const lineMatch = line.match(/^([가-힣a-zA-Z]{1,10})\s*[:：]\s*(?:\([^)]*\)\s*)?[""]?(.+?)[""]?\s*$/);
      if (lineMatch) {
        const character = lineMatch[1].trim();
        const text = lineMatch[2].trim().replace(/^[""]|[""]$/g, "");
        if (text.length > 0) {
          // 해당 캐릭터가 등장하는 가장 가까운 패널에 매핑
          const matchPanel = panelDescriptions.find((p, i) =>
            i >= currentPanelIdx && p.characters.some(c => c === character || character.includes(c))
          );
          if (matchPanel) {
            hints.push({ panelIndex: matchPanel.index, character, text });
            currentPanelIdx = matchPanel.index;
          }
        }
      }
    }
  }

  return hints;
}
