// ============================================================
// PipelinePage — 2단계 파이프라인

// Step 1: 씬 설명 입력  
// Step 2: 씬 분석 + 레퍼런스 이미지 생성 + 스토리보드(패널 이미지 통합)
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePipelineStore } from "@/stores";
import { useReferenceStore } from "@/stores/referenceStore";
import type { StoryboardItem } from "@webtoon/shared";
import type { Character, Location, OutfitEntry, CharacterPromptData } from "@webtoon/shared/types";
import { normalizeOutfit, ART_STYLES, ART_STYLE_KEYS, DEFAULT_ART_STYLE, buildCharRefPrompt, buildBgRefPrompt } from "@webtoon/shared/types";
import {
  analyzeSceneWithGemini,
  autoTagImageWithVision,
  isGeminiConfigured,
  getGeminiAuthMode,
  getCurrentModelId,
  setGeminiModel,
  GEMINI_MODELS,
  type GeminiModelId,
  type GeminiSceneAnalysis,
  type GeminiPanelSuggestion,
  type GeminiCharacterAnalysis,
  type GeminiAutoTagResult,
  type PanelType,
} from "@/services/geminiService";
import { ReferenceResolver, buildFallbackPrompt } from "@/services/referenceResolver";
import { applyPromptRules, type PanelPromptContext } from "@/services/promptRules";
import {
  figmaSyncFullEpisode,
  figmaBatchSync,
  listenFigmaStatus,
  extractDialogueHints,
  type FigmaSyncStatus,
} from "@/services/figmaSyncService";
import type { ContextChain, PanelResult, ReferenceImage, CharacterRefTags, LocationRefTags } from "@webtoon/shared/types";
import {
  generateImage,
  isKieImageConfigured,
  getSelectedImageModel,
  setSelectedImageModel,
  KIE_IMAGE_MODELS,
  type KieTaskState,
} from "@/services/kieImageService";
import { firebaseService, getFirebaseConfig, ensureFirebaseReady } from "@/services";

// ─── 로컬 폴백 분석 (Gemini 미설정 시) ──────────────────────

interface LocalAnalysis {
  characters: GeminiCharacterAnalysis[];
  location: { name: string; description: string; timeOfDay: string; weather: string; mood: string; promptSnippet: string };
  panels: GeminiPanelSuggestion[];
  sceneOverview: string;
  suggestedPromptStyle: string;
}

function analyzeSceneLocally(sceneText: string): LocalAnalysis {
  const text = sceneText.toLowerCase();
  const dialogueNames = sceneText.match(/^([가-힣]{2,4})\s*[:：]/gm)?.map(m => m.replace(/\s*[:：]/, "")) || [];
  const subjectNames = sceneText.match(/(?:^|[.!?\n]\s*)([가-힣]{2,3})(?=[이가은는도의를에](?:\s|$))/gm)
    ?.map(m => m.replace(/^[.!?\n\s]+/, "").replace(/[이가은는도의를에]$/, "")) || [];
  const nameBlacklist = new Set([
    "아침","저녁","오후","오전","새벽","점심","밤","낮",
    "교실","학교","복도","옥상","카페","공원","거리","병원","식당","도서관",
    "햇살","노을","바람","하늘","구름","비","눈","달",
    "두 사람","사람","모습","표정","목소리","마음","생각",
    "가방","책","커피","의자","책상","문","창문","난간",
    "일찍","조용","갑자기","천천히","빠르","다시","함께",
    "다가","서로","혼자","나란히","한동안","옆자리","창가","맞은편",
  ]);
  const allNames = [...new Set([...dialogueNames, ...subjectNames])].filter(n => n.length >= 2 && n.length <= 3 && !nameBlacklist.has(n));

  const emotionMap: Record<string, string> = {
    "웃":"joy","미소":"joy","기쁨":"joy","밝":"joy",
    "화":"anger","분노":"anger","짜증":"anger",
    "슬":"sadness","눈물":"sadness","울":"sadness",
    "놀라":"surprise","깜짝":"surprise","당황":"surprise",
    "무서":"fear","공포":"fear","두려":"fear",
    "진지":"neutral","차분":"neutral",
  };
  let primaryEmotion = "neutral";
  for (const [key, emotion] of Object.entries(emotionMap)) {
    if (text.includes(key)) { primaryEmotion = emotion; break; }
  }

  const locationPatterns: Record<string, string> = {
    "교실":"교실","학교":"학교","복도":"학교 복도","옥상":"옥상",
    "카페":"카페","공원":"공원","집":"집","방":"방",
    "거리":"거리","편의점":"편의점","도서관":"도서관",
  };
  let locationName = "알 수 없는 장소";
  for (const [key, name] of Object.entries(locationPatterns)) {
    if (text.includes(key)) { locationName = name; break; }
  }

  const timeMap: Record<string, string> = {
    "아침":"morning","오전":"morning","새벽":"morning",
    "점심":"afternoon","오후":"afternoon","낮":"afternoon",
    "저녁":"evening","석양":"evening","노을":"evening",
    "밤":"night","야간":"night",
  };
  let timeOfDay = "afternoon";
  for (const [key, t] of Object.entries(timeMap)) {
    if (text.includes(key)) { timeOfDay = t; break; }
  }

  const moodMap: Record<string, string> = {
    "밝":"bright","화사":"bright","어둡":"dark","음침":"dark",
    "따뜻":"warm","포근":"warm","차가":"cold","긴장":"tense","평화":"peaceful",
  };
  let mood = "bright";
  for (const [key, m] of Object.entries(moodMap)) {
    if (text.includes(key)) { mood = m; break; }
  }

  const actionMap: Record<string, string> = {
    "달려":"running","걷":"walking","앉":"sitting","서":"standing",
    "말":"talking","웃":"smiling","울":"crying","읽":"reading",
    "들어":"entering","나가":"leaving",
  };

  // 의상 키워드 매핑
  const outfitMap: Record<string, string> = {
    "교복":"school uniform","유니폼":"uniform","제복":"uniform",
    "정장":"formal suit","수트":"formal suit","양복":"formal suit",
    "캐주얼":"casual clothes","사복":"casual clothes","평상복":"casual clothes",
    "운동복":"sportswear","체육복":"sportswear","트레이닝":"sportswear",
    "잠옷":"pajamas","파자마":"pajamas",
    "수영복":"swimwear","비키니":"bikini",
    "한복":"traditional hanbok","기모노":"kimono",
    "드레스":"dress","원피스":"one-piece dress",
    "코트":"coat","재킷":"jacket","블레이저":"blazer",
    "셔츠":"shirt","블라우스":"blouse","티셔츠":"t-shirt",
    "청바지":"jeans","치마":"skirt","바지":"pants",
    "후드":"hoodie","가디건":"cardigan","니트":"knit sweater",
  };

  // 소품 키워드
  const accessoryKeywords = [
    "안경","선글라스","시계","목걸이","반지","귀걸이","팔찌",
    "가방","백팩","핸드백","서류가방","모자","캡","스카프","넥타이","리본",
    "장갑","우산","지팡이","헤어핀","머리띠","헤드폰","이어폰",
  ];

  const characters: GeminiCharacterAnalysis[] = allNames.map(name => {
    const charContext = sceneText.split(name).slice(1).join(" ").slice(0, 200);
    let action = "standing";
    for (const [key, act] of Object.entries(actionMap)) {
      if (charContext.includes(key)) { action = act; break; }
    }
    let charEmotion = primaryEmotion;
    for (const [key, emotion] of Object.entries(emotionMap)) {
      if (charContext.includes(key)) { charEmotion = emotion; break; }
    }
    // 의상 추출
    let outfit = "default";
    const outfitParts: string[] = [];
    for (const [key, desc] of Object.entries(outfitMap)) {
      if (charContext.includes(key) || text.includes(key)) { outfitParts.push(desc); }
    }
    // 소품 추출
    const accessories: string[] = [];
    for (const acc of accessoryKeywords) {
      if (charContext.includes(acc) || text.includes(acc)) { accessories.push(acc); }
    }
    if (outfitParts.length > 0) {
      outfit = outfitParts.join(", ");
      if (accessories.length > 0) outfit += `, with ${accessories.join(", ")}`;
    } else if (accessories.length > 0) {
      outfit = `with ${accessories.join(", ")}`;
    }
    // V1 스타일 구조화된 refPrompt 생성 (로컬 폴백)
    const accessoriesStr = accessories.length > 0 ? accessories.join(", ") : "none";
    const outfitStr = outfitParts.length > 0 ? outfitParts.join(", ") : "casual clothes";
    const localRefPrompt = `Full body character reference sheet, front-facing T-pose, clean white background. ${name}. Outfit: ${outfitStr}${accessories.length > 0 ? ". Accessories: " + accessoriesStr : ""}. This character must be INSTANTLY recognizable and look IDENTICAL across all panels. Maintain strong visual identity.`;

    return {
      name, description: "", emotion: charEmotion, outfit, action, angle: "front",
      promptSnippet: "", dialogueSummary: null,
      appearance: "", accessories: accessoriesStr, distinctFeatures: "",
      refPrompt: localRefPrompt,
    };
  });

  if (characters.length === 0) {
    characters.push({ name: "캐릭터1", description: "", emotion: primaryEmotion, outfit: "default", action: "standing", angle: "front", promptSnippet: "", dialogueSummary: null });
  }

  // ── 1:1 씬→패널 매핑 (복잡한 장면만 분리) ──
  // 줄 단위로 분리: 빈 줄은 장면 구분, 대사 줄은 직전 장면에 포함
  const rawLines = sceneText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const scenes: string[] = [];
  const dialoguePattern = /^[가-힣]{1,4}\s*[:：]/;

  for (const line of rawLines) {
    if (dialoguePattern.test(line)) {
      // 대사 줄 → 직전 장면에 병합
      if (scenes.length > 0) {
        scenes[scenes.length - 1] += "\n" + line;
      } else {
        scenes.push(line);
      }
    } else {
      scenes.push(line);
    }
  }

  const cameraAngles = ["wide shot","medium shot","close-up","over shoulder","bird's eye","low angle"];
  // 복잡한 장면 감지 키워드 (여러 동작이 이어지는 패턴)
  const multiActionPatterns = [/며\s/, /고\s/, /면서\s/, /다가\s/, /후\s/];

  const panels: GeminiPanelSuggestion[] = [];
  let panelIdx = 0;

  // 씬 타입 판별 헬퍼
  const classifyScene = (sceneText: string, chars: string[]): PanelType => {
    const t = sceneText.trim();
    // 캐릭터가 없고 짧으면 narration
    if (chars.length === 0 && t.length < 80) return "narration";
    // 대괄호/괄호로 시작하거나 "~는/이/가 생각하다" 형식 → narration
    if (/^[\[(「『]/.test(t)) return "narration";
    // 대화 태그만 있고 50자 미만 → dialogue
    if (/^[가-힣]{2,4}\s*[:：]/.test(t) && t.length < 60) return "dialogue";
    // 장소 전환 설명 (씬 헤더 텍스트) → skip
    if (/^(씬|scene|int\.|ext\.)\s/i.test(t) && chars.length === 0) return "skip";
    // 캐릭터 없이 순수 설명 텍스트만 → narration
    if (chars.length === 0) return "narration";
    // 기본: visual
    return "visual";
  };

  for (const scene of scenes) {
    if (scene.trim().length < 3) continue;

    // 여러 동작이 포함된 복잡한 장면인지 판별
    const isComplex = multiActionPatterns.filter(p => p.test(scene)).length >= 2 && scene.length > 30;
    const panelChars = allNames.filter(n => scene.includes(n));
    const chars = panelChars.length > 0 ? panelChars : allNames.slice(0, 2);
    const panel_type = classifyScene(scene, panelChars);

    if (isComplex && panel_type !== "narration" && panel_type !== "skip") {
      // 복잡한 장면 → 2개 패널로 분리 (앞부분/뒷부분)
      const midPoint = scene.indexOf(",", Math.floor(scene.length / 3));
      const splitAt = midPoint > 0 ? midPoint + 1 : Math.floor(scene.length / 2);
      const part1 = scene.slice(0, splitAt).trim();
      const part2 = scene.slice(splitAt).trim();

      panels.push({
        panelNumber: ++panelIdx,
        description: part1,
        characters: chars,
        cameraAngle: cameraAngles[panelIdx % cameraAngles.length],
        emotion: primaryEmotion,
        composition: "",
        aiPrompt: `webtoon panel. ${part1}.`,
        notes: "자동 분리된 패널 (앞부분)",
        panel_type,
      });
      if (part2.length > 5) {
        panels.push({
          panelNumber: ++panelIdx,
          description: part2,
          characters: chars,
          cameraAngle: cameraAngles[panelIdx % cameraAngles.length],
          emotion: primaryEmotion,
          composition: "",
          aiPrompt: `webtoon panel. ${part2}.`,
          notes: "자동 분리된 패널 (뒷부분)",
          panel_type,
        });
      }
    } else {
      // 일반 장면 → 1개 패널
      panels.push({
        panelNumber: ++panelIdx,
        description: scene,
        characters: chars,
        cameraAngle: cameraAngles[panelIdx % cameraAngles.length],
        emotion: primaryEmotion,
        composition: "",
        aiPrompt: `webtoon panel. ${scene}.`,
        notes: "",
        panel_type,
      });
    }
  }

  if (panels.length === 0) {
    panels.push({
      panelNumber: 1, description: sceneText.trim(), characters: allNames,
      cameraAngle: "wide shot", emotion: primaryEmotion, composition: "", aiPrompt: "", notes: "",
    });
  }

  return {
    characters,
    location: { name: locationName, description: "", timeOfDay, weather: "clear", mood, promptSnippet: "" },
    panels,
    sceneOverview: sceneText.slice(0, 100) + "...",
    suggestedPromptStyle: "korean webtoon style",
  };
}

// ─── 라벨 매핑 ──────────────────────────────────────────────

const EMOTION_LABELS: Record<string, string> = {
  joy: "기쁨", sadness: "슬픔", anger: "분노", surprise: "놀람",
  fear: "공포", neutral: "차분", love: "사랑", disgust: "혐오",
};
const ACTION_LABELS: Record<string, string> = {
  standing: "서있기", running: "달리기", sitting: "앉기", talking: "대화",
  walking: "걷기", smiling: "미소", crying: "울기", fighting: "싸움",
  eating: "식사", reading: "독서", writing: "글쓰기", looking: "바라보기",
  entering: "들어오기", leaving: "나가기",
};
const TIME_LABELS: Record<string, string> = { morning: "아침", afternoon: "오후", evening: "저녁", night: "밤" };
const MOOD_LABELS: Record<string, string> = { bright: "밝은", dark: "어두운", warm: "따뜻한", cold: "차가운", tense: "긴장된", peaceful: "평화로운" };
const ANGLE_OPTIONS = ["wide shot","medium shot","close-up","extreme close-up","over shoulder","bird's eye","low angle","dutch angle"];

// ─── 파이프라인 데이터 저장/복원 (Firebase + localStorage 폴백) ──

interface PipelineSaveData {
  sceneText: string;
  analysisMode: "gemini" | "local" | null;
  analysis: any;
  editingPanels: GeminiPanelSuggestion[];
  panelPrompts: Record<number, string>;
  generatedImages: Record<number, string>;
  refImages: Record<string, string>;
  savedAt: number;
}

function localKey(projectId?: string, episodeId?: string) {
  return `pipeline_${projectId || "default"}_${episodeId || "default"}`;
}

function isFirebaseReady(): boolean {
  return !!getFirebaseConfig();
}

/** Firebase 저장 (비동기, 실패 시 localStorage 폴백) */
async function savePipelineToFirebase(
  projectId: string | undefined,
  episodeId: string | undefined,
  data: Omit<PipelineSaveData, "savedAt">
) {
  const payload: PipelineSaveData = { ...data, savedAt: Date.now() };

  // localStorage에도 항상 백업
  try {
    localStorage.setItem(localKey(projectId, episodeId), JSON.stringify(payload));
  } catch {}

  // Firebase 저장
  if (isFirebaseReady() && projectId && episodeId) {
    try {
      await ensureFirebaseReady();
      await firebaseService.savePipelineSnapshot(projectId, episodeId, payload as any);
      console.log(`[Pipeline] Firebase 저장 완료`);
    } catch (e) {
      console.warn("[Pipeline] Firebase 저장 실패, localStorage 폴백:", e);
    }
  }
}

/** Firebase 로드 (실패 시 localStorage 폴백) */
async function loadPipelineFromFirebase(
  projectId?: string,
  episodeId?: string
): Promise<PipelineSaveData | null> {
  // Firebase 먼저 시도
  if (isFirebaseReady() && projectId && episodeId) {
    try {
      await ensureFirebaseReady();
      const data = await firebaseService.loadPipelineSnapshot(projectId, episodeId);
      if (data && (data as any).sceneText) {
        console.log(`[Pipeline] Firebase에서 데이터 복원`);
        return data as unknown as PipelineSaveData;
      }
    } catch (e) {
      console.warn("[Pipeline] Firebase 로드 실패, localStorage 폴백:", e);
    }
  }

  // localStorage 폴백
  try {
    const raw = localStorage.getItem(localKey(projectId, episodeId));
    if (!raw) return null;
    const data = JSON.parse(raw) as PipelineSaveData;
    if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(localKey(projectId, episodeId));
      return null;
    }
    console.log(`[Pipeline] localStorage에서 데이터 복원`);
    return data;
  } catch {
    return null;
  }
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────

export function PipelinePage() {
  const { projectId, episodeId } = useParams<{ projectId: string; episodeId: string }>();
  const navigate = useNavigate();
  const { currentStep, setCurrentStep, storyboard, setStoryboard } = usePipelineStore();
  const { characters: registeredChars, locations: registeredLocs, outfits: registeredOutfits, contextChain, loadReferences } = useReferenceStore();

  useEffect(() => {
    if (projectId) loadReferences(projectId);
  }, [projectId, loadReferences]);

  // ── 상태 ──
  const [sceneText, setSceneText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"gemini" | "local" | null>(null);
  const [analysis, setAnalysis] = useState<GeminiSceneAnalysis | LocalAnalysis | null>(null);
  const [editingPanels, setEditingPanels] = useState<GeminiPanelSuggestion[]>([]);
  const [panelPrompts, setPanelPrompts] = useState<Record<number, string>>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 패널 이미지 생성 상태 (Step 2 통합)
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [genProgress, setGenProgress] = useState<Record<number, string>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // 레퍼런스 이미지 생성 상태
  const [refImages, setRefImages] = useState<Record<string, string>>({}); // key: "char_이름" | "loc_이름"
  const [refGenProgress, setRefGenProgress] = useState<Record<string, string>>({});
  const [generatingRefKey, setGeneratingRefKey] = useState<string | null>(null);
  const [isGeneratingAllRefs, setIsGeneratingAllRefs] = useState(false);

  // v1.0 말풍선/나래이션/효과음 데이터 (마이그레이션 시 보존)
  const [v1BubblesByPanel, setV1BubblesByPanel] = useState<Record<number, any[]>>({});
  const [v1PageSize, setV1PageSize] = useState<{ w: number; h: number }>({ w: 800, h: 1067 });
  const [v1PageSizeByPanel, setV1PageSizeByPanel] = useState<Record<number, { w: number; h: number }>>({});

  // 이미지 모델 선택
  const [selectedModel, setSelectedModel] = useState(getSelectedImageModel());

  // 아트 스타일 선택
  const [artStyleKey, setArtStyleKey] = useState(DEFAULT_ART_STYLE);

  // ── 이미지 라이트박스 (팝업) 상태 ──
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  const openLightbox = useCallback((url: string, title: string) => {
    setLightbox({ url, title });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
  }, []);

  const downloadImage = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // fallback: 새 탭에서 열기
      window.open(url, "_blank");
    }
  }, []);

  // ── Step 3: Figma Export 상태 ──
  const [figmaStatus, setFigmaStatus] = useState<FigmaSyncStatus>({ connected: false, lastSyncAt: 0 });
  const [isExportingToFigma, setIsExportingToFigma] = useState(false);
  const [figmaExportResult, setFigmaExportResult] = useState<string | null>(null);

  // Figma 연결 상태 리스너
  useEffect(() => {
    if (!projectId) return;
    const unsub = listenFigmaStatus(projectId, (status) => {
      setFigmaStatus(status);
    });
    return unsub;
  }, [projectId]);

  // ── "레퍼런스로 저장" 모달 상태 ──
  const [saveRefModal, setSaveRefModal] = useState<{
    open: boolean;
    panelIdx: number;
    imageUrl: string;
    autoTags: GeminiAutoTagResult | null;
    isTagging: boolean;
    selectedCharName: string;
    selectedLocName: string;
    tagOverrides: Record<string, string>;
  }>({
    open: false, panelIdx: -1, imageUrl: "", autoTags: null,
    isTagging: false, selectedCharName: "", selectedLocName: "", tagOverrides: {},
  });

  // ── Context Chain (씬 연속성 추적) ──
  const contextChainRef = useRef<ContextChain | null>(null);

  // ── 저장된 데이터 복원 (Firebase → localStorage 폴백) ──
  const [dataLoaded, setDataLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadPipelineFromFirebase(projectId, episodeId);
      if (cancelled) return;
      if (saved) {
        if (saved.sceneText) setSceneText(saved.sceneText);
        if (saved.analysisMode) setAnalysisMode(saved.analysisMode);
        if (saved.analysis) {
          setAnalysis(saved.analysis);
          // v1.0 마이그레이션 + 이미지 있으면 바로 step3, 아니면 step2
          if ((saved as any)._migratedFromV1 && saved.generatedImages && Object.keys(saved.generatedImages).length > 0) {
            setCurrentStep("step3_panels");
          } else {
            setCurrentStep("step2_storyboard");
          }
        }
        if (saved.editingPanels?.length > 0) setEditingPanels(saved.editingPanels);
        if (saved.panelPrompts && Object.keys(saved.panelPrompts).length > 0) setPanelPrompts(saved.panelPrompts);
        if (saved.generatedImages && Object.keys(saved.generatedImages).length > 0) setGeneratedImages(saved.generatedImages);
        if (saved.refImages && Object.keys(saved.refImages).length > 0) setRefImages(saved.refImages);
        // v1.0 말풍선 데이터 복원
        if ((saved as any).v1BubblesByPanel) {
          setV1BubblesByPanel((saved as any).v1BubblesByPanel);
          console.log(`[Pipeline] v1.0 말풍선 복원:`, Object.keys((saved as any).v1BubblesByPanel).length, "개 패널");
        }
        if ((saved as any).v1PageSize) setV1PageSize((saved as any).v1PageSize);
        if ((saved as any).v1PageSizeByPanel) setV1PageSizeByPanel((saved as any).v1PageSizeByPanel);
        console.log(`[Pipeline] 데이터 복원 완료 (${new Date(saved.savedAt).toLocaleString("ko-KR")})`);

        // ── 복원된 분석 결과의 캐릭터/장소를 referenceStore에 등록 ──
        if (saved.analysis && projectId) {
          // 항상 loadReferences 완료 대기 (진행 중이면 기존 Promise 재사용)
          await ensureFirebaseReady();
          await useReferenceStore.getState().loadReferences(projectId);
          const { addCharacter, addLocation, addOrUpdateOutfit, characters: existingChars, locations: existingLocs } = useReferenceStore.getState();
          const pid = projectId;
          const now = Date.now();

          let registered = 0;
          for (const c of saved.analysis.characters || []) {
            const exists = existingChars.some(ec => ec.name === c.name);
            const restoreNorm = normalizeOutfit(c.outfit);
            const restoreShortName = restoreNorm !== (c.outfit || "").toLowerCase().trim()
              ? restoreNorm : (c.outfit || "").length > 40 ? (c.outfit || "").slice(0, 40).trim() + "…" : (c.outfit || "");
            const charId = `char_${now}_${c.name}`;

            if (!exists && c.name) {
              addCharacter({
                id: charId,
                projectId: pid,
                name: c.name,
                description: c.description || "",
                defaultPromptSnippet: c.promptSnippet || "",
                references: [],
                createdAt: now,
                updatedAt: now,
              });
              // OutfitEntry로 의상 등록
              if (c.outfit && c.outfit !== "default") {
                const outfitId = `outfit_${now}_${restoreNorm}`;
                addOrUpdateOutfit({
                  id: outfitId,
                  projectId: pid,
                  characterId: charId,
                  characterName: c.name,
                  label: restoreShortName,
                  description: c.outfit,
                  references: [],
                  isDefault: true,
                  usageCount: 0,
                  createdAt: now,
                  updatedAt: now,
                });
              }
              registered++;
              console.log(`[Pipeline:Restore] 캐릭터 등록: ${c.name} (의상: ${c.outfit || "없음"})`);
            }
          }

          const locsToRestore = saved.analysis.locations || (saved.analysis.location?.name ? [saved.analysis.location] : []);
          for (const loc of locsToRestore) {
            if (loc?.name) {
              const locExists = existingLocs.some(el => el.name === loc.name);
              if (!locExists) {
                addLocation({
                  id: `loc_${now}_${loc.name}`,
                  projectId: pid,
                  name: loc.name,
                  description: loc.description || "",
                  defaultPromptSnippet: loc.promptSnippet || "",
                  locationCanonical: (loc as any).locationCanonical,
                  references: [],
                  createdAt: now,
                  updatedAt: now,
                });
                registered++;
                console.log(`[Pipeline:Restore] 장소 등록: ${loc.name}${(loc as any).locationCanonical ? ` [${(loc as any).locationCanonical}]` : ""}`);
              }
            }
          }
          if (registered > 0) {
            console.log(`[Pipeline:Restore] ${registered}개 레퍼런스 항목 Firebase 등록 완료`);
          }
        }
      }
      // Context Chain 복원
      if (projectId && episodeId) {
        const chain = await firebaseService.loadContextChain(projectId, episodeId);
        if (chain && !cancelled) contextChainRef.current = chain as ContextChain;
      }
      setDataLoaded(true);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, episodeId]);

  // ── 씬 설명 텍스트 자동 저장 (입력 2초 후 Firebase) ──
  const sceneTextSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sceneTextSaveStatus, setSceneTextSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (!dataLoaded || !projectId || !episodeId) return;
    if (sceneTextSaveTimerRef.current) clearTimeout(sceneTextSaveTimerRef.current);
    setSceneTextSaveStatus("idle");
    sceneTextSaveTimerRef.current = setTimeout(async () => {
      setSceneTextSaveStatus("saving");
      try {
        await savePipelineToFirebase(projectId, episodeId, {
          sceneText,
          analysisMode,
          analysis,
          editingPanels,
          panelPrompts,
          generatedImages,
          refImages,
        } as any);
        setSceneTextSaveStatus("saved");
      } catch (_) {
        setSceneTextSaveStatus("idle");
      }
      setTimeout(() => setSceneTextSaveStatus("idle"), 2000);
    }, 2000);
    return () => { if (sceneTextSaveTimerRef.current) clearTimeout(sceneTextSaveTimerRef.current); };
  }, [sceneText, dataLoaded, projectId, episodeId]);

  // ── 자동 저장 (분석 완료 후 변경 시, 2초 디바운스) ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dataLoaded || !analysis) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const saveData: Record<string, any> = {
        sceneText,
        analysisMode,
        analysis,
        editingPanels,
        panelPrompts,
        generatedImages,
        refImages,
      };
      // v1.0 말풍선 데이터 보존
      if (Object.keys(v1BubblesByPanel).length > 0) {
        saveData.v1BubblesByPanel = v1BubblesByPanel;
        saveData.v1PageSize = v1PageSize;
        saveData.v1PageSizeByPanel = v1PageSizeByPanel;
        saveData._migratedFromV1 = true;
      }
      savePipelineToFirebase(projectId, episodeId, saveData as any);
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [dataLoaded, analysis, editingPanels, panelPrompts, generatedImages, refImages, sceneText, analysisMode, projectId, episodeId, v1BubblesByPanel, v1PageSize, v1PageSizeByPanel]);

  const geminiReady = isGeminiConfigured();
  const kieReady = isKieImageConfigured();
  const [selectedAnalysisModel, setSelectedAnalysisModel] = useState<GeminiModelId>(() => getCurrentModelId());
  const aiAuthLabel = getGeminiAuthMode();

  const resolver = new ReferenceResolver(
    registeredChars as Character[],
    registeredLocs as Location[],
    contextChain,
    registeredOutfits
  );

  // ── 이미지 모델 변경 핸들러 ──
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    setSelectedImageModel(modelId);
  };

  // ── Step 1 → Step 2: 씬 분석 실행 ──
  const handleAnalyzeScene = useCallback(async () => {
    if (!sceneText.trim()) { alert("씬 설명을 입력하세요"); return; }
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      let result: GeminiSceneAnalysis | LocalAnalysis;

      if (geminiReady) {
        result = await analyzeSceneWithGemini(
          sceneText,
          registeredChars as Character[],
          registeredLocs as Location[]
        );
        setAnalysisMode("gemini");
      } else {
        await new Promise(r => setTimeout(r, 600));
        result = analyzeSceneLocally(sceneText);
        setAnalysisMode("local");
      }

      setAnalysis(result);
      setEditingPanels(result.panels);

      // ── 레퍼런스 스토어에 자동 등록 (Firebase 초기화 보장) ──
      await ensureFirebaseReady();
      const { addCharacter, addLocation, addOrUpdateOutfit, outfits: existingOutfits, characters: existingChars, locations: existingLocs } = useReferenceStore.getState();
      const pid = projectId || "default";
      const now = Date.now();

      result.characters.forEach(c => {
        const exists = existingChars.find(ec => ec.name === c.name);

        // 의상 정보 준비
        const accessoriesArr = (c as any).accessories && (c as any).accessories !== "none"
          ? (c as any).accessories.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];

        // 의상 이름 결정 우선순위: (1) Gemini outfitLabel → (2) normalizeOutfit 매칭 → (3) 축약
        const normalizedName = normalizeOutfit(c.outfit);
        const geminiLabel = (c as any).outfitLabel;
        const shortName = geminiLabel && geminiLabel.trim()
          ? geminiLabel.trim()
          : normalizedName !== c.outfit.toLowerCase().trim()
            ? normalizedName
            : c.outfit.length > 40 ? c.outfit.slice(0, 40).trim() + "…" : c.outfit;

        // defaultPromptSnippet: refPrompt가 있으면 우선 사용, 없으면 promptSnippet
        const bestPrompt = (c as any).refPrompt || c.promptSnippet || c.description;

        const charId = exists ? exists.id : `char_${now}_${c.name}`;

        if (!exists) {
          addCharacter({
            id: charId,
            projectId: pid,
            name: c.name,
            description: c.description,
            defaultPromptSnippet: bestPrompt,
            characterCore: (c as any).characterCore || undefined,
            references: [],
            createdAt: now,
            updatedAt: now,
          });
          console.log(`[Pipeline] 캐릭터 등록: ${c.name} (의상: ${c.outfit || "없음"}, 소품: ${accessoriesArr.length}개)`);
        }

        // OutfitEntry로 의상 등록/업데이트 (중복 방지)
        if (c.outfit && c.outfit !== "default") {
          const charOutfits = existingOutfits.filter(o => o.characterId === charId);
          const alreadyHas = charOutfits.some(o => normalizeOutfit(o.label) === normalizedName);
          if (!alreadyHas) {
            const outfitId = `outfit_${now}_${normalizedName}_${c.name}`;
            addOrUpdateOutfit({
              id: outfitId,
              projectId: pid,
              characterId: charId,
              characterName: c.name,
              label: shortName,
              description: c.outfit + (accessoriesArr.length > 0 ? `. Accessories: ${accessoriesArr.join(", ")}` : ""),
              references: [],
              accessories: accessoriesArr.length > 0 ? accessoriesArr : undefined,
              isDefault: !exists,
              usageCount: 0,
              createdAt: now,
              updatedAt: now,
            });
            // currentOutfitId 설정
            const { setCharacters, characters: allChars } = useReferenceStore.getState();
            const targetChar = allChars.find(ch => ch.id === charId);
            if (targetChar) {
              setCharacters(allChars.map(ch => ch.id === charId ? { ...ch, currentOutfitId: outfitId, updatedAt: now } : ch));
            }
            console.log(`[Pipeline] 의상 등록 (OutfitEntry): ${c.name} → ${c.outfit} (소품: ${accessoriesArr.length}개)`);
          } else {
            // 기존 의상이면 currentOutfitId만 업데이트
            const matchingOutfit = charOutfits.find(o => normalizeOutfit(o.label) === normalizedName);
            if (matchingOutfit) {
              const { setCharacters, characters: allChars } = useReferenceStore.getState();
              const targetChar = allChars.find(ch => ch.id === charId);
              if (targetChar && targetChar.currentOutfitId !== matchingOutfit.id) {
                setCharacters(allChars.map(ch => ch.id === charId ? { ...ch, currentOutfitId: matchingOutfit.id, updatedAt: now } : ch));
                console.log(`[Pipeline] 캐릭터 활성 의상 변경: ${c.name} → ${c.outfit}`);
              }
            }
          }
        }
      });

      // ── 의상 라이브러리 동기화 (outfitNormalizedId 기반) ──
      {
        const { addOrUpdateOutfit, outfits: existingOutfits, characters: latestCharsForOutfit } = useReferenceStore.getState();
        result.characters.forEach(c => {
          const normalizedId = (c as any).outfitNormalizedId;
          if (!normalizedId || !c.outfit) return;
          const alreadyExists = existingOutfits.some(o => o.id === normalizedId);
          if (alreadyExists) return;
          const char = latestCharsForOutfit.find(ch => ch.name === c.name) || existingChars.find(ch => ch.name === c.name);
          if (!char) return;
          const accessoriesArr = (c as any).accessories && (c as any).accessories !== "none"
            ? (c as any).accessories.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [];
          addOrUpdateOutfit({
            id: normalizedId,
            projectId: pid,
            characterId: char.id,
            characterName: char.name,
            label: (c as any).outfitLabel || normalizeOutfit(c.outfit),
            description: c.outfit + (accessoriesArr.length > 0 ? `. ${accessoriesArr.join(", ")}` : ""),
            references: [],
            accessories: accessoriesArr.length > 0 ? accessoriesArr : undefined,
            isDefault: false,
            usageCount: 0,
            createdAt: now,
            updatedAt: now,
          });
          console.log(`[Pipeline] 의상 라이브러리 등록: ${normalizedId} (${char.name})`);
        });
      }

      // 모든 개별 장소 등록
      const locsToRegister = (result as any).locations || (result.location?.name ? [result.location] : []);
      for (const loc of locsToRegister) {
        const locExists = existingLocs.some(el => el.name === loc.name);
        if (!locExists && loc.name) {
          addLocation({
            id: `loc_${now}_${loc.name}`,
            projectId: pid,
            name: loc.name,
            description: loc.description,
            defaultPromptSnippet: loc.promptSnippet,
            locationCanonical: (loc as any).locationCanonical,
            references: [],
            createdAt: now,
            updatedAt: now,
          });
          console.log(`[Pipeline] 장소 등록: ${loc.name}${(loc as any).locationCanonical ? ` [${(loc as any).locationCanonical}]` : ""}`);
        }
      }

      // ── 패널 프롬프트 설정 (의상 정보 포함) ──
      const latestChars = useReferenceStore.getState().characters;
      const latestOutfits = useReferenceStore.getState().outfits;
      const prompts: Record<number, string> = {};
      result.panels.forEach((panel, idx) => {
        // 캐릭터 토큰: 이름 + 감정 + 행동만 — 외형/의상 설명은 레퍼런스 이미지가 담당
        const charTokens = panel.characters
          .map(name => {
            const c = result.characters.find(ch => ch.name === name);
            const emotion = c ? (EMOTION_LABELS[c.emotion] || c.emotion) : "";
            const action = (c as any)?.action && (c as any).action !== "standing"
              ? ACTION_LABELS[(c as any).action] || (c as any).action
              : "";
            const tags = [emotion, action].filter(Boolean).join(", ");
            return tags ? `${name}(${tags})` : name;
          })
          .join(", ");

        // 패널별 장소 결정: panel.location → 대표 장소 fallback
        const panelLocName = panel.location || result.location.name;
        const panelLoc = (result as any).locations?.find((l: any) => l.name === panelLocName) || result.location;
        const timeLabel = TIME_LABELS[panelLoc.timeOfDay] || panelLoc.timeOfDay || "";
        const moodLabel = MOOD_LABELS[panelLoc.mood] || panelLoc.mood || "";

        // 의상 레퍼런스 ID 목록 (텍스트 참조 — 실제 이미지는 referenceImageUrls로 전달)
        const outfitRefs = panel.characters
          .map(name => panel.characterOutfits?.[name])
          .filter(Boolean)
          .map(id => `ref:outfit/${id}`)
          .join(", ");
        const locRef = `ref:location/${panelLocName.replace(/\s/g, "_")}`;

        // 프롬프트: 씬 행동 + 캐릭터(이름+감정) + 장소(시간/분위기) + 카메라
        // 외형/의상 텍스트 설명 없음 — referenceImageUrls 의 이미지가 그 역할을 함
        const panelCtx: PanelPromptContext = {
          description: panel.description,
          charTokens,
          locationName: panelLocName,
          timeLabel,
          moodLabel,
          cameraAngle: panel.cameraAngle,
          rawComposition: panel.composition || "",
          refTags: outfitRefs ? `[${outfitRefs}, ${locRef}]` : `[${locRef}]`,
          characterCount: panel.characters.length,
          characterAngles: (panel as any).characterAngles,
        };
        prompts[idx] = applyPromptRules(panelCtx);
      });
      setPanelPrompts(prompts);
      setCurrentStep("step2_storyboard");

      // ── 분석 결과 Firebase에 저장 ──
      savePipelineToFirebase(projectId, episodeId, {
        sceneText,
        analysisMode: geminiReady ? "gemini" : "local",
        analysis: result,
        editingPanels: result.panels,
        panelPrompts: prompts,
        generatedImages: {},
        refImages: {},
      });
    } catch (err: any) {
      console.error("분석 실패:", err);
      setAnalysisError(err.message || "분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [sceneText, geminiReady, registeredChars, registeredLocs, setCurrentStep, projectId]);

  // ── 레퍼런스 이미지 생성 (캐릭터/장소) ──
  const generateRefImage = useCallback(async (refType: "char" | "loc", name: string, promptSnippet: string) => {
    if (!kieReady) {
      alert("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력하세요.");
      return;
    }
    const key = `${refType}_${name}`;
    setGeneratingRefKey(key);
    setRefGenProgress(prev => ({ ...prev, [key]: "대기 중..." }));

    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };

    // 레퍼런스용 프롬프트 구성 (V1 스타일 상세 프롬프트)
    let refPrompt: string;
    if (refType === "char") {
      // 분석 데이터에서 상세 캐릭터 정보 가져오기
      const analysisChar = analysis?.characters?.find((c: any) => c.name === name);
      const charData: CharacterPromptData = {
        name,
        refPrompt: analysisChar?.refPrompt || "",
        appearance: analysisChar?.appearance || "",
        outfit: analysisChar?.outfit || "",
        accessories: analysisChar?.accessories || "",
        distinctFeatures: analysisChar?.distinctFeatures || "",
        promptSnippet: promptSnippet || "",
      };

      // 다른 캐릭터 데이터 (대비용)
      const otherChars: CharacterPromptData[] = (analysis?.characters || [])
        .filter((c: any) => c.name !== name)
        .map((c: any) => ({
          name: c.name,
          appearance: c.appearance || c.description || "",
          distinctFeatures: c.distinctFeatures || "",
        }));

      refPrompt = buildCharRefPrompt(charData, {
        artStyleKey,
        otherCharacters: otherChars,
      });

      // refPrompt가 비어있으면 (분석 데이터 없는 경우) 기본 스타일 적용
      if (!refPrompt || refPrompt.length < 50) {
        const style = ART_STYLES[artStyleKey];
        refPrompt = `${style?.prefix || ""}character reference sheet, full body portrait, white background, clean illustration, ${name}, ${promptSnippet || "young character"}, multiple angles, front view and side view${style?.charSuffix || ", high quality, detailed"}`;
      }
    } else {
      refPrompt = buildBgRefPrompt(name, promptSnippet || "detailed location", artStyleKey);
    }

    try {
      const result = await generateImage(refPrompt, {
        imageSize: refType === "char" ? "portrait_4_3" : "landscape_4_3",
        onProgress: (state: KieTaskState, elapsed: number) => {
          setRefGenProgress(prev => ({ ...prev, [key]: `${stateLabels[state] || state} (${elapsed}초)` }));
        },
      });
      setRefImages(prev => ({ ...prev, [key]: result.imageUrl }));
      setRefGenProgress(prev => ({ ...prev, [key]: `완료 (${result.duration}초)` }));

      // 레퍼런스 스토어에 이미지 URL 저장 + Firebase 직접 저장
      const store = useReferenceStore.getState();
      const pid = projectId || store.currentProjectId;
      const now = Date.now();
      if (refType === "char") {
        const char = store.characters.find(c => c.name === name);
        if (char) {
          const newRef: ReferenceImage = {
            id: `ref_${now}_refgen`,
            storageUrl: result.imageUrl,
            tags: { emotion: "neutral", outfit: "default", angle: "front" },
            sourceEpisode: episodeId || "",
            sourcePanel: 0,
            usageCount: 0,
            quality: 3,
            createdAt: now,
          };
          const updatedChar = { ...char, references: [...char.references, newRef], updatedAt: now };
          const updatedChars = store.characters.map(c =>
            c.name === name ? updatedChar : c
          );
          store.setCharacters(updatedChars);
          // Firebase 직접 저장 (갤러리에서 로드 시 보장)
          if (pid) {
            try {
              await firebaseService.saveCharacter(pid, updatedChar);
              console.log(`[Pipeline] 캐릭터 레퍼런스 이미지 Firebase 저장 완료: ${name} (${updatedChar.references.length} refs)`);
            } catch (e) {
              console.error("[Pipeline] 캐릭터 레퍼런스 Firebase 저장 실패:", e);
            }
          }
        }
      } else {
        const loc = store.locations.find(l => l.name === name);
        if (loc) {
          const newRef: ReferenceImage = {
            id: `ref_${now}_refgen`,
            storageUrl: result.imageUrl,
            tags: { timeOfDay: "afternoon", weather: "clear", mood: "bright" },
            sourceEpisode: episodeId || "",
            sourcePanel: 0,
            usageCount: 0,
            quality: 3,
            createdAt: now,
          };
          const updatedLoc = { ...loc, references: [...loc.references, newRef], updatedAt: now };
          const updatedLocs = store.locations.map(l =>
            l.name === name ? updatedLoc : l
          );
          store.setLocations(updatedLocs);
          // Firebase 직접 저장
          if (pid) {
            try {
              await firebaseService.saveLocation(pid, updatedLoc);
              console.log(`[Pipeline] 장소 레퍼런스 이미지 Firebase 저장 완료: ${name} (${updatedLoc.references.length} refs)`);
            } catch (e) {
              console.error("[Pipeline] 장소 레퍼런스 Firebase 저장 실패:", e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[Ref ${key}] 생성 실패:`, err);
      setRefGenProgress(prev => ({ ...prev, [key]: `실패: ${err.message}` }));
    } finally {
      setGeneratingRefKey(null);
    }
  }, [kieReady, episodeId, analysis, artStyleKey]);

  // ── 전체 레퍼런스 이미지 생성 ──
  const generateAllRefImages = useCallback(async () => {
    if (!kieReady || !analysis) return;
    setIsGeneratingAllRefs(true);

    // 캐릭터 레퍼런스
    for (const char of analysis.characters) {
      const key = `char_${char.name}`;
      if (refImages[key]) continue;
      await generateRefImage("char", char.name, char.promptSnippet || char.description);
    }

    // 장소 레퍼런스 (모든 개별 장소)
    const allLocs = (analysis as any).locations || (analysis.location?.name ? [analysis.location] : []);
    for (const loc of allLocs) {
      const locKey = `loc_${loc.name}`;
      if (!refImages[locKey] && loc.name) {
        await generateRefImage("loc", loc.name, loc.promptSnippet || loc.description);
      }
    }

    setIsGeneratingAllRefs(false);
  }, [kieReady, analysis, refImages, generateRefImage]);

  // ── 단일 패널 이미지 생성 (Reference Resolver + Context Chain 연동) ──
  const generatePanelImage = useCallback(async (idx: number) => {
    if (!kieReady) {
      alert("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력하세요.");
      return;
    }
    const panel = editingPanels[idx];
    let prompt = panelPrompts[idx] || panel?.aiPrompt || panel?.description;
    if (!prompt) return;

    // ── 아트 스타일 접두어 적용 ──
    const artStyle = ART_STYLES[artStyleKey];
    if (artStyle?.prefix && !prompt.startsWith(artStyle.prefix)) {
      prompt = artStyle.prefix + prompt;
    }

    // ── Reference Resolver로 프롬프트 강화 ──
    if (analysis && panel) {
      const store = useReferenceStore.getState();
      const currentResolver = new ReferenceResolver(
        store.characters as Character[],
        store.locations as Location[],
        contextChainRef.current,
        store.outfits
      );
      // 패널 캐릭터의 현재 의상 결정
      const panelCharAnalysis = analysis.characters.find(c => panel.characters.includes(c.name));
      const panelOutfit = panelCharAnalysis?.outfit || undefined;

      const panelLocName = panel.location || analysis.location.name;
      const panelLoc = (analysis as any).locations?.find((l: any) => l.name === panelLocName) || analysis.location;
      const resolved = currentResolver.resolve({
        characters: panel.characters,
        emotion: panel.emotion,
        outfit: panelOutfit,
        location: panelLocName,
        timeOfDay: panelLoc.timeOfDay,
        mood: panelLoc.mood,
        currentEpisode: episodeId || "",
        currentPanel: idx,
      });

      // 의상 텍스트 프롬프트 보강 생략:
      // 캐릭터+의상 레퍼런스 이미지(referenceImageUrls)가 외형을 담당하므로
      // 텍스트에 의상 설명을 중복 기재하면 AI가 혼동할 수 있음.

      if (resolved.length > 0) {
        const refLabels = resolved.map(r => r.label).join(", ");
        if (!prompt.includes("[References:")) {
          prompt += `\n\n[References: ${refLabels}]`;
        }
        console.log(`[Panel ${idx}] Resolved ${resolved.length} references (outfit: ${panelOutfit || "none"}): ${refLabels}`);
      }
    }

    // ── 레퍼런스 이미지 URL 수집 (이전 패널 + 캐릭터/장소 레퍼런스) ──
    const referenceImageUrls: string[] = [];

    // 1) 이전 패널 이미지 (시각적 일관성 — 최우선)
    if (idx > 0) {
      // 바로 직전 패널
      const prevImg = generatedImages[idx - 1];
      if (prevImg && prevImg.startsWith("http")) {
        referenceImageUrls.push(prevImg);
      }
      // 2칸 전 패널 (장면 흐름 유지)
      if (idx > 1) {
        const prev2Img = generatedImages[idx - 2];
        if (prev2Img && prev2Img.startsWith("http")) {
          referenceImageUrls.push(prev2Img);
        }
      }
    }

    // 2) 캐릭터 레퍼런스 이미지 + 의상 라이브러리 레퍼런스
    if (analysis && panel) {
      for (const charName of panel.characters) {
        // 2a) 의상 라이브러리에서 패널 outfitNormalizedId에 해당하는 레퍼런스 우선
        const outfitNormalizedId = panel.characterOutfits?.[charName];
        if (outfitNormalizedId) {
          const outfitEntry = registeredOutfits.find(o => o.id === outfitNormalizedId);
          if (outfitEntry?.references?.length) {
            // 가장 품질 높은 의상 레퍼런스 이미지 사용
            const best = [...outfitEntry.references].sort((a, b) => (b.quality || 0) - (a.quality || 0))[0];
            if (best?.storageUrl?.startsWith("http")) {
              referenceImageUrls.push(best.storageUrl);
              console.log(`[Panel ${idx}] Outfit ref: ${outfitNormalizedId} → ${best.storageUrl}`);
            }
          }
        }

        // 2b) 기본 캐릭터 레퍼런스 이미지 (fallback)
        const charRefImg = refImages[`char_${charName}`];
        if (charRefImg && charRefImg.startsWith("http")) {
          referenceImageUrls.push(charRefImg);
        }
      }
    }

    // 3) 장소 레퍼런스 이미지 (패널 장소 우선, 대표 장소 fallback)
    if (analysis) {
      const panelLocName = panel?.location || analysis.location.name;
      const locRefImg = refImages[`loc_${panelLocName}`] || refImages[`loc_${analysis.location.name}`];
      if (locRefImg && locRefImg.startsWith("http")) {
        referenceImageUrls.push(locRefImg);
      }
    }

    // 최대 4개 레퍼런스 이미지 (API 제한 고려)
    const finalRefUrls = referenceImageUrls.slice(0, 4);

    // 이전 패널 참조 시 프롬프트에 일관성 지시 추가
    if (idx > 0 && generatedImages[idx - 1]) {
      prompt += "\n\n[STYLE LOCK] Maintain IDENTICAL art style across all panels: same linework weight, color palette, shading technique, skin rendering, background detail level. Every panel must look like the same artist drew it in one session.";
      prompt += "\nDo NOT render any text, letters, words, sound effects, onomatopoeia, or speech bubbles in the image.";
    }

    if (finalRefUrls.length > 0) {
      console.log(`[Panel ${idx}] Passing ${finalRefUrls.length} reference images: prev=${idx > 0 && generatedImages[idx-1] ? 'yes' : 'no'}, chars=${panel?.characters?.length || 0}, loc=${analysis?.location?.name || 'none'}`);
    }

    setGeneratingIndex(idx);
    setGenProgress(prev => ({ ...prev, [idx]: "대기 중..." }));

    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };

    try {
      const result = await generateImage(prompt, {
        imageSize: "portrait_4_3",
        onProgress: (state: KieTaskState, elapsed: number) => {
          setGenProgress(prev => ({ ...prev, [idx]: `${stateLabels[state] || state} (${elapsed}초)` }));
        },
        referenceImageUrls: finalRefUrls.length > 0 ? finalRefUrls : undefined,
      });
      setGeneratedImages(prev => ({ ...prev, [idx]: result.imageUrl }));
      setGenProgress(prev => ({ ...prev, [idx]: `완료 (${result.duration}초)` }));

      // ── Context Chain 업데이트 ──
      if (panel && analysis) {
        const panelResult: PanelResult = {
          panelIndex: idx,
          storageUrl: result.imageUrl,
          prompt,
          providerId: result.modelId,
        };
        const currentResolver = new ReferenceResolver(
          registeredChars as Character[],
          registeredLocs as Location[],
          contextChainRef.current,
          registeredOutfits
        );
        const updatedChain = currentResolver.updateContextChain(
          episodeId || "",
          idx,
          panelResult,
          panel.characters,
          analysis.location.name
        );
        contextChainRef.current = updatedChain;

        // Firebase에 Context Chain 저장 (비동기)
        if (projectId && episodeId) {
          firebaseService.saveContextChain(projectId, episodeId, updatedChain)
            .catch(e => console.error("[Pipeline] Context chain save error:", e));
        }
        console.log(`[Panel ${idx}] Context chain updated: ${updatedChain.scenes.length} scenes`);
      }
    } catch (err: any) {
      console.error(`[Panel ${idx}] 생성 실패:`, err);
      setGenProgress(prev => ({ ...prev, [idx]: `실패: ${err.message}` }));
    } finally {
      setGeneratingIndex(null);
    }
  }, [panelPrompts, editingPanels, kieReady, analysis, episodeId, projectId, registeredChars, registeredLocs, registeredOutfits, generatedImages, refImages, artStyleKey]);

  // ── 전체 패널 순차 생성 ──
  const generateAllPanels = useCallback(async () => {
    if (!kieReady) {
      alert("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력하세요.");
      return;
    }
    setIsGeneratingAll(true);
    for (let i = 0; i < editingPanels.length; i++) {
      // narration/skip 패널은 이미지 생성 제외
      const pType = editingPanels[i].panel_type ?? "visual";
      if (pType === "narration" || pType === "skip") continue;
      if (generatedImages[i]) continue;
      await generatePanelImage(i);
    }
    setIsGeneratingAll(false);
  }, [editingPanels, kieReady, generatedImages, generatePanelImage]);

  // ── "레퍼런스로 저장" 모달 열기 (Auto Tag 실행) ──
  const openSaveRefModal = useCallback(async (idx: number) => {
    const imageUrl = generatedImages[idx];
    if (!imageUrl) return;

    const panel = editingPanels[idx];
    setSaveRefModal({
      open: true, panelIdx: idx, imageUrl,
      autoTags: null, isTagging: true,
      selectedCharName: panel?.characters?.[0] || "",
      selectedLocName: analysis?.location?.name || "",
      tagOverrides: {},
    });

    // Vision 기반 Auto Tag 실행
    try {
      const store = useReferenceStore.getState();
      const charNames = store.characters.map(c => c.name);
      const locNames = store.locations.map(l => l.name);
      const tags = await autoTagImageWithVision(
        imageUrl, charNames, locNames,
        panel?.description || panel?.aiPrompt || ""
      );
      setSaveRefModal(prev => ({ ...prev, autoTags: tags, isTagging: false }));
      console.log("[SaveRef] Auto tags:", tags);
    } catch (e) {
      console.error("[SaveRef] Auto tag failed:", e);
      setSaveRefModal(prev => ({
        ...prev, isTagging: false,
        autoTags: {
          characterTags: { emotion: panel?.emotion || "neutral", outfit: "default", angle: "front", action: "standing" },
          locationTags: { timeOfDay: analysis?.location?.timeOfDay || "afternoon", weather: "clear", mood: "bright" },
          suggestedPromptSnippet: "", confidence: 0,
        },
      }));
    }
  }, [generatedImages, editingPanels, analysis]);

  // ── 레퍼런스 저장 확정 (Firebase 직접 저장 보장) ──
  const confirmSaveReference = useCallback(async () => {
    const { panelIdx, imageUrl, autoTags, selectedCharName, selectedLocName, tagOverrides } = saveRefModal;
    if (!imageUrl || !autoTags) return;

    const store = useReferenceStore.getState();
    const pid = projectId || store.currentProjectId;
    const now = Date.now();
    const saved: string[] = [];

    // 캐릭터 레퍼런스 저장
    if (selectedCharName) {
      const char = store.characters.find(c => c.name === selectedCharName);
      if (char) {
        const charTags: CharacterRefTags = {
          emotion: tagOverrides.emotion || autoTags.characterTags?.emotion || "neutral",
          outfit: tagOverrides.outfit || autoTags.characterTags?.outfit || "default",
          angle: tagOverrides.angle || autoTags.characterTags?.angle || "front",
          action: tagOverrides.action || autoTags.characterTags?.action || "standing",
        };
        const newRef: ReferenceImage = {
          id: `ref_${now}_char`,
          storageUrl: imageUrl,
          tags: charTags,
          sourceEpisode: episodeId || "",
          sourcePanel: panelIdx,
          usageCount: 0,
          quality: 3,
          createdAt: now,
        };
        const updatedChar = { ...char, references: [...char.references, newRef], updatedAt: now };
        const updatedChars = store.characters.map(c =>
          c.name === selectedCharName ? updatedChar : c
        );
        // Zustand 상태 업데이트 (UI 즉시 반영)
        store.setCharacters(updatedChars);
        // Firebase 직접 저장 (갤러리에서 로드 시 보장)
        if (pid) {
          try {
            await firebaseService.saveCharacter(pid, updatedChar);
            console.log(`[SaveRef] Character reference saved to Firebase: ${selectedCharName} (${updatedChar.references.length} refs)`);
          } catch (e) {
            console.error("[SaveRef] Firebase saveCharacter error:", e);
          }
        }
        saved.push(`캐릭터: ${selectedCharName}`);
      }
    }

    // 장소 레퍼런스 저장
    if (selectedLocName) {
      const loc = store.locations.find(l => l.name === selectedLocName);
      if (loc) {
        const locTags: LocationRefTags = {
          timeOfDay: tagOverrides.timeOfDay || autoTags.locationTags?.timeOfDay || "afternoon",
          weather: tagOverrides.weather || autoTags.locationTags?.weather || "clear",
          mood: tagOverrides.mood || autoTags.locationTags?.mood || "bright",
        };
        const newRef: ReferenceImage = {
          id: `ref_${now}_loc`,
          storageUrl: imageUrl,
          tags: locTags,
          sourceEpisode: episodeId || "",
          sourcePanel: panelIdx,
          usageCount: 0,
          quality: 3,
          createdAt: now,
        };
        const updatedLoc = { ...loc, references: [...loc.references, newRef], updatedAt: now };
        const updatedLocs = store.locations.map(l =>
          l.name === selectedLocName ? updatedLoc : l
        );
        store.setLocations(updatedLocs);
        if (pid) {
          try {
            await firebaseServicxe.saveLocation(pid, updatedLoc);
            console.log(`[SaveRef] Location reference saved to Firebase: ${selectedLocName} (${updatedLoc.references.length} refs)`);
          } catch (e) {
            console.error("[SaveRef] Firebase saveLocation error:", e);
          }
        }
        saved.push(`장소: ${selectedLocName}`);
      }
    }

    setSaveRefModal(prev => ({ ...prev, open: false }));
    if (saved.length > 0) {
      alert(`레퍼런스 저장 완료: ${saved.join(", ")}`);
    }
  }, [saveRefModal, episodeId, projectId]);

  // ── 패널 편집 핸들러 ──
  const updatePanel = (idx: number, updates: Partial<GeminiPanelSuggestion>) => {
    setEditingPanels(prev => prev.map((p, i) => i === idx ? { ...p, ...updates } : p));
  };
  const addPanel = () => {
    if (editingPanels.length >= 12) { alert("최대 12패널"); return; }
    setEditingPanels(prev => [...prev, {
      panelNumber: prev.length + 1, description: "", characters: analysis?.characters.map(c => c.name) || [],
      cameraAngle: "medium shot", emotion: "neutral", composition: "", aiPrompt: "", notes: "",
    }]);
  };
  const removePanel = (idx: number) => {
    setEditingPanels(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, panelNumber: i + 1 })));
    setPanelPrompts(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => { const ki = parseInt(k); if (ki < idx) next[ki] = v; else if (ki > idx) next[ki - 1] = v; });
      return next;
    });
    setGeneratedImages(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => { const ki = parseInt(k); if (ki < idx) next[ki] = v; else if (ki > idx) next[ki - 1] = v; });
      return next;
    });
  };
  const movePanel = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= editingPanels.length) return;
    setEditingPanels(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((p, i) => ({ ...p, panelNumber: i + 1 }));
    });
    setPanelPrompts(prev => { const next = { ...prev }; const temp = next[idx]; next[idx] = next[target]; next[target] = temp; return next; });
    setGeneratedImages(prev => { const next = { ...prev }; const temp = next[idx]; next[idx] = next[target]; next[target] = temp; return next; });
  };

  // ── 프롬프트 재생성 ──
  const regeneratePrompt = (idx: number) => {
    const panel = editingPanels[idx];
    if (!analysis) return; 

    const resolved = resolver.resolve({
      characters: panel.characters,
      emotion: panel.emotion,
      location: analysis.location.name,
      timeOfDay: analysis.location.timeOfDay,
      mood: analysis.location.mood,
      currentEpisode: episodeId || "",
      currentPanel: idx,
    });

    const charDescs = panel.characters.map(name => {
      const c = analysis.characters.find(ch => ch.name === name);
      const charRef = resolved.find(r => r.label.includes(name));
      if (c?.promptSnippet) return `[${c.name}: ${c.promptSnippet}]`;
      return `${c?.name || name} (${EMOTION_LABELS[c?.emotion || "neutral"] || c?.emotion})`;
    }).join(" ");

    const locRef = analysis.location.promptSnippet
      ? `[Setting: ${analysis.location.promptSnippet}]`
      : `Location: ${analysis.location.name}`;

    const refNote = resolved.length > 0
      ? `\n\n[References: ${resolved.map(r => r.label).join(", ")}]`
      : "";

    const newPrompt = `webtoon style, ${panel.description}\n\n${charDescs}\n${locRef}\nCamera: ${panel.cameraAngle}, ${panel.composition || ""}\n\nhigh quality, detailed, korean webtoon art style${refNote}`;
    setPanelPrompts(prev => ({ ...prev, [idx]: newPrompt }));
  };

  // ── Figma 전송 ──
  const handleSendToFigma = useCallback(() => {
    const items: StoryboardItem[] = editingPanels.map((panel, idx) => ({
      panelIndex: idx,
      sceneId: `scene_${Date.now()}_${idx}`,
      prompt: panelPrompts[idx] || panel.aiPrompt || panel.description,
      characters: panel.characters,
      locationId: analysis?.location.name,
      emotion: panel.emotion,
      cameraAngle: panel.cameraAngle,
      notes: panel.notes,
    }));
    setStoryboard(items);
    alert("Figma 전송 기능은 추후 업데이트 예정입니다.");
  }, [editingPanels, panelPrompts, analysis, setStoryboard]);

  // ── 단계 ──
  const STEPS = [
    { key: "step1_references" as const, label: "씬 설명", num: 1 },
    { key: "step2_storyboard" as const, label: "씬 분석 & 스토리보드", num: 2 },
    { key: "step3_panels" as const, label: "패널 이어보기", num: 3 },
  ];

  // 현재 모델 정보
  const currentModelInfo = KIE_IMAGE_MODELS.find(m => m.id === selectedModel);

  return (
    <div style={S.container}>
      {/* ── 단계 네비게이션 ── */}
      <div style={S.stepNav}>
        {STEPS.map(step => (
          <button
            key={step.key}
            onClick={() => {
              if (step.key === "step2_storyboard" && !analysis) return;
              if (step.key === "step3_panels" && (!analysis || Object.keys(generatedImages).length === 0)) return;
              setCurrentStep(step.key);
            }}
            style={{
              ...S.stepBtn,
              ...(currentStep === step.key ? S.stepBtnActive : {}),
              opacity: (step.key === "step2_storyboard" && !analysis) ? 0.4
                : (step.key === "step3_panels" && (!analysis || Object.keys(generatedImages).length === 0)) ? 0.4
                : 1,
            }}
          >
            <span style={S.stepNum(currentStep === step.key)}>{step.num}</span>
            {step.label}
          </button>
        ))}
      </div>

      {/* ═══ STEP 1: 씬 설명 입력 ═══ */}
      {currentStep === "step1_references" && (
        <div style={S.stepContent}>
          <div style={S.stepHeader}>
            <h2 style={S.stepTitle}>씬 설명 입력</h2>
            <p style={S.stepDesc}>
              스토리 작가가 작성한 씬 설명을 입력하면, {geminiReady ? "AI가" : "로컬 분석기가"} 자동으로 캐릭터, 장소, 감정을 분석하고 스토리보드 패널로 분할합니다.
            </p>
          </div>

          <div style={S.aiStatusBar}>
            <div style={S.aiStatusDot(geminiReady)} />
            <span style={S.aiStatusText}>
              {geminiReady
                ? `${aiAuthLabel} 연결됨 — 씬 분석 가능`
                : "AI 미설정 — 로컬 분석 모드 (설정에서 API 정보를 입력해주세요)"}
            </span>
          </div>

          {/* ── 씬 분석 모델 선택 ── */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ ...S.label, marginBottom: "8px", display: "block" }}>씬 분석 모델</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {GEMINI_MODELS.map(model => {
                const isSelected = selectedAnalysisModel === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedAnalysisModel(model.id);
                      setGeminiModel(model.id);
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #7c3aed" : "2px solid #e5e7eb",
                      background: isSelected ? "#f5f3ff" : "#fff",
                      color: isSelected ? "#7c3aed" : "#374151",
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "2px",
                      minWidth: "140px",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span>{model.provider === "kie" ? "🤖" : "🔵"}</span>
                      <span>{model.name}</span>
                    </span>
                    <span style={{ fontSize: "11px", color: isSelected ? "#7c3aed" : "#9ca3af", fontWeight: 400 }}>
                      {model.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {(registeredChars.length > 0 || registeredLocs.length > 0) && (
            <div style={S.refStatusBar}>
              <span style={S.refStatusIcon}>📚</span>
              <span>등록된 레퍼런스: 캐릭터 {registeredChars.length}명, 장소 {registeredLocs.length}곳 — 분석 시 자동 참조됩니다</span>
            </div>
          )}

          <div style={S.sceneInputArea}>
            <label style={S.label}>씬 설명 텍스트</label>
            <textarea
              value={sceneText}
              onChange={e => setSceneText(e.target.value)}
              placeholder={`예시:\n\n아침, 밝은 교실. 민지가 교실에 들어서며 밝게 웃는다.\n서호가 창가에 앉아 책을 읽고 있다. 민지가 다가와 인사한다.\n\n민지: "서호야, 좋은 아침!"\n서호: (놀라며 고개를 들고) "어, 민지? 오늘 일찍이네."\n\n민지가 서호 옆자리에 가방을 내려놓으며 앉는다.\n두 사람이 미소를 나누며 아침을 시작한다.`}
              style={S.sceneTextarea}
            />
            <div style={S.sceneInputMeta}>
              <span style={S.charCount}>{sceneText.length}자</span>
              {sceneTextSaveStatus === "saving" && (
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>저장 중...</span>
              )}
              {sceneTextSaveStatus === "saved" && (
                <span style={{ fontSize: 12, color: "#10B981" }}>✓ 저장됨</span>
              )}
              <span style={S.hintText}>TIP: 캐릭터 이름, 장소, 감정, 행동을 구체적으로 적을수록 분석이 정확해집니다</span>
            </div>
          </div>

          {analysisError && (
            <div style={S.errorBox}>
              <strong>분석 오류:</strong> {analysisError}
            </div>
          )}

          <button
            onClick={handleAnalyzeScene}
            disabled={!sceneText.trim() || isAnalyzing}
            style={{ ...S.primaryBtn, opacity: !sceneText.trim() || isAnalyzing ? 0.5 : 1 }}
          >
            {isAnalyzing ? "AI 분석 중..." : "AI로 씬 분석하기 →"}
          </button>
        </div>
      )}

      {/* ═══ STEP 2: 씬 분석 + 레퍼런스 + 스토리보드(이미지 통합) ═══ */}
      {currentStep === "step2_storyboard" && analysis && (
        <div style={S.stepContent}>
          {/* ── 헤더 + 이미지 모델 선택 ── */}
          <div style={S.stepHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <h2 style={S.stepTitle}>씬 분석 & 스토리보드</h2>
              <span style={S.modeBadge(analysisMode === "gemini")}>
                {analysisMode === "gemini" ? "Gemini AI" : "로컬 분석"}
              </span>
            </div>
            <p style={S.stepDesc}>
              {analysisMode === "gemini"
                ? "Gemini AI가 분석한 결과입니다. 레퍼런스 이미지를 생성하고, 패널별 이미지를 바로 확인할 수 있습니다."
                : "로컬 분석 결과입니다. Gemini API를 연결하면 더 정확한 분석이 가능합니다."}
            </p>
          </div>

          {/* ── 이미지 모델 + 아트 스타일 (한 줄) ── */}
          <div style={S.modelSelectorBar}>
            <label style={S.modelLabel}>모델</label>
            <select
              value={selectedModel}
              onChange={e => handleModelChange(e.target.value)}
              style={S.modelSelectCompact}
            >
              {KIE_IMAGE_MODELS.filter(m => m.mode === "text2img").map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <label style={S.modelLabel}>스타일</label>
            <select
              value={artStyleKey}
              onChange={e => setArtStyleKey(e.target.value)}
              style={S.modelSelectCompact}
            >
              {ART_STYLE_KEYS.map(key => (
                <option key={key} value={key}>{ART_STYLES[key].name}</option>
              ))}
            </select>
            <span style={S.kieStatusDot(kieReady)}>
              {kieReady ? "✓ Kie.ai" : "⚠️ API 키 필요"}
            </span>
          </div>

          {/* ── 씬 분석 결과 요약 + 갤러리 링크 ── */}
          <div style={S.analysisSection}>
            <div style={S.refSummaryBar}>
              <div style={S.refSummaryLeft}>
                <span style={S.refSummaryIcon}>📚</span>
                <div>
                  <div style={S.refSummaryText}>
                    캐릭터 {analysis.characters.length}명
                    {analysis.characters.map(c => ` · ${c.name}`).join("")}
                    {analysis.location.name && ` | 장소: ${analysis.location.name}`}
                  </div>
                  <div style={S.refSummarySubtext}>
                    등록된 레퍼런스: 캐릭터 {registeredChars.filter(c => c.references.length > 0).length}명 보유
                    , 장소 {registeredLocs.filter(l => l.references.length > 0).length}곳 보유
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/project/${projectId}/references`)}
                style={S.refGalleryLinkBtn}
              >
                레퍼런스 갤러리에서 관리 →
              </button>
            </div>
          </div>

          {/* ── 스토리보드 패널 (이미지 생성 통합) ── */}
          <div style={S.panelSection}>
            <div style={S.sectionHeader}>
              <h3 style={S.sectionTitle}>스토리보드 패널 ({editingPanels.length})</h3>
              <div style={S.panelSectionActions}>
                <span style={S.generationStatus}>
                  {Object.keys(generatedImages).length} / {editingPanels.length} 생성 완료
                </span>
                <button
                  onClick={generateAllPanels}
                  style={S.generateAllBtn}
                  disabled={isGeneratingAll || generatingIndex !== null || !kieReady}
                >
                  {isGeneratingAll ? "생성 중..." : "전체 패널 이미지 생성"}
                </button>
                <button onClick={addPanel} style={S.addPanelBtn}>+ 패널 추가</button>
              </div>
            </div>

            <div style={S.panelList}>
              {editingPanels.map((panel, idx) => {
                const hasImage = !!generatedImages[idx];
                const isGen = generatingIndex === idx;
                const pType = panel.panel_type ?? "visual";
                const isNonVisual = pType === "narration" || pType === "skip";
                const pTypeBadge: Record<string, { label: string; color: string; bg: string }> = {
                  visual:    { label: "🎨 시각", color: "#1D4ED8", bg: "#EFF6FF" },
                  dialogue:  { label: "💬 대화", color: "#4338CA", bg: "#F5F3FF" },
                  narration: { label: "📖 서술", color: "#92400E", bg: "#FEF3C7" },
                  skip:      { label: "⏭ 건너뜀", color: "#6B7280", bg: "#F3F4F6" },
                };
                const badge = pTypeBadge[pType];

                return (
                  <div key={idx} style={{ ...S.panelCard, opacity: isNonVisual ? 0.6 : 1, borderColor: isNonVisual ? "#E5E7EB" : undefined }}>
                    <div style={S.panelHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={S.panelBadge}>Panel {idx + 1}</span>
                        {/* 씬 타입 배지 */}
                        <span style={{ fontSize: "10px", fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 4, padding: "2px 6px" }}>
                          {badge.label}
                        </span>
                        <button
                          onClick={() => updatePanel(idx, { panel_type: isNonVisual ? "visual" : "skip" })}
                          style={{ fontSize: "10px", padding: "2px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", color: "#6B7280" }}
                          title={isNonVisual ? "이미지 생성 대상으로 전환" : "이미지 생성 제외"}
                        >
                          {isNonVisual ? "생성 포함" : "생성 제외"}
                        </button>
                        {panel.composition && <span style={S.compositionHint}>{panel.composition}</span>}
                        {hasImage && <span style={S.statusDone}>이미지 완료</span>}
                        {isGen && <span style={S.statusGenerating}>생성 중...</span>}
                      </div>
                      <div style={S.panelActions}>
                        <button onClick={() => movePanel(idx, "up")} disabled={idx === 0} style={S.iconBtn}>위로</button>
                        <button onClick={() => movePanel(idx, "down")} disabled={idx === editingPanels.length - 1} style={S.iconBtn}>아래로</button>
                        <button onClick={() => removePanel(idx)} style={S.deleteIconBtn}>삭제</button>
                      </div>
                    </div>

                    <div style={S.panelBodyIntegrated}>
                      {/* 왼쪽: 스토리보드 편집 */}
                      <div style={S.panelLeft}>
                        <label style={S.smallLabel}>장면 설명</label>
                        <textarea
                          value={panel.description}
                          onChange={e => updatePanel(idx, { description: e.target.value })}
                          style={S.panelTextarea}
                        />
                        <div style={S.panelRow}>
                          <div style={S.panelField}>
                            <label style={S.smallLabel}>카메라 앵글</label>
                            <select value={panel.cameraAngle} onChange={e => updatePanel(idx, { cameraAngle: e.target.value })} style={S.panelSelect}>
                              {ANGLE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                          <div style={S.panelField}>
                            <label style={S.smallLabel}>감정</label>
                            <select value={panel.emotion} onChange={e => updatePanel(idx, { emotion: e.target.value })} style={S.panelSelect}>
                              {Object.entries(EMOTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={S.panelCharacters}>
                          <label style={S.smallLabel}>등장 캐릭터</label>
                          <div style={S.refThumbRow}>
                            {analysis.characters.map(char => {
                              const selected = panel.characters.includes(char.name);
                              // 의상 레퍼런스 썸네일 찾기
                              const outfitId = (panel as any).characterOutfits?.[char.name];
                              const outfitEntry = outfitId ? registeredOutfits.find(o => o.id === outfitId) : undefined;
                              const outfitThumb = outfitEntry?.references?.[0]?.storageUrl;
                              // 캐릭터 기본 레퍼런스 (fallback)
                              const charRefThumb = refImages[`char_${char.name}`];
                              const thumbUrl = outfitThumb || charRefThumb;

                              return (
                                <div
                                  key={char.name}
                                  onClick={() => {
                                    const chars = selected ? panel.characters.filter(c => c !== char.name) : [...panel.characters, char.name];
                                    updatePanel(idx, { characters: chars });
                                  }}
                                  style={{
                                    ...S.refThumbItem,
                                    borderColor: selected ? "#2563eb" : "#e5e7eb",
                                    background: selected ? "#eff6ff" : "#fff",
                                    cursor: "pointer",
                                  }}
                                  title={`${char.name}${outfitEntry ? ` — ${outfitEntry.label}` : ""}`}
                                >
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt={char.name} style={S.refThumbImg} />
                                  ) : (
                                    <div style={S.refThumbEmpty} onClick={e => { e.stopPropagation(); openSaveRefModal(idx); }}>
                                      <span style={{ fontSize: "16px" }}>+</span>
                                    </div>
                                  )}
                                  <span style={S.refThumbLabel}>
                                    {outfitEntry ? outfitEntry.label : "의상"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <label style={{ ...S.smallLabel, marginTop: "12px" }}>AI 생성 프롬프트</label>
                        <textarea
                          value={panelPrompts[idx] || ""}
                          onChange={e => setPanelPrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                          style={S.promptTextareaSmall}
                        />
                        <div style={S.promptActions}>
                          <button onClick={() => regeneratePrompt(idx)} style={S.regenerateBtn}>프롬프트 재생성</button>
                        </div>
                      </div>

                      {/* 오른쪽: 패널 이미지 */}
                      <div style={S.panelImageSide}>
                        <div style={S.panelImageArea} onClick={() => hasImage && openLightbox(generatedImages[idx], `Panel ${idx + 1}`)}>
                          {hasImage ? (
                            <img src={generatedImages[idx]} alt={`Panel ${idx + 1}`} style={{ ...S.panelImage, cursor: "pointer" }} />
                          ) : (
                            <div style={S.panelImagePlaceholder}>
                              <div style={{ fontSize: "36px", marginBottom: "8px" }}>🎨</div>
                              <span style={{ fontSize: "13px", color: "#9ca3af" }}>이미지 대기 중</span>
                            </div>
                          )}
                          {isGen && (
                            <div style={S.panelImageOverlay}>
                              <div style={S.spinner} />
                              <span style={{ color: "white", fontSize: "12px", marginTop: "8px" }}>
                                {genProgress[idx] || "생성 중..."}
                              </span>
                            </div>
                          )}
                        </div>
                        {genProgress[idx] && !isGen && (
                          <div style={S.panelImageStatus}>{genProgress[idx]}</div>
                        )}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => generatePanelImage(idx)}
                            style={{ ...S.panelGenBtn, flex: 1 }}
                            disabled={isGen || isGeneratingAll}
                          >
                            {isGen ? "생성 중..." : hasImage ? "재생성" : "이미지 생성"}
                          </button>
                          {hasImage && (
                            <button
                              onClick={() => openSaveRefModal(idx)}
                              style={S.saveRefBtn}
                              title="이 패널을 레퍼런스로 저장"
                            >
                              ★ 레퍼런스 저장
                            </button>
                          )}
                        </div>
                        {/* 레퍼런스 썸네일 스트립 */}
                        <div style={S.refStripWrap}>
                          <label style={{ ...S.smallLabel, fontSize: "10px", marginBottom: "4px" }}>참조 레퍼런스</label>
                          <div style={S.refStripRow}>
                            {/* 이전 패널 */}
                            {idx > 0 && (
                              <div style={S.refStripItem} title="이전 패널">
                                {generatedImages[idx - 1] ? (
                                  <img
                                    src={generatedImages[idx - 1]}
                                    alt="이전 패널"
                                    style={S.refStripImg}
                                    onClick={() => openLightbox(generatedImages[idx - 1], `Panel ${idx}`)}
                                  />
                                ) : (
                                  <div style={S.refStripEmpty}><span style={{ fontSize: "12px" }}>+</span></div>
                                )}
                                <span style={S.refStripLabel}>이전패널</span>
                              </div>
                            )}

                            {/* 캐릭터 의상 레퍼런스 */}
                            {(panel?.characters || []).map((cn: string) => {
                              const outfitId = (panel as any).characterOutfits?.[cn];
                              const outfitEntry = outfitId ? registeredOutfits.find(o => o.id === outfitId) : undefined;
                              const outfitThumb = outfitEntry?.references?.[0]?.storageUrl;
                              const charThumb = refImages[`char_${cn}`];
                              const thumb = outfitThumb || charThumb;
                              return (
                                <div key={`costume_${cn}`} style={S.refStripItem} title={`${cn} 의상${outfitEntry ? `: ${outfitEntry.label}` : ""}`}>
                                  {thumb ? (
                                    <img src={thumb} alt={`${cn} 의상`} style={S.refStripImg} onClick={() => openLightbox(thumb, `${cn} 의상`)} />
                                  ) : (
                                    <div style={S.refStripEmpty} onClick={() => openSaveRefModal(idx)}>
                                      <span style={{ fontSize: "12px" }}>+</span>
                                    </div>
                                  )}
                                  <span style={S.refStripLabel}>{outfitEntry?.label || "의상"}</span>
                                  {thumb && (
                                    <button
                                      onClick={e => { e.stopPropagation(); openSaveRefModal(idx); }}
                                      style={S.refStripSwap}
                                      title="교체"
                                    >↻</button>
                                  )}
                                </div>
                              );
                            })}

                            {/* 장소 레퍼런스 */}
                            {(() => {
                              const panelLocName = (panel as any)?.location || analysis?.location?.name;
                              const locThumb = panelLocName ? (refImages[`loc_${panelLocName}`] || refImages[`loc_${analysis?.location?.name}`]) : undefined;
                              return panelLocName ? (
                                <div style={S.refStripItem} title={`장소: ${panelLocName}`}>
                                  {locThumb ? (
                                    <img src={locThumb} alt={panelLocName} style={S.refStripImg} onClick={() => openLightbox(locThumb, panelLocName)} />
                                  ) : (
                                    <div style={S.refStripEmpty} onClick={() => openSaveRefModal(idx)}>
                                      <span style={{ fontSize: "12px" }}>+</span>
                                    </div>
                                  )}
                                  <span style={S.refStripLabel}>장소</span>
                                  {locThumb && (
                                    <button
                                      onClick={e => { e.stopPropagation(); openSaveRefModal(idx); }}
                                      style={S.refStripSwap}
                                      title="교체"
                                    >↻</button>
                                  )}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 */}
          <div style={S.stepFooter}>
            <button onClick={() => setCurrentStep("step1_references")} style={S.secondaryBtn}>← 씬 설명 수정</button>
            <div style={{ display: "flex", gap: "12px" }}>
              {Object.keys(generatedImages).length > 0 && (
                <button
                  onClick={() => setCurrentStep("step3_panels")}
                  style={S.figmaBtn}
                >
                  패널 이어보기 →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: 패널 이어보기 + Figma Export ═══ */}
      {currentStep === "step3_panels" && analysis && (
        <div style={S.stepContent}>
          <div style={S.stepHeader}>
            <h2 style={S.stepTitle}>패널 이어보기</h2>
            <p style={S.stepDesc}>
              생성된 패널을 웹툰처럼 세로로 이어서 확인합니다. Figma로 내보내기도 이 단계에서 진행할 수 있습니다.
            </p>
          </div>

          {/* Figma 연결 상태 + Export 버튼 */}
          <div style={S3.exportBar}>
            <div style={S3.figmaStatusSection}>
              <div style={S3.figmaStatusDot(figmaStatus.connected)} />
              <span style={S3.figmaStatusText}>
                {figmaStatus.connected
                  ? `Figma 플러그인 연결됨 (${new Date(figmaStatus.lastSyncAt).toLocaleTimeString("ko-KR")})`
                  : "Figma 플러그인 미연결 — 플러그인을 먼저 실행하세요"}
              </span>
              {figmaStatus.progress && (
                <span style={S3.progressText}>
                  {figmaStatus.progress.label} ({figmaStatus.progress.current}/{figmaStatus.progress.total})
                </span>
              )}
            </div>
            <button
              onClick={async () => {
                if (!projectId || !episodeId) { alert("프로젝트/에피소드 정보가 없습니다."); return; }
                setIsExportingToFigma(true);
                setFigmaExportResult(null);
                try {
                  const hasV1Bubbles = Object.keys(v1BubblesByPanel).length > 0;

                  if (hasV1Bubbles) {
                    // ── v1.0 호환 BATCH_SYNC: 원본 bubbles + storageUrl 이미지 ──
                    const pages = Object.entries(generatedImages)
                      .map(([idx, url]) => {
                        const pi = parseInt(idx);
                        const panel = editingPanels[pi];
                        const panelBubbles = v1BubblesByPanel[pi] || [];
                        return {
                          pageIndex: pi,
                          episodeNum: parseInt(episodeId.replace(/\D/g, "") || "1"),
                          image: {
                            id: `panel_img_${pi}`,
                            pageIndex: pi,
                            storageUrl: url,
                            bounds: (panel as any)?.bounds || { x: 0, y: 0, w: v1PageSize.w, h: v1PageSize.h },
                          },
                          images: [{
                            id: `panel_img_${pi}`,
                            pageIndex: pi,
                            storageUrl: url,
                            bounds: (panel as any)?.bounds || { x: 0, y: 0, w: v1PageSize.w, h: v1PageSize.h },
                          }],
                          bubbles: panelBubbles,
                          pageSize: v1PageSize,
                        };
                      })
                      .sort((a, b) => a.pageIndex - b.pageIndex);

                    await figmaBatchSync(projectId, pages as any);
                    setFigmaExportResult(`Figma로 ${pages.length}개 패널 + ${Object.values(v1BubblesByPanel).flat().length}개 말풍선 전송 완료! 플러그인에서 확인하세요.`);
                  } else {
                    // ── v2.1 IMPORT_EPISODE 방식 ──
                    const panelDescs = editingPanels.map((p, i) => ({
                      index: i,
                      description: p.description,
                      characters: p.characters,
                    }));
                    const dialogueHints = extractDialogueHints(sceneText, panelDescs);

                    const sceneBreaks: number[] = [];
                    for (let i = 1; i < editingPanels.length; i++) {
                      const prev = editingPanels[i - 1];
                      const curr = editingPanels[i];
                      const prevChars = new Set(prev.characters);
                      const currChars = new Set(curr.characters);
                      const intersection = [...prevChars].filter(c => currChars.has(c));
                      const union = new Set([...prevChars, ...currChars]).size;
                      if (union > 0 && intersection.length / union < 0.5) {
                        sceneBreaks.push(i);
                      }
                    }

                    const manifestPanels = Object.entries(generatedImages)
                      .map(([idx, url]) => ({
                        index: parseInt(idx),
                        imageUrl: url,
                        width: 800,
                        height: 1067,
                        prompt: panelPrompts[parseInt(idx)] || editingPanels[parseInt(idx)]?.description,
                      }))
                      .sort((a, b) => a.index - b.index);

                    await figmaSyncFullEpisode(
                      projectId,
                      episodeId,
                      1,
                      analysis.sceneOverview || "Episode",
                      manifestPanels,
                      dialogueHints,
                      sceneBreaks
                    );

                    setFigmaExportResult(`Figma로 ${manifestPanels.length}개 패널 전송 완료! 플러그인에서 확인하세요.`);
                  }
                } catch (err: any) {
                  console.error("[FigmaExport] Error:", err);
                  setFigmaExportResult(`전송 실패: ${err.message}`);
                } finally {
                  setIsExportingToFigma(false);
                }
              }}
              style={{
                ...S3.exportBtn,
                opacity: isExportingToFigma ? 0.6 : 1,
              }}
              disabled={isExportingToFigma || Object.keys(generatedImages).length === 0}
            >
              {isExportingToFigma ? "전송 중..." : "Figma로 내보내기"}
            </button>
          </div>

          {figmaExportResult && (
            <div style={{
              ...S.errorBox,
              background: figmaExportResult.includes("실패") ? "#fef2f2" : "#f0fdf4",
              border: figmaExportResult.includes("실패") ? "1px solid #fecaca" : "1px solid #bbf7d0",
              color: figmaExportResult.includes("실패") ? "#991b1b" : "#166534",
            }}>
              {figmaExportResult}
            </div>
          )}

          {/* 패널 카운트 요약 */}
          <div style={S3.summaryBar}>
            <span>총 {Object.keys(generatedImages).length}개 패널</span>
            {analysis.characters.length > 0 && (
              <span>등장 캐릭터: {analysis.characters.map(c => c.name).join(", ")}</span>
            )}
            {analysis.location?.name && <span>장소: {analysis.location.name}</span>}
          </div>

          {/* 세로 패널 스트립 */}
          <div style={S3.stripContainer}>
            <div style={S3.strip}>
              {editingPanels.map((panel, idx) => {
                const imageUrl = generatedImages[idx];
                if (!imageUrl) return null;

                // 이 패널의 대사 추출
                const panelDescs = editingPanels.map((p, i) => ({
                  index: i, description: p.description, characters: p.characters,
                }));
                const allDialogues = extractDialogueHints(sceneText, panelDescs);
                const panelDialogues = allDialogues.filter(d => d.panelIndex === idx);

                return (
                  <div key={idx} style={S3.panelFrame}>
                    {/* 패널 번호 표시 */}
                    <div style={S3.panelNumber}>#{idx + 1}</div>

                    {/* 패널 이미지 */}
                    <img
                      src={imageUrl}
                      alt={`Panel ${idx + 1}`}
                      style={{ ...S3.panelImg, cursor: "pointer" }}
                      onClick={() => openLightbox(imageUrl, `Panel ${idx + 1}`)}
                    />

                    {/* 대사/나래이션/효과음 오버레이 */}
                    {(() => {
                      const v1b = v1BubblesByPanel[idx] || v1BubblesByPanel[String(idx) as any];
                      if (v1b && v1b.length > 0) {
                        // v1.0 말풍선: 패널별 로컬 좌표 기반 오버레이
                        const panelSize = v1PageSizeByPanel[idx] || v1PageSize;
                        const pw = panelSize.w || 800;
                        const ph = panelSize.h || 1067;
                        return (
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                            {v1b.map((b: any, bi: number) => {
                              const xPct = (b.position.x / pw) * 100;
                              const yPct = (b.position.y / ph) * 100;
                              const wPct = ((b.size?.w || 200) / pw) * 100;
                              const baseFontSize = Math.max(8, Math.min(24, (b.style?.fontSize || 16) * (300 / pw)));

                              if (b.type === "sfx") {
                                return (
                                  <div key={bi} style={{
                                    position: "absolute",
                                    left: `${xPct}%`, top: `${yPct}%`, width: `${wPct}%`,
                                    fontFamily: b.style?.fontFamily || "'Nanum Brush Script', cursive",
                                    fontWeight: b.style?.fontWeight || "900",
                                    fontSize: `${baseFontSize * 1.5}px`,
                                    color: b.style?.color || "#000",
                                    textShadow: `
                                      -1px -1px 0 ${b.style?.strokeColor || "#fff"},
                                      1px -1px 0 ${b.style?.strokeColor || "#fff"},
                                      -1px 1px 0 ${b.style?.strokeColor || "#fff"},
                                      1px 1px 0 ${b.style?.strokeColor || "#fff"}`,
                                    transform: b.style?.rotation ? `rotate(${b.style.rotation}deg)` : undefined,
                                    whiteSpace: "pre-wrap",
                                    lineHeight: 1.1,
                                  }}>
                                    {b.text}
                                  </div>
                                );
                              }
                              if (b.type === "narration") {
                                return (
                                  <div key={bi} style={{
                                    position: "absolute",
                                    left: `${xPct}%`, top: `${yPct}%`, width: `${wPct}%`,
                                    background: "rgba(0,0,0,0.72)",
                                    color: "#fff",
                                    padding: "4px 8px",
                                    borderRadius: "3px",
                                    fontSize: `${baseFontSize}px`,
                                    lineHeight: 1.4,
                                    whiteSpace: "pre-wrap",
                                  }}>
                                    {b.text}
                                  </div>
                                );
                              }
                              // dialogue
                              return (
                                <div key={bi} style={{
                                  position: "absolute",
                                  left: `${xPct}%`, top: `${yPct}%`, width: `${wPct}%`,
                                  background: "#fff",
                                  border: "2px solid #000",
                                  borderRadius: "16px",
                                  padding: "4px 8px",
                                  fontSize: `${baseFontSize}px`,
                                  color: b.style?.color || "#000",
                                  textAlign: "center" as const,
                                  lineHeight: 1.3,
                                  whiteSpace: "pre-wrap",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                                }}>
                                  {b.text}
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                      // v2.1 기본: 추출된 대사 오버레이
                      if (panelDialogues.length > 0) {
                        return (
                          <div style={S3.dialogueOverlay}>
                            {panelDialogues.map((d, di) => (
                              <div key={di} style={S3.speechBubble}>
                                <span style={S3.speechCharName}>{d.character}</span>
                                <span style={S3.speechText}>{d.text}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* 패널 설명 (하단 캡션) */}
                    <div style={S3.panelCaption}>
                      <span style={S3.captionText}>{panel.description.slice(0, 80)}{panel.description.length > 80 ? "..." : ""}</span>
                      <div style={S3.captionMeta}>
                        <span>{panel.cameraAngle}</span>
                        {panel.emotion && <span>{EMOTION_LABELS[panel.emotion] || panel.emotion}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 */}
          <div style={S.stepFooter}>
            <button onClick={() => setCurrentStep("step2_storyboard")} style={S.secondaryBtn}>← 스토리보드</button>
          </div>
        </div>
      )}

      {/* ═══ 레퍼런스 저장 모달 ═══ */}
      {saveRefModal.open && (
        <div style={S.modalOverlay} onClick={() => setSaveRefModal(prev => ({ ...prev, open: false }))}>
          <div style={S.refModal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>★ 레퍼런스로 저장</h3>

            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
              {/* 이미지 미리보기 */}
              <img src={saveRefModal.imageUrl} alt="Panel" style={{ width: "180px", borderRadius: "8px", objectFit: "cover" }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {saveRefModal.isTagging ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af" }}>
                    <div style={S.spinner} />
                    <p style={{ marginTop: "8px", fontSize: "13px" }}>AI 이미지 분석 중...</p>
                  </div>
                ) : (
                  <>
                    {/* 캐릭터 선택 */}
                    <label style={S.smallLabel}>캐릭터에 등록</label>
                    <select
                      value={saveRefModal.selectedCharName}
                      onChange={e => setSaveRefModal(prev => ({ ...prev, selectedCharName: e.target.value }))}
                      style={S.selectInput}
                    >
                      <option value="">선택 안 함</option>
                      {(analysis?.characters || []).map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>

                    {saveRefModal.selectedCharName && saveRefModal.autoTags?.characterTags && (
                      <div style={S.tagGrid}>
                        {(["emotion", "outfit", "angle", "action"] as const).map(field => (
                          <div key={field}>
                            <label style={S.tinyLabel}>{field}</label>
                            <input
                              value={saveRefModal.tagOverrides[field] || saveRefModal.autoTags?.characterTags?.[field] || ""}
                              onChange={e => setSaveRefModal(prev => ({
                                ...prev, tagOverrides: { ...prev.tagOverrides, [field]: e.target.value }
                              }))}
                              style={S.tagInput}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 장소 선택 */}
                    <label style={{ ...S.smallLabel, marginTop: "12px" }}>장소에 등록</label>
                    <select
                      value={saveRefModal.selectedLocName}
                      onChange={e => setSaveRefModal(prev => ({ ...prev, selectedLocName: e.target.value }))}
                      style={S.selectInput}
                    >
                      <option value="">선택 안 함</option>
                      {analysis?.location && <option value={analysis.location.name}>{analysis.location.name}</option>}
                    </select>

                    {saveRefModal.selectedLocName && saveRefModal.autoTags?.locationTags && (
                      <div style={S.tagGrid}>
                        {(["timeOfDay", "weather", "mood"] as const).map(field => (
                          <div key={field}>
                            <label style={S.tinyLabel}>{field}</label>
                            <input
                              value={saveRefModal.tagOverrides[field] || saveRefModal.autoTags?.locationTags?.[field] || ""}
                              onChange={e => setSaveRefModal(prev => ({
                                ...prev, tagOverrides: { ...prev.tagOverrides, [field]: e.target.value }
                              }))}
                              style={S.tagInput}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {saveRefModal.autoTags?.confidence != null && (
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "8px" }}>
                        AI 신뢰도: {Math.round((saveRefModal.autoTags.confidence || 0) * 100)}%
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setSaveRefModal(prev => ({ ...prev, open: false }))}
                style={S.secondaryBtn}
              >
                취소
              </button>
              <button
                onClick={confirmSaveReference}
                disabled={saveRefModal.isTagging || (!saveRefModal.selectedCharName && !saveRefModal.selectedLocName)}
                style={{
                  ...S.primaryBtn,
                  opacity: saveRefModal.isTagging || (!saveRefModal.selectedCharName && !saveRefModal.selectedLocName) ? 0.5 : 1,
                  padding: "8px 20px",
                  fontSize: "13px",
                }}
              >
                레퍼런스 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 이미지 라이트박스 팝업 ═══ */}
      {lightbox && (
        <div style={SLB.overlay} onClick={closeLightbox}>
          <div style={SLB.container} onClick={e => e.stopPropagation()}>
            {/* 상단 바: 제목 + 버튼 */}
            <div style={SLB.topBar}>
              <span style={SLB.title}>{lightbox.title}</span>
              <div style={SLB.actions}>
                <button
                  onClick={() => downloadImage(lightbox.url, `${lightbox.title.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}.png`)}
                  style={SLB.downloadBtn}
                >
                  저장
                </button>
                <button onClick={closeLightbox} style={SLB.closeBtn}>✕</button>
              </div>
            </div>
            {/* 이미지 */}
            <div style={SLB.imageWrap}>
              <img src={lightbox.url} alt={lightbox.title} style={SLB.image} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 예시 씬 데이터 ──────────────────────────────────────────

const EXAMPLE_SCENES = [
  {
    title: "교실 첫 만남",
    text: `아침, 밝은 교실. 햇살이 창문을 통해 들어온다.
민지가 교실 문을 열고 들어서며 밝게 웃는다.
서호가 창가 자리에 앉아 조용히 책을 읽고 있다.

민지가 서호에게 다가가며 손을 흔든다.
민지: "서호야, 좋은 아침!"
서호: (놀라며 고개를 들고) "어, 민지? 오늘 일찍이네."

민지가 서호 옆자리에 가방을 내려놓으며 앉는다.
두 사람이 서로 미소를 나누며 하루를 시작한다.`,
  },
  {
    title: "옥상 대화",
    text: `저녁, 학교 옥상. 노을이 붉게 물들어 있다.
서호가 난간에 기대어 서서 먼 곳을 바라보고 있다.

민지가 옥상 문을 열고 조용히 올라온다.
민지: "여기 있었구나. 찾았다."
서호: (돌아보며 쓸쓸하게 웃고) "...미안, 혼자 있고 싶었어."

민지가 서호 옆에 나란히 서서 노을을 바라본다.
한동안 침묵이 흐르고, 바람이 두 사람의 머리카락을 흩날린다.
민지: "괜찮아, 같이 있어줄게."`,
  },
  {
    title: "카페 재회",
    text: `오후, 따뜻한 분위기의 카페. 잔잔한 음악이 흐른다.
지우가 창가 테이블에 앉아 커피를 마시고 있다.

하준이 카페 문을 열고 들어온다. 지우를 발견하고 깜짝 놀란다.
하준: "지우...? 정말 오랜만이다."
지우: (컵을 내려놓으며 놀란 표정) "하준이? 여기서 만나다니."

하준이 맞은편에 앉으며 어색하게 웃는다.
두 사람 사이에 미묘한 긴장감이 흐른다.`,
  },
];

// ─── 스타일 ──────────────────────────────────────────────────

const S = {
  container: { padding: "0", maxWidth: "1400px", margin: "0 auto" } as const,

  stepNav: {
    display: "flex", gap: "4px", padding: "16px 24px",
    borderBottom: "1px solid #e5e7eb", background: "white",
    position: "sticky" as const, top: 0, zIndex: 10,
  } as const,
  stepBtn: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "10px 20px", border: "none", background: "transparent",
    color: "#6b7280", cursor: "pointer", fontSize: "14px", fontWeight: "500",
    borderRadius: "8px", transition: "all 0.2s",
  } as const,
  stepBtnActive: { background: "#eff6ff", color: "#2563eb", fontWeight: "600" } as const,
  stepNum: (active: boolean) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "24px", height: "24px", borderRadius: "50%", fontSize: "12px", fontWeight: "700",
    background: active ? "#2563eb" : "#e5e7eb", color: active ? "white" : "#6b7280",
  } as const),

  stepContent: { padding: "24px" } as const,
  stepHeader: { marginBottom: "24px" } as const,
  stepTitle: { fontSize: "24px", fontWeight: "700", color: "#111827", margin: "0 0 8px 0" } as const,
  stepDesc: { fontSize: "14px", color: "#6b7280", margin: 0, lineHeight: "1.5" } as const,

  aiStatusBar: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "10px 16px", borderRadius: "8px", marginBottom: "16px",
    background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "13px", color: "#166534",
  } as const,
  aiStatusDot: (ready: boolean) => ({
    width: "8px", height: "8px", borderRadius: "50%",
    background: ready ? "#22c55e" : "#f59e0b", flexShrink: 0,
  } as const),
  aiStatusText: { fontSize: "13px" } as const,

  refStatusBar: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "10px 16px", borderRadius: "8px", marginBottom: "16px",
    background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: "13px", color: "#1e40af",
  } as const,
  refStatusIcon: { fontSize: "16px" } as const,

  sceneInputArea: { marginBottom: "24px" } as const,
  label: { display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" } as const,
  sceneTextarea: {
    width: "100%", minHeight: "240px", padding: "16px",
    border: "2px solid #e5e7eb", borderRadius: "12px", fontSize: "15px",
    fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif", lineHeight: "1.8",
    boxSizing: "border-box" as const, resize: "vertical" as const,
  } as const,
  sceneInputMeta: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: "8px", fontSize: "12px", color: "#9ca3af",
  } as const,
  charCount: { fontVariantNumeric: "tabular-nums" } as const,
  hintText: { fontStyle: "italic" as const } as const,

  errorBox: {
    padding: "12px 16px", borderRadius: "8px", marginBottom: "16px",
    background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "14px",
  } as const,

  exampleSection: { marginBottom: "32px" } as const,
  exampleTitle: { fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "12px" } as const,
  exampleGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" } as const,
  exampleBtn: {
    display: "flex", flexDirection: "column" as const, alignItems: "flex-start",
    padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px",
    background: "white", cursor: "pointer", textAlign: "left" as const, gap: "4px",
  } as const,
  examplePreview: { fontSize: "12px", color: "#9ca3af", lineHeight: "1.4" } as const,

  primaryBtn: {
    padding: "12px 28px", background: "#2563eb", color: "white",
    border: "none", borderRadius: "8px", cursor: "pointer",
    fontSize: "15px", fontWeight: "600",
  } as const,
  secondaryBtn: {
    padding: "10px 20px", background: "white", color: "#374151",
    border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer",
    fontSize: "14px", fontWeight: "500",
  } as const,

  modeBadge: (isGemini: boolean) => ({
    padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "600",
    background: isGemini ? "#dcfce7" : "#fef3c7",
    color: isGemini ? "#166534" : "#92400e",
  } as const),

  // ── 이미지 모델 + 스타일 선택 바 (한 줄) ──
  modelSelectorBar: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" as const,
    padding: "10px 14px", marginBottom: "16px",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    border: "1px solid #c7d2fe", borderRadius: "10px",
  } as const,
  modelLabel: { fontSize: "12px", fontWeight: "600", color: "#4338ca", whiteSpace: "nowrap" as const } as const,
  modelSelectCompact: {
    padding: "6px 10px", border: "1px solid #c7d2fe", borderRadius: "6px",
    fontSize: "12px", background: "white", color: "#1e1b4b", maxWidth: "220px", flex: 1,
  } as const,
  kieStatusDot: (ready: boolean) => ({
    fontSize: "12px", fontWeight: "500",
    color: ready ? "#059669" : "#d97706",
  } as const),

  // ── 레퍼런스 요약 바 ──
  refSummaryBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 18px", background: "#f5f3ff",
    border: "1px solid #ddd6fe", borderRadius: "10px",
  } as const,
  refSummaryLeft: { display: "flex", alignItems: "center", gap: "10px" } as const,
  refSummaryIcon: { fontSize: "22px" } as const,
  refSummaryText: { fontSize: "13px", fontWeight: "600", color: "#374151" } as const,
  refSummarySubtext: { fontSize: "12px", color: "#6b7280", marginTop: "2px" } as const,
  refGalleryLinkBtn: {
    padding: "8px 18px", background: "#6366f1", color: "white",
    border: "none", borderRadius: "8px", cursor: "pointer",
    fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" as const,
  } as const,

  // ── 레퍼런스 섹션 ──
  analysisSection: { marginBottom: "32px" } as const,
  sectionHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px",
  } as const,
  sectionTitle: { fontSize: "18px", fontWeight: "600", color: "#111827", margin: 0 } as const,

  refGenAllBtn: {
    padding: "8px 20px",
    background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
    color: "white", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "13px", fontWeight: "600",
  } as const,

  refGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px",
  } as const,
  refCard: {
    background: "white", border: "1px solid #e5e7eb", borderRadius: "12px",
    overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transition: "box-shadow 0.2s",
  } as const,
  refCardImageArea: {
    position: "relative" as const, aspectRatio: "1", background: "#f3f4f6",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  } as const,
  refCardImage: { width: "100%", height: "100%", objectFit: "cover" as const } as const,
  refCardPlaceholder: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", height: "100%",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
  } as const,
  charAvatarLarge: {
    width: "64px", height: "64px", borderRadius: "50%",
    background: "rgba(255,255,255,0.2)", color: "white",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: "700", fontSize: "28px",
  } as const,
  refCardOverlay: {
    position: "absolute" as const, inset: 0,
    background: "rgba(0,0,0,0.5)", display: "flex",
    alignItems: "center", justifyContent: "center",
  } as const,
  refCardBody: { padding: "12px" } as const,
  refCardType: {
    display: "inline-block", padding: "2px 8px", borderRadius: "4px",
    fontSize: "10px", fontWeight: "700", textTransform: "uppercase" as const,
    background: "#ede9fe", color: "#5b21b6", marginBottom: "4px",
  } as const,
  refCardName: { display: "block", fontSize: "15px", color: "#111827", marginBottom: "4px" } as const,
  refCardDesc: { fontSize: "11px", color: "#6b7280", margin: "0 0 6px", lineHeight: "1.4" } as const,
  refCardMeta: { display: "flex", gap: "4px", flexWrap: "wrap" as const, marginBottom: "8px" } as const,
  refProgressText: { fontSize: "11px", color: "#667eea", marginBottom: "6px" } as const,
  refGenBtn: {
    width: "100%", padding: "6px", background: "#6366f1", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
  } as const,

  metaBadge: (type: string) => ({
    padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "500",
    background: type === "emotion" ? "#fef3c7" : type === "action" ? "#dbeafe" : type === "time" ? "#e0e7ff" : type === "weather" ? "#f0fdf4" : "#d1fae5",
    color: type === "emotion" ? "#92400e" : type === "action" ? "#1e40af" : type === "time" ? "#3730a3" : type === "weather" ? "#166534" : "#065f46",
  } as const),

  // ── 패널 섹션 ──
  panelSection: { marginBottom: "32px" } as const,
  panelSectionActions: { display: "flex", alignItems: "center", gap: "12px" } as const,
  generationStatus: { fontSize: "13px", color: "#6b7280", fontWeight: "500" } as const,
  generateAllBtn: {
    padding: "8px 20px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "13px", fontWeight: "600",
  } as const,
  addPanelBtn: {
    padding: "6px 16px", background: "#10b981", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600",
  } as const,

  panelList: { display: "flex", flexDirection: "column" as const, gap: "16px" } as const,
  panelCard: {
    background: "white", border: "1px solid #e5e7eb", borderRadius: "12px",
    overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  } as const,
  panelHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
  } as const,
  panelBadge: {
    padding: "4px 12px", background: "#2563eb", color: "white",
    borderRadius: "4px", fontSize: "12px", fontWeight: "700",
  } as const,
  compositionHint: { fontSize: "11px", color: "#6b7280", fontStyle: "italic" as const } as const,
  statusDone: {
    padding: "2px 8px", background: "#d1fae5", color: "#065f46",
    borderRadius: "4px", fontSize: "11px", fontWeight: "600",
  } as const,
  statusGenerating: {
    padding: "2px 8px", background: "#fef3c7", color: "#92400e",
    borderRadius: "4px", fontSize: "11px", fontWeight: "600",
  } as const,
  panelActions: { display: "flex", gap: "4px" } as const,
  iconBtn: {
    padding: "4px 8px", border: "1px solid #d1d5db",
    background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px",
  } as const,
  deleteIconBtn: {
    padding: "4px 8px", border: "1px solid #fca5a5",
    background: "#fef2f2", borderRadius: "4px", cursor: "pointer",
    fontSize: "12px", color: "#dc2626",
  } as const,

  // 통합 패널 본문: 좌측 편집 + 우측 이미지
  panelBodyIntegrated: {
    display: "grid", gridTemplateColumns: "1fr 320px", gap: "0", padding: "0",
  } as const,
  panelLeft: { padding: "16px" } as const,
  panelImageSide: {
    borderLeft: "1px solid #e5e7eb", padding: "16px",
    display: "flex", flexDirection: "column" as const, gap: "8px",
  } as const,
  panelImageArea: {
    position: "relative" as const,
    aspectRatio: "3/4", background: "#f3f4f6", borderRadius: "8px",
    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
  } as const,
  panelImage: { width: "100%", height: "100%", objectFit: "cover" as const } as const,
  panelImagePlaceholder: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", width: "100%", height: "100%",
  } as const,
  panelImageOverlay: {
    position: "absolute" as const, inset: 0,
    background: "rgba(0,0,0,0.55)", display: "flex",
    flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
  } as const,
  panelImageStatus: { fontSize: "11px", color: "#667eea", textAlign: "center" as const } as const,
  panelGenBtn: {
    width: "100%", padding: "10px", background: "#2563eb", color: "white",
    border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600",
  } as const,

  smallLabel: {
    display: "block", fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px",
  } as const,
  panelTextarea: {
    width: "100%", minHeight: "60px", padding: "10px",
    border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px",
    fontFamily: "inherit", lineHeight: "1.5", boxSizing: "border-box" as const,
    resize: "vertical" as const, marginBottom: "8px",
  } as const,
  panelRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" } as const,
  panelField: {} as const,
  panelSelect: {
    width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb",
    borderRadius: "6px", fontSize: "13px", background: "white",
  } as const,
  panelCharacters: { marginBottom: "8px" } as const,
  charChips: { display: "flex", gap: "6px", flexWrap: "wrap" as const } as const,
  charChip: {
    padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: "20px",
    background: "white", cursor: "pointer", fontSize: "12px", fontWeight: "500",
  } as const,
  charChipActive: {
    padding: "4px 12px", border: "1px solid #2563eb", borderRadius: "20px",
    background: "#eff6ff", color: "#2563eb", cursor: "pointer",
    fontSize: "12px", fontWeight: "600",
  } as const,
  promptTextareaSmall: {
    width: "100%", minHeight: "80px", padding: "8px",
    border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "11px",
    fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: "1.4",
    boxSizing: "border-box" as const, resize: "vertical" as const,
    background: "#f9fafb",
  } as const,
  promptActions: { display: "flex", gap: "8px", marginTop: "4px" } as const,
  regenerateBtn: {
    padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: "4px",
    background: "white", cursor: "pointer", fontSize: "11px", color: "#6b7280",
  } as const,

  stepFooter: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    paddingTop: "24px", borderTop: "1px solid #e5e7eb",
  } as const,
  figmaBtn: {
    padding: "12px 28px", background: "#8b5cf6", color: "white",
    border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "15px", fontWeight: "600",
  } as const,

  // ── "레퍼런스 저장" 버튼 ──
  // ── 캐릭터 의상 썸네일 그리드 ──
  refThumbRow: { display: "flex", gap: "8px", flexWrap: "wrap" as const } as const,
  refThumbItem: {
    width: "56px", display: "flex", flexDirection: "column" as const,
    alignItems: "center", gap: "2px", border: "2px solid #e5e7eb",
    borderRadius: "8px", padding: "3px", transition: "border-color 0.15s",
  } as const,
  refThumbImg: { width: "48px", height: "48px", objectFit: "cover" as const, borderRadius: "6px" } as const,
  refThumbEmpty: {
    width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f3f4f6", borderRadius: "6px", color: "#9ca3af", cursor: "pointer", border: "1px dashed #d1d5db",
  } as const,
  refThumbLabel: {
    fontSize: "9px", color: "#6b7280", textAlign: "center" as const,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "56px",
  } as const,
  // ── 레퍼런스 썸네일 스트립 ──
  refStripWrap: { marginTop: "4px" } as const,
  refStripRow: { display: "flex", gap: "6px", flexWrap: "wrap" as const } as const,
  refStripItem: {
    position: "relative" as const, width: "48px",
    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "2px",
  } as const,
  refStripImg: {
    width: "44px", height: "44px", objectFit: "cover" as const,
    borderRadius: "6px", border: "1px solid #e5e7eb", cursor: "pointer",
  } as const,
  refStripEmpty: {
    width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f3f4f6", borderRadius: "6px", color: "#9ca3af", cursor: "pointer", border: "1px dashed #d1d5db",
  } as const,
  refStripLabel: {
    fontSize: "8px", color: "#9ca3af", textAlign: "center" as const,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "48px",
  } as const,
  refStripSwap: {
    position: "absolute" as const, top: "-4px", right: "-4px",
    width: "16px", height: "16px", borderRadius: "50%" , border: "1px solid #d1d5db",
    background: "#fff", cursor: "pointer", fontSize: "10px", lineHeight: "14px",
    textAlign: "center" as const, padding: 0, color: "#6b7280",
  } as const,
    saveRefBtn: {
    padding: "6px 10px", background: "#fef3c7", color: "#92400e",
    border: "1px solid #fbbf24", borderRadius: "6px", cursor: "pointer",
    fontSize: "11px", fontWeight: "600", whiteSpace: "nowrap",
  } as const,

  // ── 모달 ──
  modalOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
    justifyContent: "center", zIndex: 1000,
  } as const,
  refModal: {
    background: "#1f2937", borderRadius: "12px", padding: "24px",
    width: "560px", maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
    color: "#e5e7eb",
  } as const,
  selectInput: {
    width: "100%", padding: "6px 8px", background: "#374151", color: "#e5e7eb",
    border: "1px solid #4b5563", borderRadius: "6px", fontSize: "13px",
    marginBottom: "8px",
  } as const,
  tagGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px",
    marginTop: "4px", marginBottom: "4px",
  } as const,
  tinyLabel: {
    display: "block", fontSize: "10px", color: "#9ca3af",
    marginBottom: "2px", textTransform: "uppercase",
  } as const,
  tagInput: {
    width: "100%", padding: "4px 6px", background: "#374151", color: "#e5e7eb",
    border: "1px solid #4b5563", borderRadius: "4px", fontSize: "12px",
    boxSizing: "border-box",
  } as const,

  // ── 스피너 ──
  spinner: {
    width: "32px", height: "32px", border: "3px solid rgba(255,255,255,0.3)",
    borderTopColor: "white", borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  } as const,
};

// ─── Step 3 스타일 ──────────────────────────────────────────

const S3 = {
  exportBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 20px", marginBottom: "16px",
    background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
    border: "1px solid #c4b5fd", borderRadius: "12px",
  } as const,
  figmaStatusSection: {
    display: "flex", alignItems: "center", gap: "8px",
  } as const,
  figmaStatusDot: (connected: boolean) => ({
    width: "10px", height: "10px", borderRadius: "50%",
    background: connected ? "#22c55e" : "#f59e0b",
    boxShadow: connected ? "0 0 6px rgba(34,197,94,0.5)" : "none",
    flexShrink: 0,
  } as const),
  figmaStatusText: {
    fontSize: "13px", color: "#5b21b6", fontWeight: "500",
  } as const,
  progressText: {
    fontSize: "12px", color: "#7c3aed", fontWeight: "600",
    padding: "2px 8px", background: "rgba(139,92,246,0.1)", borderRadius: "4px",
  } as const,
  exportBtn: {
    padding: "10px 24px",
    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
    color: "white", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "14px", fontWeight: "600",
    boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
  } as const,

  summaryBar: {
    display: "flex", gap: "20px", alignItems: "center",
    padding: "10px 16px", marginBottom: "20px",
    background: "#f9fafb", borderRadius: "8px",
    fontSize: "13px", color: "#6b7280", fontWeight: "500",
  } as const,

  stripContainer: {
    display: "flex", justifyContent: "center",
    padding: "20px 0",
    background: "#1f2937",
    borderRadius: "12px",
    minHeight: "400px",
    maxHeight: "70vh",
    overflowY: "auto" as const,
  } as const,
  strip: {
    width: "600px",
    display: "flex", flexDirection: "column" as const,
    gap: "0px",
  } as const,

  panelFrame: {
    position: "relative" as const,
    borderBottom: "2px solid #374151",
  } as const,
  panelNumber: {
    position: "absolute" as const, top: "8px", left: "8px",
    background: "rgba(0,0,0,0.6)", color: "white",
    padding: "2px 8px", borderRadius: "4px",
    fontSize: "11px", fontWeight: "700", zIndex: 2,
  } as const,
  panelImg: {
    width: "100%", display: "block",
    objectFit: "cover" as const,
  } as const,

  dialogueOverlay: {
    position: "absolute" as const, bottom: "60px", left: "12px", right: "12px",
    display: "flex", flexDirection: "column" as const, gap: "6px",
    zIndex: 2, pointerEvents: "none" as const,
  } as const,
  speechBubble: {
    display: "inline-flex", flexDirection: "column" as const,
    background: "rgba(255,255,255,0.92)",
    border: "2px solid #111827",
    borderRadius: "16px", padding: "8px 14px",
    maxWidth: "80%", boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
  } as const,
  speechCharName: {
    fontSize: "10px", fontWeight: "700", color: "#6d28d9",
    marginBottom: "2px",
  } as const,
  speechText: {
    fontSize: "13px", color: "#111827", lineHeight: "1.4",
  } as const,

  panelCaption: {
    padding: "8px 12px",
    background: "rgba(0,0,0,0.7)",
  } as const,
  captionText: {
    fontSize: "12px", color: "#d1d5db", lineHeight: "1.4",
    display: "block",
  } as const,
  captionMeta: {
    display: "flex", gap: "8px", marginTop: "4px",
    fontSize: "11px", color: "#9ca3af",
  } as const,
};

// ─── 라이트박스 스타일 ────────────────────────────────────────

const SLB = {
  overlay: {
    position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.85)", display: "flex",
    alignItems: "center", justifyContent: "center",
    zIndex: 2000, cursor: "zoom-out",
  } as const,
  container: {
    display: "flex", flexDirection: "column" as const,
    maxWidth: "92vw", maxHeight: "92vh",
    borderRadius: "12px", overflow: "hidden",
    background: "#111827", cursor: "default",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
  } as const,
  topBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", background: "#1f2937",
    borderBottom: "1px solid #374151",
  } as const,
  title: {
    fontSize: "14px", fontWeight: "600", color: "#e5e7eb",
  } as const,
  actions: {
    display: "flex", gap: "8px", alignItems: "center",
  } as const,
  downloadBtn: {
    padding: "6px 16px", background: "#2563eb", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer",
    fontSize: "13px", fontWeight: "600",
  } as const,
  closeBtn: {
    width: "32px", height: "32px", display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "transparent", color: "#9ca3af",
    border: "1px solid #4b5563", borderRadius: "6px",
    cursor: "pointer", fontSize: "16px",
  } as const,
  imageWrap: {
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "auto", padding: "8px",
  } as const,
  image: {
    maxWidth: "88vw", maxHeight: "82vh",
    objectFit: "contain" as const, borderRadius: "4px",
  } as const,
};

// 스피너 애니메이션 주입
if (typeof document !== "undefined" && !document.getElementById("pipeline-spinner-style")) {
  const style = document.createElement("style");
  style.id = "pipeline-spinner-style";
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
