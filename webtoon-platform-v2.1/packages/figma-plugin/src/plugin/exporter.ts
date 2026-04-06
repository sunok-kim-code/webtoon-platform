// ============================================================
// exporter.ts — 최종 이미지 내보내기 + 플랫폼 동기화 (v2.1 신규)
// Figma 후반작업 완료 → PNG 내보내기 → Firebase 업로드 → 상태 갱신
// ============================================================

import type { FigmaSyncBack, ComposedPage, PanelBubbleData } from "@webtoon/shared/types/figmaExport";

export class Exporter {
  /** 현재 페이지의 씬 프레임들을 PNG로 내보내기 */
  async exportAsImages(scale: number = 2): Promise<Uint8Array[]> {
    const page = figma.currentPage;
    const sceneFrames = page.children.filter(
      (n): n is FrameNode => n.type === "FRAME" && n.name.startsWith("Scene")
    );

    const images: Uint8Array[] = [];
    for (let i = 0; i < sceneFrames.length; i++) {
      figma.ui.postMessage({
        type: "PROGRESS",
        current: i + 1,
        total: sceneFrames.length,
        label: `프레임 ${i + 1}/${sceneFrames.length} 내보내기 중`,
      });

      const bytes = await sceneFrames[i].exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: scale },
      });
      images.push(bytes);
    }
    return images;
  }

  /** 버블 데이터 추출 (텍스트 + 위치) */
  extractBubbleData(): PanelBubbleData[] {
    const page = figma.currentPage;
    const result: PanelBubbleData[] = [];

    for (const scene of page.children) {
      if (scene.type !== "FRAME") continue;

      for (const panel of (scene as FrameNode).children) {
        if (panel.type !== "FRAME") continue;

        const panelIndex = parseInt(panel.name.replace("Panel ", "")) || 0;
        const bubbles: PanelBubbleData["bubbles"] = [];

        // 텍스트 노드 검색
        const textNodes = panel.findAll(n => n.type === "TEXT") as TextNode[];
        for (const tn of textNodes) {
          bubbles.push({
            type: tn.name.includes("Dialogue") ? "dialogue" : "sfx",
            text: tn.characters,
            position: { x: tn.x, y: tn.y },
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
  async exportAndSync(): Promise<FigmaSyncBack> {
    figma.ui.postMessage({
      type: "PROGRESS",
      current: 0,
      total: 3,
      label: "PNG 이미지로 내보내기 중...",
    });

    const images = await this.exportAsImages();

    figma.ui.postMessage({
      type: "PROGRESS",
      current: 1,
      total: 3,
      label: "버블 데이터 추출 중...",
    });

    const bubbleData = this.extractBubbleData();

    figma.ui.postMessage({
      type: "PROGRESS",
      current: 2,
      total: 3,
      label: "동기화 데이터 구성 중...",
    });

    // 이미지 바이트를 Base64로 인코딩하여 UI로 전달
    // UI (iframe)에서 Firebase Storage에 업로드하고 storageUrl을 다시 받을 수 있도록 구성
    const composedPages: ComposedPage[] = images.map((imageBytes, i) => {
      // Base64 인코딩 (임시 저장용, UI에서 Firebase 업로드 시 사용)
      const binaryString = String.fromCharCode(...imageBytes);
      const base64Data = btoa(binaryString);

      // 이미지 높이는 aspect ratio 계산 필요
      // exportAsImages()가 각 Scene 프레임을 내보내므로, 해당 Scene의 높이를 사용
      const sceneFrame = figma.currentPage.children[i];
      const height = sceneFrame?.type === "FRAME" ? (sceneFrame as FrameNode).height : 0;

      return {
        storageUrl: "", // UI에서 Firebase 업로드 후 채워짐
        pageIndex: i,
        width: 800,
        height: Math.round(height),
      };
    });

    // UI로 이미지 바이트와 메타데이터를 함께 전달
    figma.ui.postMessage({
      type: "EXPORT_IMAGES_FOR_UPLOAD",
      images: images.map((bytes, i) => ({
        pageIndex: i,
        base64: "data:image/png;base64," + Array.from(bytes).map(b => String.fromCharCode(b)).join(""),
      })),
    });

    figma.ui.postMessage({
      type: "PROGRESS",
      current: 3,
      total: 3,
      label: "내보내기 완료!",
    });

    return {
      composedPages,
      bubbleData,
      completedAt: Date.now(),
    };
  }
}
