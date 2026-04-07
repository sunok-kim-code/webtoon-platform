// ============================================================
// Prompt Rules — 패널 이미지 생성 프롬프트 품질 규칙
// 에피소드 분석 후 패널 프롬프트 조립 시 적용되는 규칙 모음
// 별도 파일로 분리하여 수정·확장이 용이하도록 구성
// ============================================================

// ─── 규칙 타입 정의 ────────────────────────────────────────

export interface PromptRule {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
}

// ─── 기본 규칙 목록 ────────────────────────────────────────

export const PROMPT_RULES: PromptRule[] = [
  // ── 기존 규칙 ──
  {
    id: "no_redundancy",
    name: "No Redundancy",
    enabled: true,
    description:
      "Composition 섹션에 Characters의 동작을 그대로 복사하지 않는다. Composition은 오직 카메라 앵글, 인물 배치, 렌즈 거리감에 집중한다.",
  },
  {
    id: "visual_narrative",
    name: "Visual Narrative",
    enabled: true,
    description:
      "인물이 등을 돌리고 있다면 표정 대신 '어깨의 긴장감'이나 '보폭' 같은 신체 언어로 심리를 묘사한다.",
  },
  {
    id: "lighting_details",
    name: "Lighting Details",
    enabled: true,
    description:
      "조명은 단순히 '밝음'이 아니라 '실내 조명(Warm/Cool)'이나 '자연광'의 느낌을 구체적으로 서술한다.",
  },
  {
    id: "spatial_depth",
    name: "Spatial Depth",
    enabled: true,
    description:
      "캐릭터 간의 전후 관계(Depth)를 명시하여 평면적이지 않은 구도를 만든다.",
  },
  {
    id: "reference_tags",
    name: "Reference Tags",
    enabled: true,
    description:
      "기존의 [ref:...] 형식은 반드시 유지하여 일관성을 확보한다.",
  },

  // ── 에피소드 분석 규칙 (구조적 원칙) ──
  {
    id: "single_point_setting",
    name: "Single Point Setting",
    enabled: true,
    description:
      "Setting에는 이동 경로를 포함하지 않는다. 패널 하나에 장소는 반드시 단일 지점만 기술한다.",
  },

  // ── 에피소드 분석 규칙 (필드별 규칙) ──
  {
    id: "emotion_appearance",
    name: "Emotion via Appearance",
    enabled: true,
    description:
      "캐릭터의 감정을 표정뿐 아니라 외형 변화(머리카락 흩날림, 옷 주름, 손 떨림, 눈물 자국 등)로 시각화한다.",
  },
  {
    id: "three_layer_composition",
    name: "Three-Layer Composition",
    enabled: true,
    description:
      "Composition에서 전경(foreground), 중경(midground), 후경(background) 3단 레이어를 의식하여 깊이감을 강화한다.",
  },
  {
    id: "psychological_distance",
    name: "Psychological Distance",
    enabled: true,
    description:
      "캐릭터 간 심리적 거리를 물리적 배치(가까이/멀리, 같은 높이/다른 높이)로 표현한다.",
  },

  // ── 에피소드 분석 규칙 (연속성 규칙) ──
  {
    id: "action_anchoring",
    name: "Action Anchoring",
    enabled: true,
    description:
      "이전 패널의 포즈나 동작에서 이어지는 연속성을 명시한다. (예: 'Continuing from the previous walking pose…')",
  },
  {
    id: "state_change_description",
    name: "State Change Description",
    enabled: true,
    description:
      "이전 패널 대비 캐릭터의 상태 변화(표정, 자세, 위치)를 상대적으로 서술한다.",
  },
  {
    id: "camera_consistency",
    name: "Camera Consistency",
    enabled: true,
    description:
      "같은 씬 내에서는 카메라 앵글의 일관성을 유지한다. 급격한 앵글 변화가 필요할 경우 명시적으로 전환 의도를 표기한다.",
  },
];

// ─── 패널 컨텍스트 (프롬프트 조립에 필요한 정보) ─────────────

export interface PanelPromptContext {
  /** 패널 씬 설명 (한국어) */
  description: string;
  /** 캐릭터 토큰 (예: "지호(기쁨, walking), 민지(슬픔)") */
  charTokens: string;
  /** 패널 장소 이름 */
  locationName: string;
  /** 시간대 라벨 (morning, afternoon 등) */
  timeLabel: string;
  /** 분위기 라벨 (warm, tense 등) */
  moodLabel: string;
  /** 카메라 앵글 (wide shot, close-up 등) */
  cameraAngle: string;
  /** 원본 composition 텍스트 (분석 결과에서 온 것) */
  rawComposition: string;
  /** 레퍼런스 태그 문자열 (예: "[ref:outfit/지호_school, ref:location/교실]") */
  refTags: string;
  /** 캐릭터 수 */
  characterCount: number;
  /** 캐릭터별 앵글 정보 (back, side 등) */
  characterAngles?: Record<string, string>;

  // ── 연속성 규칙용 (이전 패널 정보) ──
  /** 이전 패널의 캐릭터 동작/포즈 요약 */
  prevAction?: string;
  /** 이전 패널의 캐릭터 상태 (표정, 자세, 위치 등) */
  prevCharState?: string;
  /** 이전 패널의 카메라 앵글 */
  prevCameraAngle?: string;
  /** 현재 씬 ID (같은 씬인지 판단용) */
  sceneId?: string;
  /** 이전 패널의 씬 ID */
  prevSceneId?: string;
}// ============================================================


// ══════════════════════════════════════════════════════════════
// applyPromptRules — 활성화된 규칙을 프롬프트에 적용
// ══════════════════════════════════════════════════════════════

export function applyPromptRules(ctx: PanelPromptContext): string {
  const enabledRules = PROMPT_RULES.filter((r) => r.enabled);
  const ruleIds = new Set(enabledRules.map((r) => r.id));

  // ── Characters 섹션 ──
  let charactersSection = ctx.charTokens
    ? `Characters: ${ctx.charTokens}.`
    : "";

  // [visual_narrative] 뒷모습 캐릭터 → 신체 언어 힌트 추가
  if (ruleIds.has("visual_narrative") && ctx.characterAngles) {
    const backChars = Object.entries(ctx.characterAngles)
      .filter(([_, angle]) => angle === "back")
      .map(([name]) => name);
    if (backChars.length > 0) {
      charactersSection += ` (${backChars.join(", ")}: convey emotion through body language — shoulder tension, stride, posture — not facial expression.)`;
    }
  }

  // [emotion_appearance] 외형 변화로 감정 시각화
  if (ruleIds.has("emotion_appearance") && ctx.charTokens) {
    charactersSection += " Visualize emotions through appearance changes (hair movement, clothing wrinkles, trembling hands, tear marks) beyond facial expressions.";
  }

  // ── Setting 섹션 ──
  let settingSection = `Setting: ${ctx.locationName}`;
  if (ctx.timeLabel) settingSection += `, ${ctx.timeLabel}`;
  if (ctx.moodLabel) settingSection += `, ${ctx.moodLabel}`;
  settingSection += ".";

  // [single_point_setting] 단일 지점만 기술
  if (ruleIds.has("single_point_setting")) {
    settingSection += " (Single point only — do not include travel routes or multiple locations.)";
  }

  // ── Lighting 섹션 (lighting_details 규칙) ──
  let lightingSection = "";
  if (ruleIds.has("lighting_details")) {
    lightingSection = buildLightingHint(ctx.timeLabel, ctx.moodLabel);
  }

  // ── Camera 섹션 ──
  let cameraSection = `Camera: ${ctx.cameraAngle}.`;

  // [camera_consistency] 같은 씬 내 카메라 앵글 일관성
  if (
    ruleIds.has("camera_consistency") &&
    ctx.prevCameraAngle &&
    ctx.sceneId &&
    ctx.sceneId === ctx.prevSceneId
  ) {
    if (ctx.cameraAngle !== ctx.prevCameraAngle) {
      cameraSection += ` (Intentional angle shift from ${ctx.prevCameraAngle} — maintain visual continuity.)`;
    }
  }

  // ── Composition 섹션 ──
  let compositionSection = "";
  if (ctx.rawComposition) {
    let comp = ctx.rawComposition;

    // [no_redundancy] Characters 동작과 중복되는 내용 제거
    if (ruleIds.has("no_redundancy")) {
      comp = stripCharacterActions(comp, ctx.charTokens);
      if (!comp.trim()) {
        comp = `${ctx.cameraAngle} framing, character placement focus`;
      }
    }

    // [spatial_depth] 캐릭터 2명 이상이면 depth 힌트 추가
    if (ruleIds.has("spatial_depth") && ctx.characterCount >= 2) {
      comp +=
        ". Emphasize spatial depth between characters (foreground/background layering)";
    }

    // [three_layer_composition] 전경/중경/후경 3단 레이어
    if (ruleIds.has("three_layer_composition")) {
      comp +=
        ". Reinforce depth with three-layer composition: foreground, midground, background";
    }

    // [psychological_distance] 심리적 거리를 물리적 배치로 표현
    if (ruleIds.has("psychological_distance") && ctx.characterCount >= 2) {
      comp +=
        ". Express psychological distance through physical placement (proximity, height difference)";
    }

    compositionSection = `Composition: ${comp}.`;
  } else if (ruleIds.has("spatial_depth") && ctx.characterCount >= 2) {
    compositionSection = `Composition: ${ctx.cameraAngle} framing with spatial depth between characters (foreground/background layering).`;
  }

  // ── Reference Tags 섹션 ──
  const refSection = ctx.refTags || "";

  // ── Continuity 섹션 (연속성 규칙) ──
  let continuitySection = "";
  const continuityParts: string[] = [];

  // [action_anchoring] 이전 패널 동작 연속성
  if (ruleIds.has("action_anchoring") && ctx.prevAction) {
    continuityParts.push(
      `Continuing from previous action: ${ctx.prevAction}`
    );
  }

  // [state_change_description] 이전 패널 대비 상태 변화
  if (ruleIds.has("state_change_description") && ctx.prevCharState) {
    continuityParts.push(
      `State change from previous panel: ${ctx.prevCharState}`
    );
  }

  if (continuityParts.length > 0) {
    continuitySection = `Continuity: ${continuityParts.join(". ")}.`;
  }

  // ── 최종 조립 ──
  return [
    `webtoon panel.`,
    ctx.description,
    charactersSection,
    settingSection,
    lightingSection,
    cameraSection,
    compositionSection,
    refSection,
    continuitySection,
  ]
    .filter(Boolean)
    .join(" ");
}

// ══════════════════════════════════════════════════════════════
// 여퍼 함수
// ══════════════════════════════════════════════════════════════

function buildLightingHint(timeLabel: string, moodLabel: string): string {
  const timeLower = (timeLabel || "").toLowerCase();
  const moodLower = (moodLabel || "").toLowerCase();

  let lighting = "Lighting:";

  // 시간대 기반
  if (
    timeLower.includes("morning") ||
    timeLower === "아침" ||
    timeLower === "오전"
  ) {
    lighting += " soft natural morning light with gentle warm tones";
  } else if (
    timeLower.includes("afternoon") ||
    timeLower === "낮" ||
    timeLower === "오후"
  ) {
    lighting += " bright natural daylight";
  } else if (
    timeLower.includes("evening") ||
    timeLower === "저녁" ||
    timeLower === "석양"
  ) {
    lighting += " warm golden-hour light with long shadows";
  } else if (
    timeLower.includes("night") ||
    timeLower === "밤" ||
    timeLower === "야간"
  ) {
    lighting += " cool ambient night lighting with artificial light sources";
  } else {
    lighting += " natural ambient light";
  }

  // 분위기 기반 보정
  if (moodLower === "warm" || moodLower === "따뜻") {
    lighting += ", warm interior glow";
  } else if (moodLower === "cold" || moodLower === "차가운") {
    lighting += ", cool blue-tinted light";
  } else if (moodLower === "tense" || moodLower === "긴장") {
    lighting += ", harsh directional light with deep shadows";
  } else if (moodLower === "dark" || moodLower === "어둠") {
    lighting += ", dim low-key lighting";
  } else if (moodLower === "peaceful" || moodLower === "평화") {
    lighting += ", diffused soft light";
  }

  return lighting + ".";
}

function stripCharacterActions(
  composition: string,
  charTokens: string
): string {
  if (!charTokens) return composition;

  const actionWords = charTokens
    .replace(/[()]/g, " ")
    .split(/[,\s]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 2);

  let result = composition;
  for (const word of actionWords) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
    result = result.replace(regex, "");
  }

  return result
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
