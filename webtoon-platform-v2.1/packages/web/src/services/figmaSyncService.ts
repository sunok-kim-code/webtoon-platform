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
const PANEL_GAP = 400; // 패널 사이 간격

// ── 말풍선 SVG Path 생성 (video-prompt-engine 호환: 타원 + 꼬리) ──
function makeSpeechBubbleSvgPath(w: number, h: number, tailSide: "left" | "right" = "left") {
  // 타원형 말풍선 (buildBubblePath 호환, roundness=100)
  const bodyH = h * 0.82; // 본체 높이 (꼬리 공간 확보)
  const rx = w / 2;
  const ry = bodyH / 2;
  const cx = w / 2;
  const cy = bodyH / 2;

  // 타원 코너 반경 = min(rx, ry) → 완전한 타원
  const cr = Math.min(rx, ry);
  const crx = cr;
  const cry = cr;
  const k = 0.5523; // 베지어 원 근사 상수

  const L = cx - rx;
  const R = cx + rx;
  const T = cy - ry;
  const B = cy + ry;

  // 꼬리 위치/크기
  const tailW = w * 0.1;
  const tailH = h - bodyH;
  const tailCx = tailSide === "left" ? cx - rx * 0.3 : cx + rx * 0.3;
  const tLeft = tailCx - tailW / 2;
  const tRight = tailCx + tailW / 2;
  const tipX = tailSide === "left" ? tailCx - tailW * 0.5 : tailCx + tailW * 0.5;
  const tipY = B + tailH;

  const pathD = [
    `M ${L + crx} ${T}`,
    `L ${R - crx} ${T}`,
    `C ${R - crx + crx * k} ${T} ${R} ${T + cry - cry * k} ${R} ${T + cry}`,
    `L ${R} ${B - cry}`,
    `C ${R} ${B - cry + cry * k} ${R - crx + crx * k} ${B} ${R - crx} ${B}`,
    // → 꼬리 오른쪽 접합점
    `L ${tRight} ${B}`,
    `L ${tipX} ${tipY}`,
    `L ${tLeft} ${B}`,
    // ← 왼쪽으로
    `L ${L + crx} ${B}`,
    `C ${L + crx - crx * k} ${B} ${L} ${B - cry + cry * k} ${L} ${B - cry}`,
    `L ${L} ${T + cry}`,
    `C ${L} ${T + cry - cry * k} ${L + crx - crx * k} ${T} ${L + crx} ${T}`,
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
 * 웹툰 스트립 형식: 모든 패널을 하나의 세로 스트립에 쌓기 (패널 간 400px 간격)
 *
 * - 패널 높이: 원본 이미지 비율 기반 동적 계산 (origWidth/origHeight 제공 시)
 * - 말풍선: 각 패널 영역 내에 배치
 * - 나레이션: 패널 사이 400px 간격에 배치
 * - SFX: 각 패널 영역 내에 배치
 */
export function buildPageDataFromPanels(
  panels: Array<{
    index: number;
    imageUrl: string;
    description: string;
    origWidth?: number;
    origHeight?: number;
    dialogues?: Array<{ character: string; text: string }>;
    sfx?: string[];
    narration?: string;
  }>,
  dialogueHints: DialogueHint[],
  episodeNumber: number = 1,
  stripWidth: number = DEFAULT_STRIP_WIDTH
): PageData[] {
  // ── 각 패널의 높이를 원본 비율 기반으로 계산 ──
  const panelHeights: number[] = panels.map(p => {
    if (p.origWidth && p.origHeight && p.origWidth > 0) {
      return Math.round(stripWidth * (p.origHeight / p.origWidth));
    }
    return DEFAULT_PANEL_HEIGHT; // 폴백: 4:3
  });

  // ── 각 패널의 Y 오프셋 계산 (패널 간 400px 간격) ──
  const panelYOffsets: number[] = [];
  let currentY = 0;
  for (let i = 0; i < panels.length; i++) {
    panelYOffsets.push(currentY);
    currentY += panelHeights[i] + PANEL_GAP;
  }
  // 전체 높이 = 마지막 패널 끝
  const totalHeight = panels.length > 0
    ? panelYOffsets[panels.length - 1] + panelHeights[panels.length - 1]
    : 0;

  // ── 이미지 배치 ──
  const images: ImageData[] = panels.map((panel, i) => ({
    id: `panel_img_${panel.index}`,
    pageIndex: 0,
    storageUrl: panel.imageUrl,
    bounds: { x: 0, y: panelYOffsets[i], w: stripWidth, h: panelHeights[i] },
  }));

  // ── 버블 배치 ──
  const bubbles: BubbleData[] = [];

  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi];
    const panelY = panelYOffsets[pi];
    const panelH = panelHeights[pi];

    // ── 1. 대사 말풍선 (패널 내부) ──
    // panel.dialogues 인라인 데이터만 사용 (dialogueHints와 병합하지 않아 중복 방지)
    const inlineDialogues: Array<{ character: string; text: string }> =
      panel.dialogues && panel.dialogues.length > 0 ? panel.dialogues : [];

    // dialogueHints는 인라인이 완전히 비어있을 때만 폴백
    const hintDialogues: Array<{ character: string; text: string }> =
      inlineDialogues.length === 0
        ? dialogueHints
            .filter(d => d.panelIndex === panel.index)
            .map(d => ({ character: d.character, text: d.text }))
        : [];

    const sourceDialogues = inlineDialogues.length > 0 ? inlineDialogues : hintDialogues;
    const seen = new Set<string>();
    const panelDialogues: Array<{ character: string; text: string }> = [];
    for (const d of sourceDialogues) {
      const key = `${d.character.trim()}::${d.text.trim()}`;
      if (!d.text.trim() || seen.has(key)) continue;
      seen.add(key);
      panelDialogues.push(d);
    }
    console.log(`[FigmaExport] Panel ${panel.index}: dialogues=${panelDialogues.length} (source=${inlineDialogues.length > 0 ? "inline" : "hints"})`);

    // 꼬리 왼쪽 (원본)
    const BUBBLE_PATH_TAIL_LEFT = "M104.425 1.75781C31.0913 1.75781 1.75793 60.0132 1.75793 131.214C1.75793 189.47 21.9246 239.095 54.0079 256.356C49.4246 275.774 35.6746 303.823 14.5913 318.926C40.2579 308.138 56.7579 286.562 65.9246 269.301C76.9246 275.774 89.7579 277.932 104.425 277.932C177.758 277.932 207.091 211.046 207.091 131.214C207.091 60.0132 177.758 1.75781 104.425 1.75781Z";
    // 꼬리 오른쪽 (X좌표 209-x 반전)
    const BUBBLE_PATH_TAIL_RIGHT = "M104.575 1.75781C177.909 1.75781 207.242 60.0132 207.242 131.214C207.242 189.47 187.075 239.095 154.992 256.356C159.575 275.774 173.325 303.823 194.409 318.926C168.742 308.138 152.242 286.562 143.075 269.301C132.075 275.774 119.242 277.932 104.575 277.932C31.242 277.932 1.909 211.046 1.909 131.214C1.909 60.0132 31.242 1.75781 104.575 1.75781Z";

    // 대사별 누적 Y 오프셋 (글자 수에 따라 높이가 달라지므로)
    let bubbleYAccum = 0;

    panelDialogues.forEach((d, di) => {
      const bw = 240;
      // 글자 수 기반 높이 계산: 한 줄 약 10자 기준, fontSize 25 + 패딩
      const charCount = d.text.length;
      const charsPerLine = 8; // 말풍선 너비 대비 한 줄에 들어가는 글자 수
      const lineCount = Math.max(1, Math.ceil(charCount / charsPerLine));
      const lineHeight = 32; // fontSize 25 * 1.28 줄간격
      const verticalPadding = 50; // 상하 패딩 합계
      const bh = Math.max(80, lineCount * lineHeight + verticalPadding);
      // 첫번째(di=0) = 왼쪽 꼬리, 두번째(di=1) = 오른쪽 꼬리, 이후 교대
      const tailRight = di % 2 === 1; // di=0 → 왼쪽, di=1 → 오른쪽
      const bx = tailRight ? stripWidth * 0.52 : stripWidth * 0.06;
      // 패널 상단에서 시작, 대사별 누적 간격 (높이 + 여백)
      const by = panelY + 20 + bubbleYAccum;
      bubbleYAccum += bh + 15; // 말풍선 높이 + 간격

      bubbles.push({
        id: `bubble_${panel.index}_${di}`,
        type: "dialogue" as const,
        text: d.text,
        position: { x: bx, y: by },
        size: { w: bw, h: bh },
        svgPath: {
          pathD: tailRight ? BUBBLE_PATH_TAIL_RIGHT : BUBBLE_PATH_TAIL_LEFT,
          viewBox: "0 0 209 321",
          vbX: 0,
          vbY: 0,
          vbW: 209,
          vbH: 321,
          fillColor: "#FFFFFF",
          strokeColor: "#333333",
          strokeWidth: 3.5,
        },
        style: {
          fontSize: 25,
          fontFamily: "Pretendard",
          color: "#000000",
          bgColor: "#FFFFFF",
          borderColor: "#333333",
          borderWidth: 3.5,
        },
        bubbleStyle: "speech" as const,
        pageIndex: 0,
        objectIndex: bubbles.length,
      } as any);
    });

    // ── 2. SFX (패널 내부) ──
    const panelSfx: string[] = (panel.sfx || []).map(s => s.replace(/\s*\([^)]*\)/g, "").trim()).filter(s => s.length > 0);
    panelSfx.forEach((sfxText, si) => {
      const sw = 180;
      const sh = 60;
      // SFX를 패널 상단 20~40% 영역에 배치, 좌우 교대
      const isLeft = si % 2 === 0;
      const sx = isLeft ? stripWidth * 0.08 : stripWidth * 0.55;
      const sy = panelY + panelH * 0.15 + si * 80;

      bubbles.push({
        id: `sfx_${panel.index}_${si}`,
        type: "sfx" as const,
        text: sfxText,
        position: { x: sx, y: sy },
        size: { w: sw, h: sh },
        style: {
          fontSize: 48,
          fontFamily: "Nanum Brush Script",
          fontWeight: 900,
          color: "#000000",
          rotation: si % 2 === 0 ? -10 : 10,
          opacity: 0.95,
        },
        bubbleStyle: "text" as const,
        pageIndex: 0,
        objectIndex: bubbles.length,
      } as any);
    });

    // ── 3. 나레이션 (패널 사이 간격에 배치) ──
    // 나레이션은 이 패널 아래 ~ 다음 패널 시작 사이의 400px 간격 가운데에 배치
    const narrationText = panel.narration;
    if (narrationText && narrationText.trim().length > 0 && pi < panels.length - 1) {
      const nw = stripWidth * 0.8;
      const nh = 60;
      const gapStart = panelY + panelH; // 패널 끝
      const nx = (stripWidth - nw) / 2;
      const ny = gapStart + (PANEL_GAP - nh) / 2; // 간격 중앙

      bubbles.push({
        id: `narration_${panel.index}`,
        type: "narration" as const,
        text: narrationText,
        position: { x: nx, y: ny },
        size: { w: nw, h: nh },
        style: {
          fontSize: 25,
          fontFamily: "Pretendard",
          color: "#333333",
          bgColor: "transparent",
          borderWidth: 0,
          radius: 4,
          isBox: true,
        },
        bubbleStyle: "narration" as const,
        pageIndex: 0,
        objectIndex: bubbles.length,
      } as any);
    }
    // 마지막 패널의 나레이션은 패널 아래에 배치
    if (narrationText && narrationText.trim().length > 0 && pi === panels.length - 1) {
      const nw = stripWidth * 0.8;
      const nh = 60;
      const nx = (stripWidth - nw) / 2;
      const ny = panelY + panelH + 40;

      bubbles.push({
        id: `narration_${panel.index}`,
        type: "narration" as const,
        text: narrationText,
        position: { x: nx, y: ny },
        size: { w: nw, h: nh },
        style: {
          fontSize: 25,
          fontFamily: "Pretendard",
          color: "#333333",
          bgColor: "transparent",
          borderWidth: 0,
          radius: 4,
          isBox: true,
        },
        bubbleStyle: "narration" as const,
        pageIndex: 0,
        objectIndex: bubbles.length,
      } as any);
    }
  }

  // 마지막 패널 나레이션 포함 시 높이 확장
  const lastPanel = panels[panels.length - 1];
  const finalHeight = lastPanel?.narration?.trim()
    ? totalHeight + 120  // 나레이션 공간 추가
    : totalHeight;

  // 디버그: 전송될 버블 요약 로그
  const dialogueBubbles = bubbles.filter((b: any) => b.type === "dialogue");
  const sfxBubbles = bubbles.filter((b: any) => b.type === "sfx");
  const narrationBubbles = bubbles.filter((b: any) => b.type === "narration");
  console.log(`[FigmaExport] 버블 요약: 말풍선 ${dialogueBubbles.length}개, SFX ${sfxBubbles.length}개, 나레이션 ${narrationBubbles.length}개`);
  dialogueBubbles.forEach((b: any, i: number) => console.log(`  말풍선[${i}]: "${b.text}" (panel ${b.id})`));

  return [{
    pageIndex: 0,
    episodeNum: episodeNumber,
    image: images[0],
    images,
    bubbles,
    pageSize: { w: stripWidth, h: finalHeight },
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
          // video-prompt-engine 플러그인: pluginActive + lastHeartbeat
          // webtoon-platform 플러그인: connected + lastSyncAt
          const isConnected = data.connected === true || data.pluginActive === true;

          // lastSyncAt 또는 lastHeartbeat (Firestore Timestamp → ms 변환)
          let syncTime = data.lastSyncAt ?? 0;
          if (!syncTime && data.lastHeartbeat) {
            syncTime = data.lastHeartbeat.toMillis ? data.lastHeartbeat.toMillis() : (data.lastHeartbeat ?? 0);
          }

          // heartbeat가 30초 이상 지나면 연결 끊긴 것으로 간주
          const isStale = syncTime > 0 && (Date.now() - syncTime > 30000);

          callback({
            connected: isConnected && !isStale,
            lastSyncAt: syncTime,
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
