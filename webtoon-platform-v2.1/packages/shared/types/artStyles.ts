// ============================================================
// Art Style System (V1 포팅)
// 아트 스타일 프리셋 + 캐릭터 프롬프트 빌더
// ============================================================

/** 아트 스타일 프리셋 정의 */
export interface ArtStylePreset {
  name: string;
  prefix: string;       // 이미지 프롬프트 앞에 붙는 스타일 접두어
  charSuffix: string;   // 캐릭터 이미지 후미 스타일 지시
  bgSuffix: string;     // 배경 이미지 후미 스타일 지시
  propSuffix: string;   // 소품 이미지 후미 스타일 지시
}

export const ART_STYLES: Record<string, ArtStylePreset> = {
  naverWebtoon: {
    name: "네이버 웹툰",
    prefix: "Korean Naver webtoon style, cartoon, clean bold linework, flat cel-shaded coloring, natural color palette matching the scene mood, professional digital illustration. ",
    charSuffix: ", clean bold linework, distinct facial features, expressive eyes, natural body proportions, flat cel-shaded coloring, webtoon character design, high quality",
    bgSuffix: ", clean digital painting, scene-appropriate lighting, moderate detail, Korean webtoon background style",
    propSuffix: ", clean linework, flat coloring, simple shading, webtoon object illustration",
  },
  manhwa: {
    name: "만화 스타일",
    prefix: "Korean manhwa art style, cartoon, precise ink-like linework, cel shading with vivid colors, dynamic panel composition, detailed expressions. ",
    charSuffix: ", precise linework, detailed face and hair rendering, vivid cel shading, manhwa character style, high quality",
    bgSuffix: ", detailed environment art, depth and perspective, manhwa background style",
    propSuffix: ", precise linework, detailed shading, manhwa object illustration",
  },
  romanceWebtoon: {
    name: "로맨스 웹툰",
    prefix: "Korean romance webtoon style, cartoon, semi-realistic anime art, beautifully detailed eyes and hair, smooth digital painting, delicate linework, elegant composition. ",
    charSuffix: ", beautifully detailed eyes and hair, semi-realistic anime proportions, smooth skin rendering, elegant character design, high quality",
    bgSuffix: ", atmospheric mood lighting matching the scene emotion, cinematic depth of field, elegant composition, high quality",
    propSuffix: ", delicate rendering, soft shading, elegant illustration style",
  },
  blWebtoon: {
    name: "BL 웹툰",
    prefix: "Korean BL (Boys Love) webtoon style, cartoon, semi-realistic anime art, beautifully detailed eyes and hair, smooth digital painting, delicate linework, elegant composition, bishounen character design, all characters are male. ",
    charSuffix: ", beautifully detailed eyes and hair, semi-realistic anime proportions, bishounen male character design, sharp jawline, tall elegant male proportions, smooth skin rendering, high quality",
    bgSuffix: ", atmospheric romantic mood lighting, cinematic depth of field, elegant composition, soft warm tones, high quality",
    propSuffix: ", delicate rendering, soft shading, elegant illustration style",
  },
  tlWebtoon: {
    name: "TL 웹툰 (성인)",
    prefix: "Korean adult webtoon (TL/mature) style, semi-realistic detailed art, anatomically accurate and expressive character rendering, sensual atmosphere, rich skin tones with detailed highlights and shadows on bare skin, intimate close-up compositions, soft warm cinematic lighting emphasizing body contours, smooth gradient shading, high detail on facial expressions and body language, mature romance illustration. ",
    charSuffix: ", beautifully detailed eyes and hair, semi-realistic proportions, detailed skin rendering with natural highlights, expressive eyes and lips, smooth skin texture, elegant character design, high quality",
    bgSuffix: ", atmospheric lighting, warm soft tones, cinematic depth of field, mood-driven environment, detailed interior settings, high quality",
    propSuffix: ", delicate detailed rendering, soft warm lighting, elegant object illustration",
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
  },
  murimWebtoon: {
    name: "무협 웹툰",
    prefix: "High-resolution modern Korean webtoon (manhwa) style, cartoon, clean precise linework with rich gradient soft shading (not flat cel-shading), refined slightly idealized yet realistic character proportions, deep muted color palette with dark greens browns and grays, scene-adaptive realistic lighting with emotional color filters, cinematic panel composition. ",
    charSuffix: ", expressive deep emotional eyes with fine under-eye shadows and detailed iris texture, sharp nose and jawline, realistic fabric wrinkles and material texture on clothing, natural hair highlights, refined slightly idealized realistic proportions, distinct individual character design, high quality",
    bgSuffix: ", deep muted sophisticated color tones, scene-mood-adaptive realistic lighting, emotional color filter when appropriate, natural highlights on metallic objects, detailed but grounded atmosphere",
    propSuffix: ", realistic material texture rendering, natural light highlights on metal and reflective surfaces, rich gradient shading, detailed craftsmanship",
  },
  custom: {
    name: "사용자 정의",
    prefix: "",
    charSuffix: "",
    bgSuffix: "",
    propSuffix: "",
  },
};

/** 기본 아트 스타일 키 */
export const DEFAULT_ART_STYLE = "naverWebtoon";

/** 아트 스타일 키 목록 (custom 제외 UI용) */
export const ART_STYLE_KEYS = Object.keys(ART_STYLES).filter(k => k !== "custom") as string[];

// ─── 캐릭터 레퍼런스 프롬프트 빌더 (V1 buildCharRefPrompt 포팅) ───

import type { CharacterTraits } from "./reference";

export interface CharacterPromptData {
  name: string;
  refPrompt?: string;           // Gemini가 생성한 구조화된 레퍼런스 프롬프트
  appearance?: string;          // 상세 외모 설명
  outfit?: string;              // 현재 의상
  accessories?: string;         // 소품
  distinctFeatures?: string;    // 고유 시각 특성 (다른 캐릭터와 구별점)
  promptSnippet?: string;       // 기본 프롬프트 스니펫
  traits?: CharacterTraits;     // 시각 특성 (구조화된 필드)
}

/**
 * CharacterTraits → 상세 외모 설명 문자열로 변환
 */
export function buildAppearanceFromTraits(traits: CharacterTraits): string {
  const parts: string[] = [];
  if (traits.gender) parts.push(traits.gender);
  if (traits.age) parts.push(`${traits.age} years old` === traits.age ? traits.age : traits.age);
  if (traits.height) {
    // "175cm" 같은 구체적 수치는 그대로, "tall" 같은 서술형은 "~ height" 추가
    const h = traits.height.trim();
    parts.push(/\d/.test(h) ? h : `${h} height`);
  }
  if (traits.bodyType) parts.push(`${traits.bodyType} body type`);
  if (traits.skinTone) parts.push(`${traits.skinTone} skin`);
  if (traits.faceShape) parts.push(`${traits.faceShape} face`);
  if (traits.hairStyle || traits.hairColor) {
    const hair = [traits.hairColor, traits.hairStyle].filter(Boolean).join(" ");
    parts.push(`${hair} hair`);
  }
  if (traits.eyeColor || traits.eyeShape) {
    const eyes = [traits.eyeShape, traits.eyeColor].filter(Boolean).join(" ");
    parts.push(`${eyes} eyes`);
  }
  if (traits.distinctFeatures) parts.push(traits.distinctFeatures);
  return parts.join(", ");
}

export interface CharRefPromptOptions {
  artStyleKey?: string;         // ART_STYLES 키
  outfitOverride?: {            // 의상 프리셋 오버라이드
    outfit: string;
    accessories?: string;
  };
  otherCharacters?: CharacterPromptData[];  // 대비용 다른 캐릭터들
  customPrompt?: string;        // 사용자 직접 입력 프롬프트
}

/**
 * V1 스타일의 상세 캐릭터 레퍼런스 프롬프트를 빌드합니다.
 * refPrompt + distinctFeatures + artStyle charSuffix + contrastSuffix
 */
export function buildCharRefPrompt(
  char: CharacterPromptData,
  options: CharRefPromptOptions = {}
): string {
  // 1) 커스텀 프롬프트가 있으면 그대로 사용
  if (options.customPrompt) return options.customPrompt;

  // 2) 베이스: refPrompt 또는 기본 구조
  let base = char.refPrompt || "";

  if (!base) {
    // refPrompt가 없으면 기본 구조 생성
    base = `Full body character reference sheet, front-facing T-pose, clean white background.`;
    if (char.appearance) base += `. ${char.appearance}`;
    if (char.outfit) base += `. Outfit: ${char.outfit}`;
    if (char.accessories && char.accessories !== "none") base += `. Accessories: ${char.accessories}`;
    base += `. This character must be INSTANTLY recognizable and look IDENTICAL across all panels. Maintain strong visual identity.`;
  }

  // 3) 의상 오버라이드 (프리셋 레퍼런스 생성 시)
  if (options.outfitOverride) {
    const ov = options.outfitOverride;
    const newOutfitDesc = `Outfit: ${ov.outfit}${ov.accessories ? ". Accessories: " + ov.accessories : ""}.`;
    const outfitRegex = /Outfit:\s*\[?[^\].\n]*\]?\.?/i;
    const outfitRegex2 = /Outfit:\s*[^.]*\./i;
    if (outfitRegex.test(base)) {
      base = base.replace(outfitRegex, newOutfitDesc);
    } else if (outfitRegex2.test(base)) {
      base = base.replace(outfitRegex2, newOutfitDesc);
    }
    base += `\n\n[CRITICAL OUTFIT OVERRIDE] This character MUST wear EXACTLY: ${ov.outfit}.`;
    if (ov.accessories) base += ` Accessories: ${ov.accessories}.`;
    base += `\n[IDENTITY PRESERVATION] The character's face, hair color, hairstyle, eye color, eye shape, skin tone, facial features, and body type MUST remain EXACTLY THE SAME as the reference image. ONLY the outfit and accessories should change. Do NOT alter facial features, hair, or body proportions.`;
  }

  // 4) 고유 시각 특성
  if (char.distinctFeatures) {
    base += `\nThis character's unique visual identity: ${char.distinctFeatures}.`;
  }

  // 5) 스타일별 캐릭터 서픽스
  const styleKey = options.artStyleKey || DEFAULT_ART_STYLE;
  const style = ART_STYLES[styleKey];
  if (style?.charSuffix) {
    base += style.charSuffix;
  }

  // 6) 다른 캐릭터와 차별화 지시 — 제거됨 (프롬프트 길이 절약 및 불필요한 지시 방지)

  return base;
}

/**
 * 배경 레퍼런스 프롬프트를 빌드합니다.
 */
export function buildBgRefPrompt(
  name: string,
  description: string,
  artStyleKey: string = DEFAULT_ART_STYLE
): string {
  const style = ART_STYLES[artStyleKey];
  const prefix = style?.prefix || "";
  const suffix = style?.bgSuffix || "";
  return `${prefix}background concept art, environment design, ${name}, ${description || "detailed location"}, wide angle, no characters, atmospheric lighting, high quality, detailed${suffix}`;
}
