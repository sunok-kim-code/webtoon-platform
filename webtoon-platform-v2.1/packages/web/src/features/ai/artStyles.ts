// ============================================================
// 아트 스타일 프리셋 정의 (index.html L2591–2697에서 추출)
// AI 이미지 생성 프롬프트의 스타일 접두사/접미사 관리
// ============================================================

export interface LoraConfig {
  path: string;
  scale: number;
}

export interface ArtStyleDef {
  name: string;
  prefix: string;
  charSuffix: string;
  bgSuffix: string;
  propSuffix: string;
  defaultGender?: string;
  loras?: LoraConfig[];
  /** 프로바이더별 스타일 오버라이드 매핑 (다른 스타일 키 또는 'none') */
  providerStyleMap?: Record<string, string>;
}

export type ArtStyleKey =
  | "naverWebtoon"
  | "manhwa"
  | "romanceWebtoon"
  | "blWebtoon"
  | "tlWebtoon"
  | "realistic"
  | "darkFantasy"
  | "actionWebtoon"
  | "murimWebtoon"
  | "watercolorWebtoon"
  | "none"
  | "custom";

export const ART_STYLES: Record<ArtStyleKey, ArtStyleDef> = {
  naverWebtoon: {
    name: "네이버 웹툰",
    prefix: "Korean Naver webtoon style, cartoon, clean bold linework, flat cel-shaded coloring, natural color palette matching the scene mood, professional digital illustration. ",
    charSuffix: ", clean bold linework, distinct facial features, expressive eyes, natural body proportions, flat cel-shaded coloring, webtoon character design, high quality",
    bgSuffix: ", clean digital painting, scene-appropriate lighting, moderate detail, Korean webtoon background style",
    propSuffix: ", clean linework, flat coloring, simple shading, webtoon object illustration",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.85 },
    ],
  },
  manhwa: {
    name: "만화 스타일",
    prefix: "Korean manhwa art style, cartoon, precise ink-like linework, cel shading with vivid colors, dynamic panel composition, detailed expressions. ",
    charSuffix: ", precise linework, detailed face and hair rendering, vivid cel shading, manhwa character style, high quality",
    bgSuffix: ", detailed environment art, depth and perspective, manhwa background style",
    propSuffix: ", precise linework, detailed shading, manhwa object illustration",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.8 },
    ],
  },
  romanceWebtoon: {
    name: "로맨스 웹툰",
    prefix: "Korean romance webtoon style, cartoon, semi-realistic anime art, beautifully detailed eyes and hair, smooth digital painting, delicate linework, elegant composition. ",
    charSuffix: ", beautifully detailed eyes and hair, semi-realistic anime proportions, smooth skin rendering, elegant character design, high quality",
    bgSuffix: ", atmospheric mood lighting matching the scene emotion, cinematic depth of field, elegant composition, high quality",
    propSuffix: ", delicate rendering, soft shading, elegant illustration style",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.7 },
    ],
    providerStyleMap: {
      grok: "naverWebtoon",
      ninjaChat: "none",
    },
  },
  blWebtoon: {
    name: "BL 웹툰",
    prefix: "Korean BL (Boys Love) webtoon style, cartoon, semi-realistic anime art, beautifully detailed eyes and hair, smooth digital painting, delicate linework, elegant composition, bishounen character design, all characters are male. ",
    charSuffix: ", beautifully detailed eyes and hair, semi-realistic anime proportions, bishounen male character design, sharp jawline, tall elegant male proportions, smooth skin rendering, high quality",
    bgSuffix: ", atmospheric romantic mood lighting, cinematic depth of field, elegant composition, soft warm tones, high quality",
    propSuffix: ", delicate rendering, soft shading, elegant illustration style",
    defaultGender: "male",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.7 },
    ],
    providerStyleMap: {
      grok: "naverWebtoon",
      ninjaChat: "none",
    },
  },
  tlWebtoon: {
    name: "TL 웹툰 (성인)",
    prefix: "Korean adult webtoon (TL/mature) style, semi-realistic detailed art, anatomically accurate and expressive character rendering, sensual atmosphere, rich skin tones with detailed highlights and shadows on bare skin, intimate close-up compositions, soft warm cinematic lighting emphasizing body contours, smooth gradient shading, high detail on facial expressions and body language, mature romance illustration. ",
    charSuffix: ", beautifully detailed eyes and hair, semi-realistic proportions, detailed skin rendering with natural highlights, expressive eyes and lips, smooth skin texture, elegant character design, high quality",
    bgSuffix: ", atmospheric lighting, warm soft tones, cinematic depth of field, mood-driven environment, detailed interior settings, high quality",
    propSuffix: ", delicate detailed rendering, soft warm lighting, elegant object illustration",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.6 },
    ],
    providerStyleMap: {
      grok: "naverWebtoon",
      ninjaChat: "none",
    },
  },
  realistic: {
    name: "사실적 (Realistic)",
    prefix: "Photorealistic digital art, cinematic lighting, highly detailed textures and materials, professional illustration quality. ",
    charSuffix: ", photorealistic rendering, accurate anatomy, detailed skin and hair textures, cinematic portrait lighting, high quality",
    bgSuffix: ", photorealistic environment, physically accurate lighting, detailed textures, cinematic composition",
    propSuffix: ", photorealistic rendering, accurate material textures, studio lighting",
  },
  darkFantasy: {
    name: "다크 판타지",
    prefix: "Dark fantasy art style, rich deep color palette, intricate details, painterly brushwork, dramatic contrast between light and shadow. ",
    charSuffix: ", painterly rendering, intricate costume details, dramatic rim lighting, dark fantasy character design, high quality",
    bgSuffix: ", rich atmospheric depth, dramatic light and shadow contrast, intricate environmental details, painterly style",
    propSuffix: ", ornate details, dark metallic and mystical textures, painterly rendering",
  },
  actionWebtoon: {
    name: "액션 웹툰",
    prefix: "Korean action webtoon style, cartoon, bold confident linework, high contrast shading, intense dramatic lighting, impactful composition, sharp details, vivid saturated colors. ",
    charSuffix: ", bold confident linework, sharp detailed features, strong physique rendering, intense eyes, action webtoon character design, high quality",
    bgSuffix: ", high contrast dramatic lighting, dynamic perspective, detailed destruction or environmental effects where appropriate",
    propSuffix: ", bold linework, sharp metallic or weapon-like rendering, high contrast shading",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.85 },
    ],
  },
  murimWebtoon: {
    name: "무협 웹툰 (태존비록)",
    prefix: "High-resolution modern Korean webtoon (manhwa) style, cartoon, clean precise linework with rich gradient soft shading (not flat cel-shading), refined slightly idealized yet realistic character proportions, deep muted color palette with dark greens browns and grays, scene-adaptive realistic lighting with emotional color filters, cinematic panel composition. ",
    charSuffix: ", expressive deep emotional eyes with fine under-eye shadows and detailed iris texture, sharp nose and jawline, realistic fabric wrinkles and material texture on clothing, natural hair highlights, refined slightly idealized realistic proportions, distinct individual character design, high quality",
    bgSuffix: ", deep muted sophisticated color tones, scene-mood-adaptive realistic lighting, emotional color filter when appropriate (red tint for anger, gray tone for sorrow), natural highlights on metallic objects, detailed but grounded atmosphere",
    propSuffix: ", realistic material texture rendering, natural light highlights on metal and reflective surfaces, rich gradient shading, detailed craftsmanship, energy glow or impact effects when appropriate",
    loras: [
      { path: "https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors", scale: 0.85 },
    ],
  },
  watercolorWebtoon: {
    name: "수채화 웹툰",
    prefix: "korean webtoon style, manhwa illustration, watercolor webtoon, soft watercolor painting, delicate thin linework, fine clean outlines, minimal line weight, soft watercolor texture, translucent watercolor washes, blended soft shading, smooth color gradients, painterly style, gentle edges, artistic digital watercolor, vibrant yet soft color palette, detailed yet soft facial features. ",
    charSuffix: ", soft watercolor texture, delicate thin linework, translucent watercolor washes, blended soft shading, detailed yet soft facial features, vibrant yet soft color palette, high quality",
    bgSuffix: ", soft watercolor painting, translucent watercolor washes, smooth color gradients, gentle edges, atmospheric watercolor background, high quality",
    propSuffix: ", soft watercolor texture, delicate linework, gentle edges, watercolor object illustration",
  },
  none: {
    name: "스타일 없음",
    prefix: "",
    charSuffix: "",
    bgSuffix: "",
    propSuffix: "",
  },
  custom: {
    name: "사용자 정의",
    prefix: "",
    charSuffix: "",
    bgSuffix: "",
    propSuffix: "",
  },
};

/** 스타일 키 목록 (UI 선택용) */
export const ART_STYLE_KEYS = Object.keys(ART_STYLES) as ArtStyleKey[];

/** 스타일 이름 → 키 역매핑 */
export function getStyleKeyByName(name: string): ArtStyleKey | undefined {
  return ART_STYLE_KEYS.find((k) => ART_STYLES[k].name === name);
}
