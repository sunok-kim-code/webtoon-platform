// ============================================================
// controller.ts — 플러그인 메인 진입점 (v2.1)
// Figma sandbox에서 실행 — DOM 접근 불가, Figma API만 사용
// 기존 code.ts에서 분리 + v2.1 메시지 확장
// ============================================================

import { SyncEngine } from "./syncEngine";
import { SceneBuilder } from "./sceneBuilder";
import { Exporter } from "./exporter";
import type { IncomingMessage } from "@webtoon/shared/types/figmaExport";

const engine = new SyncEngine();
const sceneBuilder = new SceneBuilder();
const exporter = new Exporter();

figma.showUI(__html__, {
  width: 360,
  height: 520,
  themeColors: true,
  title: "Webtoon Studio",
});

// ---- UI → Code 메시지 수신 ----
figma.ui.onmessage = async (msg: any) => {
  // clientStorage 저장/복원
  if (msg.type === "SAVE_CONFIG") {
    await figma.clientStorage.setAsync("fb_config", msg.config);
    await figma.clientStorage.setAsync("project_id", msg.projectId);
    return;
  }
  if (msg.type === "RESTORE_CONFIG") {
    const config = await figma.clientStorage.getAsync("fb_config");
    const projectId = await figma.clientStorage.getAsync("project_id");
    figma.ui.postMessage({ type: "RESTORED_CONFIG", config: config || "", projectId: projectId || "" });
    return;
  }

  try {
    const message = msg as IncomingMessage;

    // v2.1 신규 메시지 처리
    if (message.type === "IMPORT_EPISODE") {
      await sceneBuilder.buildEpisodePage(message.payload);
      figma.ui.postMessage({ type: "IMPORT_OK", panelCount: message.payload.panels.length });
      return;
    }
    if (message.type === "EXPORT_SYNC") {
      const { episodeId } = message.payload;
      figma.ui.postMessage({ type: "PROGRESS", current: 0, total: 1, label: "내보내기 시작..." });

      const syncBack = await exporter.exportAndSync();

      figma.ui.postMessage({
        type: "EXPORT_OK",
        syncBack,
      });
      figma.notify("내보내기 완료 — 동기화 대기 중...");
      return;
    }

    // 기존 v1 메시지는 SyncEngine으로 위임
    await engine.handleMessage(message);
  } catch (err) {
    figma.ui.postMessage({
      type: "SYNC_ERROR",
      id: "unknown",
      error: `처리 실패: ${String(err)}`,
    });
    figma.notify(`동기화 오류: ${String(err)}`, { error: true });
  }
};

figma.on("close", () => {
  console.log("Webtoon Studio 플러그인 종료");
});

figma.notify("Webtoon Studio 연결 대기 중...");
