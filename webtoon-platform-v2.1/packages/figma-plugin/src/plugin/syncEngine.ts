// ============================================================
// SyncEngine — 동기화 엔진
// 웹앱 데이터 → Figma 노드 매핑 및 증분 업데이트 관리
// ============================================================

import type { PageData, BubbleData, ImageData } from "@webtoon/shared/types/panel";
import type { IncomingMessage, OutgoingMessage, NodeMapping, PluginConfig } from "@webtoon/shared/types/figmaExport";
import { DEFAULT_CONFIG } from "@webtoon/shared/types/figmaExport";
import { NodeFactory } from "./nodeFactory";
import { findNodeByWebAppId, simpleHash } from "./utils";

export class SyncEngine {
  private factory: NodeFactory;
  private mappings: Map<string, NodeMapping> = new Map();
  private episodePage: PageNode | null = null;
  private currentEpisodeNum: number = 0;

  constructor(config: Partial<PluginConfig> = {}) {
    this.factory = new NodeFactory(config);
  }

  /** 응답 메시지를 UI로 전송 */
  private respond(msg: OutgoingMessage) {
    figma.ui.postMessage(msg);
  }

  // ---- 초기화 ----

  /** 에피소드 Figma Page 생성 또는 기존 Page 선택 */
  async init(projectName: string, episodeNum: number): Promise<void> {
    // 에피소드 변경 시 매핑 초기화
    if (this.currentEpisodeNum !== episodeNum) {
      this.mappings.clear();
    }
    this.currentEpisodeNum = episodeNum;

    const pageName = `${projectName} - 에피소드 ${episodeNum}`;

    // 기존 페이지 탐색
    let existing = figma.root.children.find(p => p.name === pageName);
    if (existing) {
      this.episodePage = existing;
    } else {
      this.episodePage = figma.createPage();
      this.episodePage.name = pageName;
    }

    figma.currentPage = this.episodePage;

    // 기존 매핑 복원 (pluginData에서)
    this.restoreMappings();

    this.respond({
      type: "STATUS",
      connected: true,
      pageCount: this.episodePage.children.length,
      lastSync: Date.now(),
    });
  }

  /** 플러그인 데이터에서 기존 매핑 복원 */
  private restoreMappings() {
    if (!this.episodePage) return;

    const walkNodes = (parent: BaseNode & ChildrenMixin) => {
      for (const child of parent.children) {
        const webAppId = child.getPluginData("webAppId");
        const syncType = child.getPluginData("syncType");
        if (webAppId) {
          this.mappings.set(webAppId, {
            webAppId,
            figmaNodeId: child.id,
            type: syncType as any,
            contentHash: child.getPluginData("contentHash") || "",
            lastSyncAt: parseInt(child.getPluginData("lastSync") || "0"),
          });
        }
        if ("children" in child) {
          walkNodes(child as BaseNode & ChildrenMixin);
        }
      }
    };

    walkNodes(this.episodePage);
    console.log(`매핑 복원 완료: ${this.mappings.size}개 노드`);
  }

  // ---- 페이지 동기화 (전체) ----

  /** 단일 페이지의 모든 요소를 동기화 */
  async syncPage(data: PageData): Promise<void> {
    if (!this.episodePage) {
      this.respond({ type: "SYNC_ERROR", id: `page_${data.pageIndex}`, error: "에피소드 페이지 미초기화" });
      return;
    }

    try {
      // 1) 페이지 프레임 찾기 또는 생성 — 웹앱 실제 크기 반영
      const frameId = `page_${data.pageIndex}`;
      let frame = this.findExistingNode(frameId) as FrameNode | null;

      if (!frame) {
        frame = await this.factory.createPageFrame(data.pageIndex, data.pageSize);
        this.episodePage.appendChild(frame);
        this.registerMapping(frameId, frame.id, "page");
      } else if (data.pageSize) {
        // 기존 프레임 크기를 웹앱 크기에 맞춰 업데이트
        frame.resize(data.pageSize.w, data.pageSize.h);
      }

      // 2) 이미지 배치/업데이트 (다중 이미지 지원)
      var imageList = data.images || (data.image ? [data.image] : []);
      for (var imgIdx = 0; imgIdx < imageList.length; imgIdx++) {
        console.log("[SyncEngine] 이미지 동기화 " + (imgIdx + 1) + "/" + imageList.length);
        await this.syncImage(frame, imageList[imgIdx]);
      }

      // 3) 버블(대사/나레이션/SFX) 동기화 — 레이어 순서 유지
      //    나레이션 → 대사 → SFX 순으로 쌓기 (SFX가 최상단)
      const sorted = Array.from(data.bubbles).sort((a, b) => {
        const order = { narration: 0, dialogue: 1, sfx: 2 };
        return order[a.type] - order[b.type];
      });

      for (let i = 0; i < sorted.length; i++) {
        try {
          await this.syncBubble(frame, sorted[i]);
        } catch (bubbleErr) {
          console.error("[SyncEngine] 버블 동기화 실패:", sorted[i].id, sorted[i].type, bubbleErr);
        }
        this.respond({
          type: "PROGRESS",
          current: i + 1,
          total: sorted.length,
          label: `페이지 ${data.pageIndex + 1} 버블 동기화`,
        });
      }

      // 4) 삭제된 버블 정리 (웹앱에 없는데 Figma에 있는 노드)
      this.cleanupDeletedBubbles(frame, data.bubbles);

      this.respond({ type: "SYNC_OK", id: frameId, figmaNodeId: frame.id });
    } catch (err) {
      this.respond({
        type: "SYNC_ERROR",
        id: `page_${data.pageIndex}`,
        error: String(err),
      });
    }
  }

  /** 여러 페이지 일괄 동기화 */
  async batchSync(pages: PageData[]): Promise<void> {
    // 이전 내보내기 잔여 프레임 정리 (새 데이터에 없는 pageIndex의 프레임 제거)
    if (this.episodePage) {
      const newPageIndices = new Set(pages.map(p => p.pageIndex));
      for (const child of Array.from(this.episodePage.children)) {
        const webAppId = child.getPluginData("webAppId");
        if (webAppId && webAppId.startsWith("page_")) {
          const pageIdx = parseInt(webAppId.replace("page_", ""));
          if (!isNaN(pageIdx) && !newPageIndices.has(pageIdx)) {
            console.log("[SyncEngine] 잔여 프레임 제거: " + webAppId);
            child.remove();
            this.mappings.delete(webAppId);
          }
        }
      }
    }

    for (let i = 0; i < pages.length; i++) {
      this.respond({
        type: "PROGRESS",
        current: i + 1,
        total: pages.length,
        label: `에피소드 동기화 중 (${i + 1}/${pages.length} 페이지)`,
      });
      await this.syncPage(pages[i]);
    }
    this.respond({ type: "BATCH_OK", count: pages.length });
  }

  // ---- 이미지 동기화 ----

  private async syncImage(frame: FrameNode, imageData: ImageData): Promise<void> {
    // storageUrl 또는 base64에서 해시 생성
    var hashSource = (imageData.storageUrl || imageData.base64 || "").substring(0, 200);
    var hash = simpleHash(hashSource);
    console.log("[SyncEngine] syncImage:", imageData.id, "storageUrl:", !!imageData.storageUrl, "base64 len:", (imageData.base64 || "").length);
    var existing = this.findExistingNode(imageData.id);

    if (existing) {
      var oldHash = existing.getPluginData("contentHash");
      if (oldHash !== hash) {
        // 변경됨 → 기존 노드 삭제 후 새로 생성
        existing.remove();
        this.mappings.delete(imageData.id);
        var node = await this.factory.placeImage(frame, imageData);
        node.setPluginData("contentHash", hash);
        this.registerMapping(imageData.id, node.id, "image");
      }
    } else {
      var node2 = await this.factory.placeImage(frame, imageData);
      node2.setPluginData("contentHash", hash);
      this.registerMapping(imageData.id, node2.id, "image");
    }
  }

  // ---- 버블 동기화 (개별) ----

  private async syncBubble(frame: FrameNode, bubble: BubbleData): Promise<void> {
    var hash = simpleHash(JSON.stringify(bubble));
    var existing = this.findExistingNode(bubble.id);

    if (existing) {
      var oldHash = existing.getPluginData("contentHash");
      if (oldHash !== hash) {
        // 변경됨 → 기존 노드 삭제 후 새로 생성 (SVG path, 스타일 등 완전 반영)
        existing.remove();
        this.mappings.delete(bubble.id);
        var node = await this.factory.createBubbleNode(frame, bubble);
        node.setPluginData("contentHash", hash);
        this.registerMapping(bubble.id, node.id, bubble.type);
      }
    } else {
      var node2 = await this.factory.createBubbleNode(frame, bubble);
      node2.setPluginData("contentHash", hash);
      this.registerMapping(bubble.id, node2.id, bubble.type);
    }
  }

  /** 개별 버블 추가 (실시간 동기화) */
  async addBubble(bubble: BubbleData): Promise<void> {
    const frame = this.findExistingNode(`page_${bubble.pageIndex}`) as FrameNode | null;
    if (!frame) {
      this.respond({ type: "SYNC_ERROR", id: bubble.id, error: `페이지 ${bubble.pageIndex} 프레임 없음` });
      return;
    }
    const node = await this.factory.createBubbleNode(frame, bubble);
    node.setPluginData("contentHash", simpleHash(JSON.stringify(bubble)));
    this.registerMapping(bubble.id, node.id, bubble.type);
    this.respond({ type: "SYNC_OK", id: bubble.id, figmaNodeId: node.id });
  }

  /** 개별 버블 업데이트 (실시간 동기화) */
  async updateBubble(bubble: BubbleData): Promise<void> {
    var existing = this.findExistingNode(bubble.id);
    if (!existing) {
      // 노드가 없으면 새로 생성
      return this.addBubble(bubble);
    }
    // 기존 노드 삭제 후 새로 생성 (모든 스타일 변경 확실히 반영)
    var frame = existing.parent as FrameNode;
    existing.remove();
    this.mappings.delete(bubble.id);
    var node = await this.factory.createBubbleNode(frame, bubble);
    node.setPluginData("contentHash", simpleHash(JSON.stringify(bubble)));
    this.registerMapping(bubble.id, node.id, bubble.type);
    this.respond({ type: "SYNC_OK", id: bubble.id, figmaNodeId: node.id });
  }

  /** 개별 버블 삭제 */
  deleteBubble(id: string): void {
    const existing = this.findExistingNode(id);
    if (existing) {
      existing.remove();
      this.mappings.delete(id);
      this.respond({ type: "SYNC_OK", id, figmaNodeId: "" });
    }
  }

  // ---- 정리 ----

  /** Figma에 있지만 웹앱에서 삭제된 버블 노드 제거 */
  private cleanupDeletedBubbles(frame: FrameNode, currentBubbles: BubbleData[]) {
    const currentIds = new Set(currentBubbles.map(b => b.id));

    for (const child of Array.from(frame.children)) {
      const webAppId = child.getPluginData("webAppId");
      const syncType = child.getPluginData("syncType");
      if (webAppId && syncType !== "page" && syncType !== "image" && !currentIds.has(webAppId)) {
        child.remove();
        this.mappings.delete(webAppId);
      }
    }
  }

  // ---- 유틸 ----

  private findExistingNode(webAppId: string): SceneNode | null {
    const mapping = this.mappings.get(webAppId);
    if (mapping) {
      try {
        return figma.getNodeById(mapping.figmaNodeId) as SceneNode | null;
      } catch {
        this.mappings.delete(webAppId);
      }
    }
    // 폴백: 트리 탐색
    if (this.episodePage) {
      return findNodeByWebAppId(this.episodePage, webAppId);
    }
    return null;
  }

  private registerMapping(webAppId: string, figmaNodeId: string, type: string) {
    this.mappings.set(webAppId, {
      webAppId,
      figmaNodeId,
      type: type as any,
      contentHash: "",
      lastSyncAt: Date.now(),
    });
  }

  // ---- 메시지 핸들러 (진입점) ----

  /** episodePage가 없거나 에피소드가 바뀌면 초기화 */
  private async ensureInit(episodeNum?: number): Promise<void> {
    var epNum = episodeNum || 1;
    // 이미 같은 에피소드로 초기화되어 있으면 스킵
    if (this.episodePage && this.currentEpisodeNum === epNum) return;

    // 에피소드 변경 → 매핑 초기화
    if (this.currentEpisodeNum !== epNum) {
      this.mappings.clear();
      console.log("[SyncEngine] 에피소드 변경: EP " + this.currentEpisodeNum + " → EP " + epNum);
    }

    this.currentEpisodeNum = epNum;
    var pageName = "Webtoon Sync - EP " + epNum;

    // 기존 페이지 탐색
    var existing = figma.root.children.find(function(p) { return p.name === pageName; });
    if (existing) {
      this.episodePage = existing;
    } else {
      this.episodePage = figma.createPage();
      this.episodePage.name = pageName;
    }
    figma.currentPage = this.episodePage;
    this.restoreMappings();
    this.respond({
      type: "STATUS",
      connected: true,
      pageCount: this.episodePage.children.length,
      lastSync: Date.now(),
    });
    console.log("[SyncEngine] Auto-initialized: " + pageName);
  }

  /** UI에서 전달받은 메시지를 처리 */
  async handleMessage(msg: IncomingMessage): Promise<void> {
    switch (msg.type) {
      case "INIT":
        await this.init(msg.payload.projectName, msg.payload.episodeNum);
        break;
      case "SYNC_PAGE":
        await this.ensureInit(msg.payload.episodeNum);
        await this.syncPage(msg.payload);
        break;
      case "BATCH_SYNC":
        var firstEp = Array.isArray(msg.payload) && msg.payload.length > 0 ? msg.payload[0].episodeNum : 1;
        await this.ensureInit(firstEp);
        await this.batchSync(msg.payload);
        break;
      case "ADD_BUBBLE":
        await this.ensureInit(msg.payload.pageIndex !== undefined ? 1 : 1);
        await this.addBubble(msg.payload);
        break;
      case "UPDATE_BUBBLE":
        await this.ensureInit();
        await this.updateBubble(msg.payload);
        break;
      case "DELETE_BUBBLE":
        this.deleteBubble(msg.payload.id);
        break;
      case "UPDATE_IMAGE":
        await this.ensureInit();
        if (this.episodePage) {
          const frame = this.findExistingNode("page_" + msg.payload.pageIndex) as FrameNode | null;
          if (frame) await this.syncImage(frame, msg.payload);
        }
        break;
      case "PING":
        this.respond({ type: "PONG" });
        break;
    }
  }
}
