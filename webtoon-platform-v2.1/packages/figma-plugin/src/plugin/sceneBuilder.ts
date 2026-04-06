// ============================================================
// sceneBuilder.ts — 패널 임포트 & Figma 프레임 생성 (v2.1 신규)
// "Send to Figma" 시 에피소드 매니페스트 → Figma 문서 구조 생성
// ============================================================

import type { EpisodeManifest, ManifestPanel } from "@webtoon/shared/types/figmaExport";
import { DEFAULT_STRIP_WIDTH, DEFAULT_GUTTER, SCENE_GAP_MULTIPLIER } from "@webtoon/shared/constants";

interface SceneGroup {
  index: number;
  panels: ManifestPanel[];
}

export class SceneBuilder {
  private stripWidth: number;
  private gutter: number;

  constructor(stripWidth = DEFAULT_STRIP_WIDTH, gutter = DEFAULT_GUTTER) {
    this.stripWidth = stripWidth;
    this.gutter = gutter;
  }

  /** 에피소드 매니페스트 → Figma 페이지 생성 */
  async buildEpisodePage(manifest: EpisodeManifest): Promise<void> {
    const page = figma.createPage();
    page.name = `EP${manifest.episodeNumber} - ${manifest.title}`;

    let yOffset = 0;
    const scenes = this.groupByScene(manifest.panels, manifest.sceneBreaks);

    for (const scene of scenes) {
      // 씬 프레임 생성
      const sceneFrame = figma.createFrame();
      sceneFrame.name = `Scene ${scene.index}`;
      sceneFrame.layoutMode = "VERTICAL";
      sceneFrame.itemSpacing = this.gutter;
      sceneFrame.resize(this.stripWidth, 100);
      sceneFrame.y = yOffset;

      for (const panel of scene.panels) {
        await this.createPanelFrame(sceneFrame, panel);

        // 진행률 보고
        figma.ui.postMessage({
          type: "PROGRESS",
          current: panel.index + 1,
          total: manifest.panels.length,
          label: `패널 ${panel.index + 1}/${manifest.panels.length} 임포트 중`,
        });
      }

      page.appendChild(sceneFrame);
      yOffset += sceneFrame.height + this.gutter * SCENE_GAP_MULTIPLIER;
    }

    // 대사 힌트 배치
    if (manifest.dialogueHints?.length) {
      await this.placeDialogueHints(page, manifest);
    }

    figma.currentPage = page;
    figma.viewport.scrollAndZoomIntoView(page.children);
  }

  /** 패널 프레임 생성 + 이미지 배치 */
  private async createPanelFrame(parent: FrameNode, panel: ManifestPanel): Promise<void> {
    const panelFrame = figma.createFrame();
    panelFrame.name = `Panel ${panel.index}`;
    const aspectRatio = panel.height / panel.width;
    panelFrame.resize(this.stripWidth, this.stripWidth * aspectRatio);

    try {
      // Firebase Storage URL → Figma 이미지
      const imageData = await figma.createImageAsync(panel.imageUrl);
      const rect = figma.createRectangle();
      rect.fills = [{ type: "IMAGE", imageHash: imageData.hash, scaleMode: "FILL" }];
      rect.resize(panelFrame.width, panelFrame.height);
      panelFrame.appendChild(rect);
    } catch (err) {
      // 이미지 로드 실패 시 플레이스홀더
      const placeholder = figma.createRectangle();
      placeholder.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
      placeholder.resize(panelFrame.width, panelFrame.height);
      panelFrame.appendChild(placeholder);
      console.warn(`Panel ${panel.index} 이미지 로드 실패:`, err);
    }

    parent.appendChild(panelFrame);
  }

  /** 대사 힌트를 텍스트 레이어로 배치 */
  private async placeDialogueHints(page: PageNode, manifest: EpisodeManifest): Promise<void> {
    // 패널 인덱스를 키로 대상 프레임 매핑 생성
    const panelFrameMap = new Map<number, FrameNode>();

    for (const scene of page.children) {
      if (scene.type !== "FRAME") continue;
      const sceneFrame = scene as FrameNode;

      for (const panel of sceneFrame.children) {
        if (panel.type !== "FRAME") continue;
        const panelFrame = panel as FrameNode;
        const panelIndex = parseInt(panelFrame.name.replace("Panel ", "")) || 0;
        panelFrameMap.set(panelIndex, panelFrame);
      }
    }

    // 각 대사 힌트를 해당 패널에 텍스트 노드로 추가
    for (const hint of manifest.dialogueHints) {
      const panelFrame = panelFrameMap.get(hint.panelIndex);
      if (!panelFrame) continue;

      // 텍스트 노드 생성
      const textNode = figma.createText();
      textNode.name = `Dialogue Hint: ${hint.character}`;
      textNode.characters = `[${hint.character}] ${hint.text}`;

      // 기본 텍스트 속성 설정
      textNode.fontSize = 12;
      textNode.fontFamily = "Inter";
      await figma.loadFontAsync(textNode.fontFamily, textNode.fontStyle as FontStyle);

      // 패널 이미지 아래에 배치
      const panelHeight = panelFrame.height;
      textNode.y = panelHeight + this.gutter / 2;
      textNode.x = 0;

      // 패널 너비만큼 텍스트 너비 제한
      textNode.textAutoResize = "HEIGHT";

      // 패널에 추가
      panelFrame.appendChild(textNode);
    }
  }

  /** 패널을 씬 브레이크 기준으로 그룹화 */
  private groupByScene(panels: ManifestPanel[], sceneBreaks: number[]): SceneGroup[] {
    const breaks = new Set(sceneBreaks);
    const groups: SceneGroup[] = [];
    let current: ManifestPanel[] = [];
    let sceneIdx = 0;

    for (const panel of panels) {
      if (breaks.has(panel.index) && current.length > 0) {
        groups.push({ index: sceneIdx++, panels: current });
        current = [];
      }
      current.push(panel);
    }
    if (current.length > 0) {
      groups.push({ index: sceneIdx, panels: current });
    }
    return groups;
  }
}
