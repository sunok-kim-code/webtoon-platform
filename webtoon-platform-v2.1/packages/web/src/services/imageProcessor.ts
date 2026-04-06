// ============================================================
// 이미지 처리 서비스 (v2.1)
// 클라이언트 사이드 이미지 리사이즈, 포맷 변환, 썸네일 생성
// Firebase Storage 업로드 전 전처리
// ============================================================

// ─── 설정 ────────────────────────────────────────────────────

const THUMBNAIL_SIZE = 256;
const MAX_REFERENCE_SIZE = 1024; // 레퍼런스 이미지 최대 크기
const PANEL_EXPORT_QUALITY = 0.92;

// ─── Canvas 유틸리티 ─────────────────────────────────────────

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  return { canvas, ctx };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── 리사이즈 ────────────────────────────────────────────────

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number; // 0-1
  format?: "image/png" | "image/jpeg" | "image/webp";
}

export async function resizeImage(
  source: string | File | Blob,
  options: ResizeOptions
): Promise<Blob> {
  const src =
    typeof source === "string"
      ? source
      : URL.createObjectURL(source);

  try {
    const img = await loadImage(src);
    const { maxWidth, maxHeight, quality = 0.9, format = "image/jpeg" } = options;

    let w = img.naturalWidth;
    let h = img.naturalHeight;

    // 비율 유지 축소
    if (w > maxWidth || h > maxHeight) {
      const ratio = Math.min(maxWidth / w, maxHeight / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    const { canvas, ctx } = createCanvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        format,
        quality
      );
    });
  } finally {
    if (typeof source !== "string") {
      URL.revokeObjectURL(src);
    }
  }
}

// ─── 썸네일 생성 ─────────────────────────────────────────────

export async function createThumbnail(
  source: string | File | Blob,
  size: number = THUMBNAIL_SIZE
): Promise<Blob> {
  return resizeImage(source, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.8,
    format: "image/jpeg",
  });
}

// ─── 레퍼런스 이미지 전처리 ──────────────────────────────────

export async function processReferenceImage(file: File): Promise<{
  full: Blob;
  thumbnail: Blob;
  dimensions: { width: number; height: number };
}> {
  const full = await resizeImage(file, {
    maxWidth: MAX_REFERENCE_SIZE,
    maxHeight: MAX_REFERENCE_SIZE,
    quality: 0.9,
    format: "image/jpeg",
  });

  const thumbnail = await createThumbnail(file);

  // 원본 크기 확인
  const img = await loadImage(URL.createObjectURL(file));
  const dimensions = {
    width: img.naturalWidth,
    height: img.naturalHeight,
  };

  return { full, thumbnail, dimensions };
}

// ─── 패널 이미지 처리 ────────────────────────────────────────

export async function processPanelImage(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<Blob> {
  return resizeImage(imageUrl, {
    maxWidth: targetWidth,
    maxHeight: targetHeight,
    quality: PANEL_EXPORT_QUALITY,
    format: "image/png",
  });
}

// ─── Base64 ↔ Blob 변환 ─────────────────────────────────────

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType: string = "image/png"): Blob {
  const byteString = atob(base64.split(",")[1] || base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}

// ─── 내보내기 ────────────────────────────────────────────────

export const imageProcessor = {
  resizeImage,
  createThumbnail,
  processReferenceImage,
  processPanelImage,
  blobToBase64,
  base64ToBlob,
};
