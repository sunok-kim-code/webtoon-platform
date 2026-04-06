// ============================================================
// 유틸리티 함수
// ============================================================

/** hex 컬러 → Figma RGB (0~1 범위) */
export function hexToFigmaColor(hex: string): RGB {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/** base64 문자열 → Uint8Array (Figma 이미지 생성용) */
export function base64ToBytes(base64: string): Uint8Array {
  // data:image/png;base64, 접두사 제거
  const raw = base64.includes(",") ? base64.split(",")[1] : base64;
  const binaryStr = atob(raw);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/** 문자열의 간단한 해시값 생성 (변경 감지용) */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** Figma 노드에 커스텀 데이터 저장 (플러그인 재시작 시 매핑 복원용) */
export function setNodeMeta(node: SceneNode, webAppId: string, type: string) {
  node.setPluginData("webAppId", webAppId);
  node.setPluginData("syncType", type);
  node.setPluginData("lastSync", Date.now().toString());
}

/** Figma 노드에서 커스텀 데이터 읽기 */
export function getNodeMeta(node: SceneNode): { webAppId: string; syncType: string } | null {
  const webAppId = node.getPluginData("webAppId");
  const syncType = node.getPluginData("syncType");
  if (!webAppId) return null;
  return { webAppId, syncType };
}

/** 현재 페이지에서 webAppId로 노드 찾기 */
export function findNodeByWebAppId(parent: BaseNode & ChildrenMixin, webAppId: string): SceneNode | null {
  for (const child of parent.children) {
    if (child.getPluginData("webAppId") === webAppId) {
      return child;
    }
    if ("children" in child) {
      const found = findNodeByWebAppId(child as BaseNode & ChildrenMixin, webAppId);
      if (found) return found;
    }
  }
  return null;
}
