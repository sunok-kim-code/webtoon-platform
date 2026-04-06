// ============================================================
// Figma Export/Import 타입 (v2.1)
// 웹 플랫폼 ↔ Figma 플러그인 통신 계약
// ============================================================

import type { BubbleData, ImageData, PageData } from "./panel";

// ---- 에피소드 내보내기 매니페스트 ----

/** "Send to Figma" 시 전달되는 매니페스트 */
export interface EpisodeManifest {
  projectId: string;
  episodeId: string;
  episodeNumber: number;
  title: string;
  panels: ManifestPanel[];
  dialogueHints: DialogueHint[];
  sceneBreaks: number[];      // 씬 전환이 발생하는 패널 인덱스
}

export interface ManifestPanel {
  index: number;
  imageUrl: string;           // Firebase Storage URL
  width: number;
  height: number;
  prompt?: string;
}

export interface DialogueHint {
  panelIndex: number;
  character: string;
  text: string;
}

// ---- Figma → 웹 플랫폼 동기화 (Sync Back) ----

/** Figma 작업 완료 후 플랫폼에 동기화되는 데이터 */
export interface FigmaSyncBack {
  composedPages: ComposedPage[];
  bubbleData: PanelBubbleData[];
  completedAt: number;
}

export interface ComposedPage {
  storageUrl: string;
  pageIndex: number;
  width: number;
  height: number;
}

export interface PanelBubbleData {
  panelIndex: number;
  bubbles: Array<{
    type: string;
    text: string;
    position: { x: number; y: number };
  }>;
}

/** Firestore figma_exports 컬렉션 문서 */
export interface FigmaExportDoc {
  status: "pending" | "in_figma" | "completed";
  figmaFileUrl?: string;
  exportedAt: number;
  manifest: EpisodeManifest;
  syncBack?: FigmaSyncBack;
}

// ---- 플러그인 메시지 프로토콜 (기존 호환 + v2.1 확장) ----

/** 웹앱 → 플러그인 UI → 플러그인 코드 */
export type IncomingMessage =
  | { type: "SYNC_PAGE";       payload: PageData }
  | { type: "BATCH_SYNC";      payload: PageData[] }
  | { type: "ADD_BUBBLE";      payload: BubbleData }
  | { type: "UPDATE_BUBBLE";   payload: BubbleData }
  | { type: "DELETE_BUBBLE";   payload: { id: string; pageIndex: number } }
  | { type: "UPDATE_IMAGE";    payload: ImageData }
  | { type: "INIT";            payload: { projectName: string; episodeNum: number } }
  | { type: "IMPORT_EPISODE";  payload: EpisodeManifest }   // v2.1: 에피소드 일괄 임포트
  | { type: "EXPORT_SYNC";     payload: { episodeId: string } }  // v2.1: 내보내기 & 동기화
  | { type: "PING" };

/** 플러그인 코드 → 플러그인 UI → 웹앱 */
export type OutgoingMessage =
  | { type: "SYNC_OK";      id: string; figmaNodeId: string }
  | { type: "SYNC_ERROR";   id: string; error: string }
  | { type: "BATCH_OK";     count: number }
  | { type: "STATUS";       connected: boolean; pageCount: number; lastSync: number }
  | { type: "IMPORT_OK";    panelCount: number }            // v2.1
  | { type: "EXPORT_OK";    syncBack: FigmaSyncBack }       // v2.1
  | { type: "PONG" }
  | { type: "PROGRESS";     current: number; total: number; label: string };

/** 노드 ID 매핑 (웹앱 ID ↔ Figma Node ID) */
export interface NodeMapping {
  webAppId: string;
  figmaNodeId: string;
  type: "dialogue" | "narration" | "sfx" | "image" | "page";
  contentHash: string;
  lastSyncAt: number;
}

/** 플러그인 설정 */
export interface PluginConfig {
  pageWidth: number;
  pageHeight: number;
  pageGap: number;
  defaultFont: { family: string; style: string };
  sfxFont: { family: string; style: string };
  scaleFactor: number;
  stripWidth: number;         // v2.1: 웹툰 스트립 너비 (기본 800)
  gutterSize: number;         // v2.1: 패널 간 여백 (기본 20)
}

export const DEFAULT_CONFIG: PluginConfig = {
  pageWidth: 800,
  pageHeight: 1200,
  pageGap: 100,
  defaultFont: { family: "Inter", style: "Regular" },
  sfxFont: { family: "Nanum Brush Script", style: "Regular" },
  scaleFactor: 1.0,
  stripWidth: 800,
  gutterSize: 20,
};
