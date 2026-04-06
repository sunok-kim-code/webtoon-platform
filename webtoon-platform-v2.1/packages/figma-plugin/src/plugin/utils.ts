// ============================================================
// 유틸리티 함수
// ============================================================

/** hex 컬러 → Figma RGB (0~1 범위). 'none', 'transparent', 잘못된 값은 기본 검정 반환 */
export function hexToFigmaColor(hex: string): RGB {
  if (!hex || hex === 'none' || hex === 'transparent') {
    return { r: 0, g: 0, b: 0 };
  }
  var clean = hex.replace("#", "");
  // 3자리 hex (#fff → ffffff)
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  var r = parseInt(clean.substring(0, 2), 16) / 255;
  var g = parseInt(clean.substring(2, 4), 16) / 255;
  var b = parseInt(clean.substring(4, 6), 16) / 255;
  // NaN 방지
  if (isNaN(r)) r = 0;
  if (isNaN(g)) g = 0;
  if (isNaN(b)) b = 0;
  return { r: r, g: g, b: b };
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

/** URL에서 이미지 바이트를 다운로드 */
export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    console.log("[fetchImageBytes] 다운로드 시작:", url.substring(0, 100) + "...");
    var response = await fetch(url);
    if (!response.ok) {
      console.warn("[fetchImageBytes] HTTP 에러:", response.status, response.statusText);
      return null;
    }
    var buffer = await response.arrayBuffer();
    console.log("[fetchImageBytes] 다운로드 완료:", buffer.byteLength, "bytes");
    return new Uint8Array(buffer);
  } catch (e) {
    console.warn("[fetchImageBytes] 다운로드 실패:", e);
    return null;
  }
}

/** 이미지 데이터에서 바이트를 가져오기 (storageUrl 우선, base64 대체) */
export async function getImageBytes(imageData: { base64?: string; storageUrl?: string }): Promise<Uint8Array | null> {
  console.log("[getImageBytes] storageUrl:", !!imageData.storageUrl, "base64 len:", (imageData.base64 || "").length);
  // storageUrl이 있으면 URL에서 다운로드
  if (imageData.storageUrl && imageData.storageUrl.length > 10) {
    return fetchImageBytes(imageData.storageUrl);
  }
  // base64 데이터가 있으면 변환
  if (imageData.base64 && imageData.base64.length > 10) {
    return base64ToBytes(imageData.base64);
  }
  console.warn("[getImageBytes] 이미지 소스 없음");
  return null;
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
