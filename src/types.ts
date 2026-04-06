// ============================================================
// 공통 타입 정의
// 웹앱과 Figma 플러그인이 공유하는 인터페이스
// ============================================================

/** 버블(말풍선/나레이션/효과음) 타입 */
export type BubbleType = "dialogue" | "narration" | "sfx";

/** 버블 데이터 (웹앱 → 플러그인 전송 단위) */
export interface BubbleData {
  id: string;                  // 고유 ID: "ep1_page0_dialogue0"
  type: BubbleType;
  text: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  style: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;            // hex: "#ff6b6b"
    rotation?: number;         // degrees
    opacity?: number;          // 0~1
    strokeColor?: string;
    strokeWeight?: number;
  };
  pageIndex: number;
  objectIndex: number;
}

/** 이미지 데이터 (웹앱 → 플러그인 전송 단위) */
export interface ImageData {
  id: string;                  // "ep1_page0_img"
  pageIndex: number;
  base64: string;              // data:image/png;base64,... 또는 순수 base64
  bounds: { x: number; y: number; w: number; h: number };
}

/** 페이지 전체 데이터 (일괄 동기화용) */
export interface PageData {
  pageIndex: number;
  episodeNum: number;
  image?: ImageData;
  bubbles: BubbleData[];
}

// ---- 메시지 프로토콜 ----

/** 웹앱 → 플러그인 UI → 플러그인 코드 */
export type IncomingMessage =
  | { type: "SYNC_PAGE";       payload: PageData }
  | { type: "BATCH_SYNC";     payload: PageData[] }
  | { type: "ADD_BUBBLE";     payload: BubbleData }
  | { type: "UPDATE_BUBBLE";  payload: BubbleData }
  | { type: "DELETE_BUBBLE";  payload: { id: string; pageIndex: number } }
  | { type: "UPDATE_IMAGE";   payload: ImageData }
  | { type: "INIT";           payload: { projectName: string; episodeNum: number } }
  | { type: "PING" };

/** 플러그인 코드 → 플러그인 UI → 웹앱 */
export type OutgoingMessage =
  | { type: "SYNC_OK";    id: string; figmaNodeId: string }
  | { type: "SYNC_ERROR"; id: string; error: string }
  | { type: "BATCH_OK";   count: number }
  | { type: "STATUS";     connected: boolean; pageCount: number; lastSync: number }
  | { type: "PONG" }
  | { type: "PROGRESS";   current: number; total: number; label: string };

/** 노드 ID 매핑 (웹앱 ID ↔ Figma Node ID) */
export interface NodeMapping {
  webAppId: string;
  figmaNodeId: string;
  type: BubbleType | "image" | "page";
  contentHash: string;
  lastSyncAt: number;
}

/** 플러그인 설정 */
export interface PluginConfig {
  pageWidth: number;           // 기본 800
  pageHeight: number;          // 기본 1200
  pageGap: number;             // 페이지 간 간격 (기본 100)
  defaultFont: { family: string; style: string };
  sfxFont: { family: string; style: string };
  scaleFactor: number;         // 좌표 스케일 배율
}

export const DEFAULT_CONFIG: PluginConfig = {
  pageWidth: 800,
  pageHeight: 1200,
  pageGap: 100,
  defaultFont: { family: "Inter", style: "Regular" },
  sfxFont: { family: "Inter", style: "Bold" },
  scaleFactor: 1.0,
};
