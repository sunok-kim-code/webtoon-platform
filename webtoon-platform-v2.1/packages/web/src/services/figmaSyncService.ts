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

const DEFAULT_STRIP_WIDTH = 800;
const DEFAULT_PANEL_HEIGHT = 1067; // 4:3 portrait (800 * 4/3)

/**
 * 생성된 패널 이미지와 대사를 V1 호환 PageData[]로 변환합니다.
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
  return panels.map((panel, i) => {
    const panelDialogues = dialogueHints.filter(d => d.panelIndex === panel.index);

    // 이미지 데이터
    const image: ImageData = {
      id: `panel_img_${panel.index}`,
      pageIndex: i,
      storageUrl: panel.imageUrl,
      bounds: { x: 0, y: 0, w: stripWidth, h: DEFAULT_PANEL_HEIGHT },
    };

    // 대사 → BubbleData 변환
    const bubbles: BubbleData[] = panelDialogues.map((d, di) => ({
      id: `bubble_${panel.index}_${di}`,
      type: "dialogue" as const,
      text: `${d.character}: ${d.text}`,
      position: {
        x: stripWidth * 0.1 + (di % 2) * stripWidth * 0.4,
        y: DEFAULT_PANEL_HEIGHT * 0.6 + di * 80,
      },
      size: { w: 280, h: 60 },
      style: {
        fontSize: 16,
        fontFamily: "Pretendard",
        color: "#000000",
        bgColor: "#FFFFFF",
        borderColor: "#000000",
        borderWidth: 2,
        radius: 20,
      },
      bubbleStyle: "speech" as const,
      pageIndex: i,
      objectIndex: di,
    }));

    return {
      pageIndex: i,
      episodeNum: episodeNumber,
      image,
      images: [image],
      bubbles,
      pageSize: { w: stripWidth, h: DEFAULT_PANEL_HEIGHT },
    };
  });
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
