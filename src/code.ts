// ============================================================
// Figma Plugin 메인 진입점 (code.ts)
// Figma sandbox에서 실행됨 — DOM 접근 불가, Figma API만 사용
// ============================================================

import { SyncEngine } from "./syncEngine";
import { IncomingMessage } from "./types";

// 동기화 엔진 초기화
const engine = new SyncEngine();

// 플러그인 UI 표시
figma.showUI(__html__, {
  width: 360,
  height: 520,
  themeColors: true,
  title: "Webtoon Bubble Sync",
});

// ---- UI → Code 메시지 수신 ----
figma.ui.onmessage = async (msg: IncomingMessage) => {
  try {
    await engine.handleMessage(msg);
  } catch (err) {
    figma.ui.postMessage({
      type: "SYNC_ERROR",
      id: "unknown",
      error: `처리 실패: ${String(err)}`,
    });
    figma.notify(`동기화 오류: ${String(err)}`, { error: true });
  }
};

// ---- 플러그인 종료 시 정리 ----
figma.on("close", () => {
  // 필요 시 클린업 로직 추가
  console.log("Webtoon Bubble Sync 플러그인 종료");
});

// 초기 알림
figma.notify("Webtoon Bubble Sync 연결 대기 중...");
