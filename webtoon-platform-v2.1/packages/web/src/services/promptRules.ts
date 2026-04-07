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
      "Characters = 캐릭터 상태(감정, 포즈, 외형 변화)만 기술한다. Composition = 카메라/레이아웃(앵글, 인물 배치, 렌즈 거리감)만 기술한다. 두 섹션 간 내용 중복 금지.",
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
      "조명은 단순히 '밝음/어둠'이 아니라 광원 유형(형광등, 자연광, 가로등 등)을 명시하고, '실내 Warm/Cool 조명', '창문 측면광' 등 구체적으로 서술한다.",
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
      "캐릭터의 감정을 추상적 감정 단어('슬픔', '기쁨')가 아닌 시각적 외형 변화로 기술한다. 예: 머리카락 흩날림, 옷 주름, 손 떨림, 눈물 자국, 주먹 꽉 쥠, 어깨 처짐 등.",
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

  // ── 레퍼런스 태그 강제 포함 ──
  {
    id: "ref_tags_in_characters",
    name: "Ref Tags in Characters",
    enabled: true,
    description:
      "Characters 섹션에 해당 캐릭터의 의상 레퍼런스 태그 [ref:outfit/...] 를 항상 포함한다. 뒷모습 캐릭터는 표정 대신 자세(posture)를 기술한다.",
  },
];

// ─── 추상 감정 → 시각적 신체 동작 매핑 ─────────────────────
// 추상적 감정 단어를 AI 이미지 생성에 적합한 구체적 신체 묘사로 변환
export const EMOTION_TO_VISUAL: Record<string, string> = {
  // 한국어
  "기쁨": "bright smile, relaxed shoulders, eyes crinkling",
  "슬픔": "downcast eyes, slumped shoulders, lips pressed together",
  "분노": "clenched jaw, furrowed brows, tense posture",
  "놀람": "wide eyes, eyebrows raised, mouth slightly open, body leaning back",
  "공포": "wide eyes, tense shoulders, hands trembling slightly",
  "차분": "relaxed posture, calm steady gaze, hands resting naturally",
  "사랑": "soft gaze, gentle smile, slightly tilted head",
  "혐오": "nose slightly wrinkled, lips turned down, leaning away",
  "걱정": "furrowed brows, biting lower lip, hands clasped tightly",
  "피곤": "half-closed eyes, slouched posture, head slightly drooping",
  // 영어 (fallback)
  "joy": "bright smile, relaxed shoulders, eyes crinkling",
  "sadness": "downcast eyes, slumped shoulders, lips pressed together",
  "anger": "clenched jaw, furrowed brows, tense posture",
  "surprise": "wide eyes, eyebrows raised, mouth slightly open, body leaning back",
  "fear": "wide eyes, tense shoulders, hands trembling slightly",
  "neutral": "relaxed posture, calm steady gaze, hands resting naturally",
  "love": "soft gaze, gentle smile, slightly tilted head",
  "disgust": "nose slightly wrinkled, lips turned down, leaning away",
};

// 단순 상태 동작 → 구체적 포즈 보강
export const STATIC_ACTION_ENHANCE: Record<string, string> = {
  "서 있는": "standing with weight on one leg",
  "앉아 있는": "seated with hands on lap",
  "누워 있는": "lying with body slightly curled",
  "걷는": "mid-stride with arms swaying",
  "standing": "standing with weight shifted",
  "sitting": "seated comfortably",
  "lying": "lying with body slightly turned",
  "walking": "mid-stride with arms in motion",
};

// ─── 규칙2: 동적 액션 → 정적 상태 순화 (Softened Interaction) ──
// AI가 힘을 과도하게 넣는 동사를 부드러운 '상태/접촉' 묘사로 순화
export const ACTION_SOFTENER: Record<string, string> = {
  // 영어
  "clenching the sheet": "hand resting on the wrinkled sheet",
  "clenching": "lightly gripping",
  "gripping tightly": "hand resting on",
  "tightly gripping": "lightly holding",
  "white-knuckled fists": "loosely curled fingers",
  "tossing and turning": "lying restlessly with messy hair",
  "wide eyes": "blankly staring",
  "eyes wide open": "gazing with a hollow look",
  "trembling hands": "slightly unsteady hands",
  "fists tightly balled": "loosely curled fists",
  "leaning forward aggressively": "leaning slightly forward",
  "breaking out in cold sweat": "a tired, weary look",
  "cold sweat": "a tired, weary look",
  "tense shoulders": "subtle anxiety in the posture",
  "body leaning backward": "slightly pulling back",
  // 한국어
  "꽉 쥐다": "주름진 시트에 손을 얹다",
  "뒤척이다": "머리카락이 흐트러진 채 누워 있다",
  "눈을 크게 뜨다": "멍하니 응시하다",
  "식은땀": "지친 기색",
  "경직된 어깨": "자세에 깃든 미묘한 불안함",
};

// ─── 규칙5: 감정의 담백한 묘사 (Subtle Emotion) ────────────
// 자극적 감정 단어 → 부드러운 우회 표현
export const EMOTION_SOFTENER: Record<string, string> = {
  "horror": "unease",
  "terror": "quiet anxiety",
  "panic": "restless unease",
  "agony": "weariness",
  "anguish": "quiet sorrow",
  "rage": "frustration",
  "fury": "simmering irritation",
  "screaming": "exhaling sharply",
  "공포": "불안",
  "공포감": "긴장감",
  "절망": "무기력",
  "고통": "피곤함",
  "분노": "답답함",
};

// ─── Subject 정보 (캐릭터별 개별 항목) ─────────────────────

export interface SubjectInfo {
  /** 캐릭터 이름 (영문 또는 한국어) */
  name: string;
  /** 성별: "Male" | "Female" */
  gender?: string;
  /** 의상 요약: "Suit", "White slip dress" 등 */
  outfit?: string;
  /** 현재 동작 묘사: "turning his body toward the entrance, holding a tablet PC" */
  action?: string;
  /** 위치/뷰: "foreground", "back view" 등 */
  position?: string;
  /** 표정/감정 (시각적): "wide eyes, surprised expression" */
  expression?: string;
  /** 의상 레퍼런스 태그 */
  outfitRef?: string;
}

// ─── 패널 컨텍스트 (프롬프트 조립에 필요한 정보) ─────────────

export interface PanelPromptContext {
  /** 캐릭터 토큰 (레거시, Subject 방식에서는 사용 안 함) */
  charTokens: string;
  /** Subject 배열 — 캐릭터별 구조화 정보 */
  subjects: SubjectInfo[];
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
}// ============================================================


// ══════════════════════════════════════════════════════════════
// applyPromptRules — 활성화된 규칙을 프롬프트에 적용
// ══════════════════════════════════════════════════════════════

export function applyPromptRules(ctx: PanelPromptContext): string {

  // ── 규칙2+5: 동작 순화 + 감정 담백화 헬퍼 ──
  function softenText(text: string): string {
    let result = text;
    // 동적 액션 → 정적 상태 순화
    for (const [intense, soft] of Object.entries(ACTION_SOFTENER)) {
      const re = new RegExp(intense.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      result = result.replace(re, soft);
    }
    // 자극적 감정 → 담백한 표현
    for (const [strong, gentle] of Object.entries(EMOTION_SOFTENER)) {
      const re = new RegExp(`\\b${strong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      result = result.replace(re, gentle);
    }
    return result;
  }

  // ── 1. Style (규칙1: 통합 스타일 — 아트 스타일은 PipelinePage에서 prefix로 관리,
  //    여기서는 충돌 방지용 기본 지시만) ──
  const styleSection = "Style: Consistent art style across character and background. NO mixed rendering techniques.";

  // ── 2. Setting (배경 + 규칙3: 조명 단일화 + 부정어 활용) ──
  const lightingHint = buildLightingShort(ctx.timeLabel, ctx.moodLabel);
  const settingParts = [ctx.locationName];
  if (ctx.timeLabel) settingParts.push(ctx.timeLabel);
  if (lightingHint) settingParts.push(lightingHint);
  // 규칙3: 강한 대비/극단적 어둠 금지
  settingParts.push("NO harsh contrast, NO extreme darkness");
  const settingSection = `Setting: ${settingParts.join(", ")}.`;

  // ── 3. Camera (규칙4: 비례 고정 — 환경과 인물의 정확한 스케일) ──
  let cameraWithScale = ctx.cameraAngle;
  // 규칙4: 비례 고정 힌트 추가
  cameraWithScale += ". Character is correctly scaled to the environment";
  const cameraSection = `Camera: ${cameraWithScale}.`;

  // ── 4. Subject N (캐릭터별 개별 항목 — 규칙2: 동작 순화, 규칙5: 감정 담백화 적용) ──
  const subjectSections: string[] = [];
  ctx.subjects.forEach((subj, i) => {
    const tag = [subj.gender, subj.outfit].filter(Boolean).join(", ");
    const label = tag ? `${subj.name} (${tag})` : subj.name;

    const details: string[] = [];

    // 동작: 단순 상태 동사면 보강, 그 후 순화 적용
    if (subj.action) {
      const enhanced = STATIC_ACTION_ENHANCE[subj.action];
      details.push(softenText(enhanced || subj.action));
    }

    if (subj.position) details.push(subj.position);

    // 감정: 추상 단어면 시각적 신체 묘사로 변환, 그 후 순화 적용
    if (subj.expression) {
      const visual = EMOTION_TO_VISUAL[subj.expression];
      if (visual) {
        details.push(softenText(visual));
      } else {
        details.push(softenText(subj.expression));
      }
    }

    // 뒷모습이면 body language 힌트 추가
    const isBack = ctx.characterAngles?.[subj.name] === "back" ||
                   subj.position?.includes("back view");
    if (isBack) {
      details.push("convey emotion through body language");
    }

    // 규칙5: 극단 표정 금지
    details.push("NO extreme facial expressions");

    const refTag = subj.outfitRef ? ` [${subj.outfitRef}]` : "";
    const detailStr = details.length > 0 ? `: ${details.join(", ")}` : "";
    subjectSections.push(`Subject ${i + 1}: ${label}${detailStr}.${refTag}`);
  });

  // ── 5. Depth (입체감 — 캐릭터 배치 포함) ──
  let depthSection = "";
  if (ctx.characterCount >= 2 && ctx.subjects.length >= 2) {
    const layers: string[] = [];
    const fgChar = ctx.subjects.find(s => s.position?.includes("foreground"));
    const mgChar = ctx.subjects.find(s => s.position?.includes("midground") || (!s.position?.includes("foreground") && !s.position?.includes("background")));
    const bgChar = ctx.subjects.find(s => s.position?.includes("background"));

    if (fgChar) layers.push(`foreground(${fgChar.name})`);
    else layers.push(`foreground(${ctx.subjects[0].name})`);

    if (mgChar && mgChar !== fgChar) layers.push(`midground(${mgChar.name})`);
    else if (ctx.subjects.length > 1) layers.push(`midground(${ctx.subjects[1].name})`);

    layers.push("background");
    depthSection = `Depth: Three-layer composition: ${layers.join(", ")}.`;
  } else if (ctx.characterCount === 1) {
    depthSection = "Depth: Character focus with environmental background depth.";
  }

  // ── 6. Reference Tags (레퍼런스 이미지 참조) ──
  const locRef = ctx.refTags || "";

  // ── 최종 조립 ──
  return [
    styleSection,
    settingSection,
    cameraSection,
    ...subjectSections,
    depthSection,
    locRef,
  ]
    .filter(Boolean)
    .join(" ");
}

// ══════════════════════════════════════════════════════════════
// 헬퍼 함수
// ══════════════════════════════════════════════════════════════

/** Setting 섹션에 통합될 짧은 조명 힌트
 *  규칙3: 광원을 하나로 고정, 구체적 빛의 경로 명시, gentle shadows */
function buildLightingShort(timeLabel: string, moodLabel: string): string {
  const t = (timeLabel || "").toLowerCase();
  const m = (moodLabel || "").toLowerCase();

  let light = "";

  // 시간대 기반 — 구체적 광원 경로
  if (t.includes("morning") || t === "아침" || t === "오전") {
    light = "soft morning sunlight from the window, gentle shadows";
  } else if (t.includes("afternoon") || t === "낮" || t === "오후") {
    light = "bright daylight from overhead, even illumination";
  } else if (t.includes("evening") || t === "저녁" || t === "석양") {
    light = "warm golden-hour light from the side window, long soft shadows";
  } else if (t.includes("night") || t === "밤" || t === "야간") {
    light = "soft moonlight from the window, gentle shadows";
  } else {
    light = "soft natural ambient light, gentle shadows";
  }

  // 분위기 보정 — 부드러운 톤만
  if (m === "warm" || m === "따뜻") light += ", warm interior glow";
  else if (m === "cold" || m === "차가운") light += ", cool fluorescent overhead";
  else if (m === "tense" || m === "긴장") light += ", slightly dim, focused lighting";
  else if (m === "dark" || m === "어둠") light += ", dim but visible, low-key";
  else if (m === "peaceful" || m === "평화") light += ", soft diffused";
  else if (m === "melancholic" || m === "우울") light += ", subdued melancholic atmosphere";

  return light;
}
