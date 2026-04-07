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
  type GeminiSceneAnalysis,
  type GeminiPanelSuggestion,
  type GeminiCharacterAnalysis,
  type GeminiAutoTagResult,
  type PanelType,
} from "@/services/geminiService";
import { ReferenceResolver, buildFallbackPrompt } from "@/services/referenceResolver";
import { applyPromptRules, type PanelPromptContext, type SubjectInfo } from "@/services/promptRules";
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
  generateVertexBatch,
  type KieTaskState,
  type BatchPanelRequest,
} from "@/services/kieImageService";
import { firebaseService, getFirebaseConfig, ensureFirebaseReady } from "@/services";
import { uploadImage } from "@/services/firebase";

// ─── LocalAnalysis 타입 (GeminiSceneAnalysis와 동일 구조) ──
type LocalAnalysis = GeminiSceneAnalysis;

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
  analysisMode: "gemini" | null;
  analysis: any;
  editingPanels: GeminiPanelSuggestion[];
  panelPrompts: Record<number, string>;
  generatedImages: Record<number, string>;
  refImages: Record<string, string>;
  panelCustomRefs?: Record<number, string[]>;
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
  } catch (e) {
    console.warn("[Pipeline] localStorage 저장 실패 (용량 초과 가능):", e);
  }

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
  const [analysisMode, setAnalysisMode] = useState<"gemini" | null>(null);
  const [analysis, setAnalysis] = useState<GeminiSceneAnalysis | LocalAnalysis | null>(null);
  const [editingPanels, setEditingPanels] = useState<GeminiPanelSuggestion[]>([]);
  const [panelPrompts, setPanelPrompts] = useState<Record<number, string>>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 패널 이미지 생성 상태 (Step 2 통합)
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [genProgress, setGenProgress] = useState<Record<number, string>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [batchStatusMsg, setBatchStatusMsg] = useState<string | null>(null);

  // 레퍼런스 이미지 생성 상태
  const [refImages, setRefImages] = useState<Record<string, string>>({}); // key: "char_이름" | "loc_이름"
  const [refGenProgress, setRefGenProgress] = useState<Record<string, string>>({});
  const [generatingRefKey, setGeneratingRefKey] = useState<string | null>(null);
  const [isGeneratingAllRefs, setIsGeneratingAllRefs] = useState(false);

  // 패널별 커스텀 레퍼런스 이미지 (이전 패널 선택 / 업로드)
  const [panelCustomRefs, setPanelCustomRefs] = useState<Record<number, string[]>>({});
  const [customRefPickerPanel, setCustomRefPickerPanel] = useState<number | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const customRefFileInput = useRef<HTMLInputElement | null>(null);
  const customRefTargetPanel = useRef<number>(-1);

  // 패널별 제외된 레퍼런스 키 (캐릭터/의상/장소/이전패널을 선택 해제)
  // 키 형식: "char_이름", "loc_이름", "prev" (이전 패널)
  const [panelExcludedRefs, setPanelExcludedRefs] = useState<Record<number, Set<string>>>({});

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

  // ── 로컬 업로드 파일 보관 (blob URL → File 매핑) ──
  const localFileMap = useRef<Map<string, File>>(new Map());

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
        if (saved.panelCustomRefs && Object.keys(saved.panelCustomRefs).length > 0) setPanelCustomRefs(saved.panelCustomRefs);
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
          panelCustomRefs,
        } as any);
        setSceneTextSaveStatus("saved");
      } catch (_) {
        setSceneTextSaveStatus("idle");
      }
      setTimeout(() => setSceneTextSaveStatus("idle"), 2000);
    }, 2000);
    return () => { if (sceneTextSaveTimerRef.current) clearTimeout(sceneTextSaveTimerRef.current); };
  }, [sceneText, dataLoaded, projectId, episodeId]);

  // ── blob URL → Firebase Storage 업로드 헬퍼 ──
  const resolveBlobToFirebase = useCallback(async (url: string, subPath: string): Promise<string> => {
    if (!url.startsWith("blob:")) return url; // 이미 원격 URL이면 그대로
    const file = localFileMap.current.get(url);
    if (file) {
      const ext = file.name.split(".").pop() || "png";
      const path = `webtoon_projects/${projectId || "default"}/${episodeId || "default"}/${subPath}_${Date.now()}.${ext}`;
      return await uploadImage(path, file);
    }
    // localFileMap에 없으면 fetch 시도 (blob이 아직 유효한 경우)
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
      const blob = await resp.blob();
      const path = `webtoon_projects/${projectId || "default"}/${episodeId || "default"}/${subPath}_${Date.now()}.png`;
      return await uploadImage(path, blob);
    } catch (e) {
      // blob URL 만료 — 다음 저장에서 재시도할 수 있도록 원본 URL 반환
      console.warn(`[resolveBlobToFirebase] blob URL 만료, 변환 불가: ${url}`, e);
      return url;
    }
  }, [projectId, episodeId]);

  // ── blob URL → Firebase 일괄 변환 (저장 전) ──
  // 이미지 생성 시 즉시 업로드가 실패한 경우의 안전망
  const failedBlobUrls = useRef<Set<string>>(new Set());

  const resolveAllBlobUrls = useCallback(async (
    images: Record<number, string>,
    customRefs: Record<number, string[]>,
  ) => {
    const resolvedImages = { ...images };
    const resolvedRefs = { ...customRefs };
    const promises: Promise<void>[] = [];

    // generatedImages 내 blob URL 변환
    for (const [idx, url] of Object.entries(resolvedImages)) {
      if (url.startsWith("blob:") && !failedBlobUrls.current.has(url)) {
        promises.push(
          resolveBlobToFirebase(url, `panels/panel_${idx}`).then(resolved => {
            if (resolved.startsWith("blob:")) {
              // 변환 실패 — 이 URL은 더 이상 시도하지 않음
              failedBlobUrls.current.add(url);
              console.warn(`[AutoSave] panel ${idx} blob 만료 — 재시도 중단`);
            } else {
              resolvedImages[Number(idx)] = resolved;
              setGeneratedImages(prev => ({ ...prev, [Number(idx)]: resolved }));
            }
          }).catch(e => {
            failedBlobUrls.current.add(url);
            console.warn(`[AutoSave] panel ${idx} blob resolve failed:`, e);
          })
        );
      }
    }

    // panelCustomRefs 내 blob URL 변환
    for (const [idx, urls] of Object.entries(resolvedRefs)) {
      const updatedUrls = [...urls];
      for (let i = 0; i < updatedUrls.length; i++) {
        if (updatedUrls[i].startsWith("blob:") && !failedBlobUrls.current.has(updatedUrls[i])) {
          const capturedIdx = idx;
          const capturedI = i;
          const capturedUrl = updatedUrls[i];
          promises.push(
            resolveBlobToFirebase(capturedUrl, `custom_refs/panel_${capturedIdx}_ref_${capturedI}`).then(resolved => {
              if (resolved.startsWith("blob:")) {
                failedBlobUrls.current.add(capturedUrl);
              } else {
                updatedUrls[capturedI] = resolved;
              }
            }).catch(e => {
              failedBlobUrls.current.add(capturedUrl);
              console.warn(`[AutoSave] customRef ${capturedIdx}[${capturedI}] blob resolve failed:`, e);
            })
          );
        }
      }
      resolvedRefs[Number(idx)] = updatedUrls;
    }

    await Promise.all(promises);

    if (promises.length > 0) {
      setPanelCustomRefs(resolvedRefs);
    }

    return { resolvedImages, resolvedRefs };
  }, [resolveBlobToFirebase]);

  // ── 자동 저장 (분석 완료 후 변경 시, 2초 디바운스) ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dataLoaded || !analysis) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // blob URL이 있으면 Firebase에 업로드 후 영구 URL로 변환
      const hasBlobImages = Object.values(generatedImages).some(u => u.startsWith("blob:"));
      const hasBlobRefs = Object.values(panelCustomRefs).some(urls => urls.some(u => u.startsWith("blob:")));

      let finalImages = generatedImages;
      let finalCustomRefs = panelCustomRefs;

      if (hasBlobImages || hasBlobRefs) {
        try {
          const resolved = await resolveAllBlobUrls(generatedImages, panelCustomRefs);
          finalImages = resolved.resolvedImages;
          finalCustomRefs = resolved.resolvedRefs;
        } catch (e) {
          console.warn("[AutoSave] blob resolve failed, saving with current URLs:", e);
        }
      }

      const saveData: Record<string, any> = {
        sceneText,
        analysisMode,
        analysis,
        editingPanels,
        panelPrompts,
        generatedImages: finalImages,
        refImages,
        panelCustomRefs: finalCustomRefs,
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
  }, [dataLoaded, analysis, editingPanels, panelPrompts, generatedImages, refImages, panelCustomRefs, sceneText, analysisMode, projectId, episodeId, v1BubblesByPanel, v1PageSize, v1PageSizeByPanel, resolveAllBlobUrls]);

  const geminiReady = isGeminiConfigured();
  const kieReady = isKieImageConfigured();
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

      if (!geminiReady) {
        throw new Error("AI API 키가 설정되지 않았습니다. 설정에서 API 키를 연결해주세요.");
      }

      // 기존 의상 ID 목록을 Gemini에게 전달하여 동일 의상 재사용
      const existingOutfitIds = registeredOutfits.map(o => o.id);
      result = await analyzeSceneWithGemini(
        sceneText,
        registeredChars as Character[],
        registeredLocs as Location[],
        { existingOutfitIds }
      );
      setAnalysisMode("gemini");

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

      // ── 의상 라이브러리 동기화 (outfitNormalizedId 기반, 중복 방지 강화) ──
      {
        const { addOrUpdateOutfit, outfits: existingOutfits, characters: latestCharsForOutfit } = useReferenceStore.getState();
        result.characters.forEach(c => {
          const normalizedId = (c as any).outfitNormalizedId;
          if (!normalizedId || !c.outfit) return;
          const char = latestCharsForOutfit.find(ch => ch.name === c.name) || existingChars.find(ch => ch.name === c.name);
          if (!char) return;

          // 중복 체크: ID 정확 일치만 (키워드 퍼지 매칭 제거 — 오판 방지)
          const charOutfits = existingOutfits.filter(o => o.characterId === char.id || o.characterName === char.name);
          const alreadyExists = charOutfits.some(o => o.id === normalizedId);
          if (alreadyExists) return;

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

      // 모든 개별 장소 등록 (기존 장소와 유사하면 등록 건너뜀)
      const locsToRegister = (result as any).locations || (result.location?.name ? [result.location] : []);
      for (const loc of locsToRegister) {
        const locExists = existingLocs.some(el => {
          if (el.name === loc.name) return true;
          // 퍼지 매칭: 핵심 키워드가 겹치면 같은 장소로 판단
          const elWords = el.name.replace(/[·\s_-]+/g, " ").toLowerCase().split(" ").filter((w: string) => w.length >= 2);
          const locWords = (loc.name as string).replace(/[·\s_-]+/g, " ").toLowerCase().split(" ").filter((w: string) => w.length >= 2);
          const placeTypes = ["아파트", "카페", "사무실", "거실", "침실", "안방", "주방", "욕실", "학교", "공원"];
          const elType = elWords.find((w: string) => placeTypes.includes(w));
          const locType = locWords.find((w: string) => placeTypes.includes(w));
          return elType && locType && elType === locType;
        });
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
        // 패널별 장소 결정: panel.location → 대표 장소 fallback
        const panelLocName = panel.location || result.location.name;
        const panelLoc = (result as any).locations?.find((l: any) => l.name === panelLocName) || result.location;
        const timeLabel = TIME_LABELS[panelLoc.timeOfDay] || panelLoc.timeOfDay || "";
        const moodLabel = MOOD_LABELS[panelLoc.mood] || panelLoc.mood || "";

        // 의상 레퍼런스 ID 목록
        const locRef = `ref:location/${panelLocName.replace(/\s/g, "_")}`;

        // ── Subject 배열 구성 (캐릭터별 성별/의상/동작/위치) ──
        // 패널 비주얼 텍스트에서 캐릭터별 동작 추출 (composition + description 모두 활용)
        const visualDesc = (panel.composition || "").trim();
        const fullDesc = (panel.description || "").trim();
        // 두 소스 합쳐서 동작 추출 범위 확대
        const combinedDesc = [visualDesc, fullDesc].filter(Boolean).join(". ");

        const subjects: SubjectInfo[] = panel.characters.map((name) => {
          const c = result.characters.find(ch => ch.name === name);
          const emotion = c ? (EMOTION_LABELS[c.emotion] || c.emotion) : "";
          const globalAction = (c as any)?.action && (c as any).action !== "standing"
            ? ACTION_LABELS[(c as any).action] || (c as any).action
            : "";

          // 패널 비주얼 텍스트에서 이 캐릭터 관련 동작 문구 추출
          let panelAction = "";
          if (combinedDesc) {
            // 캐릭터 이름 뒤의 문구를 추출 (마침표/쉼표/다른 캐릭터 이름까지)
            const otherNames = panel.characters.filter(n => n !== name);
            const stopPattern = otherNames.length > 0
              ? `(?=[.。,，]|${otherNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|$)`
              : `(?=[.。]|$)`;
            const nameRe = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[이가은는을를의]?\\s*([^.。]+?)${stopPattern}`, "u");
            const m = combinedDesc.match(nameRe);
            if (m && m[1]) panelAction = m[1].trim();
          }
          // 캐릭터가 1명뿐이고 이름 매칭이 안 된 경우, description 전체를 동작으로 활용
          if (!panelAction && panel.characters.length === 1 && fullDesc) {
            // 이름과 장소 정보를 제거한 순수 동작 부분 추출
            let descAction = fullDesc
              .replace(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[이가은는을를의]?\\s*`, "gu"), "")
              .replace(/^[^.]*?(침대|소파|의자|책상|주방|거실|안방|욕실|복도)[^.]*?\.\s*/u, "")
              .trim();
            if (descAction.length > 5) panelAction = descAction;
          }
          // 패널 동작 우선, 없으면 전역 동작
          const action = panelAction || globalAction;

          // 성별: 레퍼런스 갤러리의 traits.gender
          const regChar = latestChars.find(rc =>
            rc.name === name || rc.name.includes(name) || name.includes(rc.name)
          );
          const gender = regChar?.traits?.gender
            ? (regChar.traits.gender === "male" ? "Male" : regChar.traits.gender === "female" ? "Female" : "")
            : "";

          // 의상: panel.characterOutfits → 갤러리 fallback
          let outfitId = panel.characterOutfits?.[name] || "";
          if (!outfitId) {
            // 갤러리에서 해당 캐릭터의 의상 중 첫 번째 매칭
            const fallbackOutfit = latestOutfits.find(o =>
              o.id.startsWith(name + "_") || o.id.startsWith(name)
            );
            if (fallbackOutfit) outfitId = fallbackOutfit.id;
          }
          const outfitLabel = outfitId
            ? outfitId.split("_").slice(1).join(" ").replace(/_/g, " ")
            : "";

          // 위치/뷰: characterAngles 또는 composition에서 추출
          const angle = (panel as any).characterAngles?.[name] || "";
          const position = angle === "back" ? "back view" : "";

          // 의상 레퍼런스 태그
          const outfitRef = outfitId ? `ref:outfit/${outfitId}` : "";

          return {
            name,
            gender,
            outfit: outfitLabel ? outfitLabel.charAt(0).toUpperCase() + outfitLabel.slice(1) : "",
            action: action || undefined,
            position: position || undefined,
            expression: emotion || undefined,
            outfitRef: outfitRef || undefined,
          };
        });

        // charTokens (레거시 호환)
        const charTokens = subjects
          .map(s => {
            const tags = [s.expression, s.action].filter(Boolean).join(", ");
            return tags ? `${s.name}(${tags})` : s.name;
          })
          .join(", ");

        // 의상 레퍼런스 목록
        const outfitRefs = subjects
          .map(s => s.outfitRef)
          .filter(Boolean)
          .join(", ");

        const panelCtx: PanelPromptContext = {
          charTokens,
          subjects,
          locationName: panelLocName,
          timeLabel,
          moodLabel,
          cameraAngle: panel.cameraAngle,
          rawComposition: panel.composition || "",
          sceneDescription: panel.description || "",
          aiPrompt: panel.aiPrompt || "",
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
        analysisMode: "gemini",
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

  // ── 커스텀 레퍼런스: 이전 패널 선택 (토글 — 이미 선택된 패널 다시 클릭 시 제거) ──
  const addPrevPanelAsRef = useCallback((targetIdx: number, sourceIdx: number) => {
    const url = generatedImages[sourceIdx];
    if (!url) return;
    setPanelCustomRefs(prev => {
      const existing = prev[targetIdx] || [];
      if (existing.includes(url)) {
        // 이미 선택됨 → 제거 (토글)
        const updated = existing.filter(u => u !== url);
        if (updated.length === 0) {
          const { [targetIdx]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [targetIdx]: updated };
      }
      return { ...prev, [targetIdx]: [...existing, url] };
    });
    // 토글이므로 피커를 닫지 않음 (여러 개 선택/해제 가능)
  }, [generatedImages]);

  // ── 커스텀 레퍼런스: 이미지 업로드 (로컬 Object URL) ──
  const handleCustomRefUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetIdx = customRefTargetPanel.current;
    if (!file || targetIdx < 0) return;
    e.target.value = ""; // 동일 파일 재업로드 허용

    const localUrl = URL.createObjectURL(file);
    localFileMap.current.set(localUrl, file);
    setPanelCustomRefs(prev => {
      const existing = prev[targetIdx] || [];
      return { ...prev, [targetIdx]: [...existing, localUrl] };
    });
    console.log(`[Panel ${targetIdx}] Custom ref added (local): ${localUrl}`);
    setCustomRefPickerPanel(null);
  }, []);

  // ── 패널 이미지 직접 업로드 ──
  const panelUploadRef = useRef<HTMLInputElement>(null);
  const panelUploadTarget = useRef<number>(-1);

  const triggerPanelImageUpload = useCallback((idx: number) => {
    panelUploadTarget.current = idx;
    panelUploadRef.current?.click();
  }, []);

  const handlePanelImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetIdx = panelUploadTarget.current;
    if (!file || targetIdx < 0) return;
    e.target.value = "";

    const localUrl = URL.createObjectURL(file);
    localFileMap.current.set(localUrl, file);
    setGeneratedImages(prev => ({ ...prev, [targetIdx]: localUrl }));
    setGenProgress(prev => ({ ...prev, [targetIdx]: "업로드 완료 (로컬)" }));
    console.log(`[Panel ${targetIdx}] Image added (local): ${localUrl}`);
  }, []);

  // ── 커스텀 레퍼런스: 제거 ──
  const removeCustomRef = useCallback((panelIdx: number, refUrl: string) => {
    setPanelCustomRefs(prev => {
      const existing = prev[panelIdx] || [];
      const updated = existing.filter(u => u !== refUrl);
      if (updated.length === 0) {
        const { [panelIdx]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [panelIdx]: updated };
    });
  }, []);

  // 레퍼런스 제외 토글 (캐릭터/의상/장소/이전패널)
  const toggleExcludeRef = useCallback((panelIdx: number, refKey: string) => {
    setPanelExcludedRefs(prev => {
      const existing = new Set(prev[panelIdx] || []);
      if (existing.has(refKey)) {
        existing.delete(refKey);
      } else {
        existing.add(refKey);
      }
      if (existing.size === 0) {
        const { [panelIdx]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [panelIdx]: existing };
    });
  }, []);

  const isRefExcluded = useCallback((panelIdx: number, refKey: string): boolean => {
    return panelExcludedRefs[panelIdx]?.has(refKey) ?? false;
  }, [panelExcludedRefs]);

  // ── 패널 프롬프트 + 레퍼런스 URL 준비 (공용 함수) ──
  const preparePanelData = useCallback((idx: number): { prompt: string; referenceImageUrls: string[] } | null => {
    const panel = editingPanels[idx];
    let prompt = panelPrompts[idx] || panel?.aiPrompt || panel?.description;
    if (!prompt) return null;

    // ── 규칙1: 스타일 통일 — 선택된 아트 스타일 적용, 충돌 스타일 제거 ──
    const artStyle = ART_STYLES[artStyleKey];
    if (artStyle?.prefix && !prompt.startsWith(artStyle.prefix)) {
      const conflictPatterns = [
        /\bStyle:\s*[^.]*\.\s*/gi,
        /\bNO mixed rendering techniques\.?\s*/gi,
      ];
      for (const pat of conflictPatterns) {
        prompt = prompt.replace(pat, "");
      }
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
      const panelCharAnalysis = analysis.characters.find(c => panel.characters.includes(c.name));
      const panelOutfit = panelCharAnalysis?.outfit || undefined;
      const panelLocName = panel.location || analysis.location.name;
      const panelLoc = (analysis as any).locations?.find((l: any) => l.name === panelLocName) || analysis.location;
      const resolved = currentResolver.resolve({
        characters: panel.characters, emotion: panel.emotion, outfit: panelOutfit,
        location: panelLocName, timeOfDay: panelLoc.timeOfDay, mood: panelLoc.mood,
        currentEpisode: episodeId || "", currentPanel: idx,
      });
      if (resolved.length > 0) {
        const refLabels = resolved.map(r => r.label).join(", ");
        if (!prompt.includes("[References:")) prompt += `\n\n[References: ${refLabels}]`;
      }
    }

    // ── 레퍼런스 이미지 URL 수집 ──
    const referenceImageUrls: string[] = [];
    const customRefs = panelCustomRefs[idx] || [];
    for (const cUrl of customRefs) {
      if (cUrl.startsWith("http") && !referenceImageUrls.includes(cUrl)) referenceImageUrls.push(cUrl);
    }
    const excluded = panelExcludedRefs[idx];
    if (idx > 0 && !excluded?.has("prev")) {
      const prevImg = generatedImages[idx - 1];
      if (prevImg && prevImg.startsWith("http") && !referenceImageUrls.includes(prevImg)) referenceImageUrls.push(prevImg);
      if (idx > 1) {
        const prev2Img = generatedImages[idx - 2];
        if (prev2Img && prev2Img.startsWith("http") && !referenceImageUrls.includes(prev2Img)) referenceImageUrls.push(prev2Img);
      }
    }
    if (analysis && panel) {
      for (const charName of panel.characters) {
        if (excluded?.has(`char_${charName}`)) continue;
        let outfitRefAdded = false;
        let outfitId = (panel as any).characterOutfits?.[charName];
        let outfitEntry = outfitId ? registeredOutfits.find(o => o.id === outfitId) : undefined;
        if (!outfitEntry) {
          outfitEntry = registeredOutfits.find(o => o.id.startsWith(charName + "_") || o.id.startsWith(charName));
          if (outfitEntry) outfitId = outfitEntry.id;
        }
        if (outfitEntry?.references?.length) {
          const best = [...outfitEntry.references].sort((a, b) => (b.quality || 0) - (a.quality || 0))[0];
          if (best?.storageUrl?.startsWith("http") && !referenceImageUrls.includes(best.storageUrl)) {
            referenceImageUrls.push(best.storageUrl);
            outfitRefAdded = true;
          }
        }
        if (!outfitRefAdded) {
          const charRefImg = refImages[`char_${charName}`];
          if (charRefImg && charRefImg.startsWith("http") && !referenceImageUrls.includes(charRefImg)) referenceImageUrls.push(charRefImg);
        }
      }
    }
    if (analysis) {
      const panelLocName = panel?.location || analysis.location.name;
      if (!excluded?.has(`loc_${panelLocName}`)) {
        let locRefImg = refImages[`loc_${panelLocName}`] || refImages[`loc_${analysis.location.name}`];
        if (!locRefImg) {
          const regLoc = registeredLocs.find(l => l.name === panelLocName)
            || registeredLocs.find(l => l.name === analysis.location.name);
          locRefImg = (regLoc as any)?.references?.[0]?.storageUrl;
        }
        if (locRefImg && locRefImg.startsWith("http") && !referenceImageUrls.includes(locRefImg)) referenceImageUrls.push(locRefImg);
      }
    }
    const finalRefUrls = referenceImageUrls.slice(0, 4);

    if (idx > 0 && generatedImages[idx - 1]) {
      prompt += "\n\n[STYLE LOCK] Maintain IDENTICAL art style across all panels: same linework weight, color palette, shading technique, skin rendering, background detail level. Every panel must look like the same artist drew it in one session.";
      prompt += "\nDo NOT render any text, letters, words, sound effects, onomatopoeia, or speech bubbles in the image.";
    }

    return { prompt, referenceImageUrls: finalRefUrls };
  }, [editingPanels, panelPrompts, artStyleKey, analysis, episodeId, registeredChars, registeredLocs, registeredOutfits, generatedImages, refImages, panelCustomRefs, panelExcludedRefs]);

  // ── 단일 패널 이미지 생성 (preparePanelData + Context Chain 연동) ──
  const generatePanelImage = useCallback(async (idx: number) => {
    if (!kieReady) {
      alert("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력하세요.");
      return;
    }
    const data = preparePanelData(idx);
    if (!data) return;
    const { prompt, referenceImageUrls: finalRefUrls } = data;
    const panel = editingPanels[idx];

    console.log(`[Panel ${idx}] Refs: ${finalRefUrls.length}`, finalRefUrls);

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
      setGenProgress(prev => ({ ...prev, [idx]: `완료 (${result.duration}초)` }));

      // blob URL → 즉시 Firebase 업로드하여 영구 URL 확보
      let finalImageUrl = result.imageUrl;
      if (result.imageUrl.startsWith("blob:")) {
        try {
          setGenProgress(prev => ({ ...prev, [idx]: "Firebase 업로드 중..." }));
          const blobResp = await fetch(result.imageUrl);
          const blob = await blobResp.blob();
          const storagePath = `webtoon_projects/${projectId || "default"}/${episodeId || "default"}/panels/panel_${idx}_${Date.now()}.png`;
          finalImageUrl = await uploadImage(storagePath, blob);
          URL.revokeObjectURL(result.imageUrl); // blob URL 해제
          console.log(`[Panel ${idx}] Firebase 업로드 완료: ${finalImageUrl}`);
          setGenProgress(prev => ({ ...prev, [idx]: `완료 (${result.duration}초)` }));
        } catch (e) {
          console.warn(`[Panel ${idx}] Firebase 즉시 업로드 실패, blob URL 유지:`, e);
          // 실패 시 localFileMap에 백업 저장
          try {
            const blobResp2 = await fetch(result.imageUrl);
            const blob2 = await blobResp2.blob();
            localFileMap.current.set(result.imageUrl, new File([blob2], `panel_${idx}.png`, { type: blob2.type || "image/png" }));
          } catch { /* blob도 만료되면 포기 */ }
        }
      }
      setGeneratedImages(prev => ({ ...prev, [idx]: finalImageUrl }));

      // ── Context Chain 업데이트 ──
      if (panel && analysis) {
        const panelResult: PanelResult = {
          panelIndex: idx,
          storageUrl: finalImageUrl,
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
          episodeId || "", idx, panelResult, panel.characters, analysis.location.name
        );
        contextChainRef.current = updatedChain;
        if (projectId && episodeId) {
          firebaseService.saveContextChain(projectId, episodeId, updatedChain)
            .catch(e => console.error("[Pipeline] Context chain save error:", e));
        }
      }
    } catch (err: any) {
      console.error(`[Panel ${idx}] 생성 실패:`, err);
      setGenProgress(prev => ({ ...prev, [idx]: `실패: ${err.message}` }));
    } finally {
      setGeneratingIndex(null);
    }
  }, [preparePanelData, editingPanels, kieReady, analysis, episodeId, projectId, registeredChars, registeredLocs, registeredOutfits]);

  // ── 전체 패널 생성 (Vertex AI: BatchPredictionJob 50% 할인 / 기타: 순차) ──
  const generateAllPanels = useCallback(async () => {
    if (!kieReady) {
      alert("Kie API Key가 필요합니다. 설정에서 KIE_API_KEY를 입력하세요.");
      return;
    }
    setIsGeneratingAll(true);
    setBatchStatusMsg(null);

    // 생성할 패널 인덱스 필터
    const targetIndices: number[] = [];
    for (let i = 0; i < editingPanels.length; i++) {
      const pType = editingPanels[i].panel_type ?? "visual";
      if (pType === "narration" || pType === "skip") continue;
      if (generatedImages[i]) continue;
      targetIndices.push(i);
    }

    if (targetIndices.length === 0) {
      setIsGeneratingAll(false);
      return;
    }

    const isVertex = selectedModel.startsWith("vertex/");

    if (isVertex) {
      // ── Vertex AI BatchPredictionJob (50% 비용 절감) ──
      const batchRequests: BatchPanelRequest[] = [];
      for (const idx of targetIndices) {
        const data = preparePanelData(idx);
        if (!data) continue;
        batchRequests.push({
          idx,
          prompt: data.prompt,
          sizeKey: "portrait_4_3",
          referenceImageUrls: data.referenceImageUrls.length > 0 ? data.referenceImageUrls : undefined,
        });
        setGenProgress(prev => ({ ...prev, [idx]: "배치 작업 준비 중..." }));
      }

      console.log(`[VertexBatch] Starting BatchPredictionJob: ${batchRequests.length} panels`);

      try {
        const results = await generateVertexBatch(batchRequests, {
          onStatus: (msg) => {
            setBatchStatusMsg(msg);
            console.log(`[VertexBatch] Status: ${msg}`);
          },
          onProgress: (completed, total, idx, success) => {
            if (success) {
              setGenProgress(prev => ({ ...prev, [idx]: `완료 (${completed}/${total})` }));
            } else {
              setGenProgress(prev => ({ ...prev, [idx]: `실패 (${completed}/${total})` }));
            }
          },
        });

        // 결과 적용 + blob → 즉시 Firebase 업로드
        let uploadedCount = 0;
        for (const r of results) {
          if (r.imageUrl) {
            let finalUrl = r.imageUrl;
            if (r.imageUrl.startsWith("blob:")) {
              try {
                const blobResp = await fetch(r.imageUrl);
                const blob = await blobResp.blob();
                const storagePath = `webtoon_projects/${projectId || "default"}/${episodeId || "default"}/panels/panel_${r.idx}_${Date.now()}.png`;
                finalUrl = await uploadImage(storagePath, blob);
                URL.revokeObjectURL(r.imageUrl);
                console.log(`[VertexBatch] Panel ${r.idx} Firebase 업로드 완료`);
              } catch (e) {
                console.warn(`[VertexBatch] Panel ${r.idx} Firebase 업로드 실패, blob URL 유지:`, e);
              }
            }
            setGeneratedImages(prev => ({ ...prev, [r.idx]: finalUrl }));
            uploadedCount++;
          } else {
            setGenProgress(prev => ({ ...prev, [r.idx]: `실패: ${r.error}` }));
          }
        }

        console.log(`[VertexBatch] Done: ${uploadedCount}/${results.length} succeeded`);
        setBatchStatusMsg(`배치 완료: ${uploadedCount}/${results.length}개 성공`);
      } catch (err: any) {
        console.error("[VertexBatch] Batch job failed:", err);
        setBatchStatusMsg(`배치 실패: ${err.message}`);
        for (const idx of targetIndices) {
          setGenProgress(prev => ({ ...prev, [idx]: `배치 실패: ${err.message}` }));
        }
      }
    } else {
      // ── 기타 모델: 순차 생성 ──
      for (const i of targetIndices) {
        await generatePanelImage(i);
      }
    }

    setIsGeneratingAll(false);
  }, [editingPanels, kieReady, generatedImages, generatePanelImage, selectedModel, preparePanelData]);

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
    const { panelIdx, imageUrl: rawImageUrl, autoTags, selectedCharName, selectedLocName, tagOverrides } = saveRefModal;
    if (!rawImageUrl || !autoTags) return;

    // blob URL이면 Firebase Storage에 업로드하여 영구 URL로 변환
    let imageUrl = rawImageUrl;
    try {
      imageUrl = await resolveBlobToFirebase(rawImageUrl, `refs/panel_${panelIdx}`);
      if (imageUrl !== rawImageUrl) {
        console.log(`[SaveRef] Blob URL → Firebase: ${imageUrl}`);
      }
    } catch (err: any) {
      console.error("[SaveRef] Firebase upload failed:", err);
      alert("Firebase 업로드 실패: " + err.message);
      return;
    }

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
  }, [saveRefModal, episodeId, projectId, resolveBlobToFirebase]);

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

          {/* ── 씬 분석 모델 (Gemini 3 Pro 고정) ── */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ ...S.label, marginBottom: "8px", display: "block" }}>씬 분석 모델</label>
            <div style={{
              padding: "8px 14px", borderRadius: "8px", border: "2px solid #7c3aed",
              background: "#f5f3ff", color: "#7c3aed", fontWeight: 600, fontSize: "13px",
              display: "inline-block",
            }}>
              🤖 Gemini 3 Pro — Kie.ai
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
              <optgroup label="── img2img (레퍼런스 기반) ──">
                {KIE_IMAGE_MODELS.filter(m => m.mode === "img2img").map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
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

            {/* 배치 작업 상태 표시 */}
            {batchStatusMsg && (
              <div style={{
                padding: "8px 14px",
                marginBottom: 10,
                borderRadius: 6,
                background: batchStatusMsg.includes("실패") ? "#FEF2F2" : "#F0F9FF",
                color: batchStatusMsg.includes("실패") ? "#991B1B" : "#1E40AF",
                fontSize: 13,
                border: `1px solid ${batchStatusMsg.includes("실패") ? "#FECACA" : "#BFDBFE"}`,
              }}>
                {isGeneratingAll && !batchStatusMsg.includes("완료") && !batchStatusMsg.includes("실패") && (
                  <span style={{ marginRight: 6 }}>⏳</span>
                )}
                {batchStatusMsg}
              </div>
            )}

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
                        {/* 참조 레퍼런스 (의상 + 장소 + 이전 패널) */}
                        <div style={S.panelCharacters}>
                          <label style={S.smallLabel}>참조 레퍼런스</label>
                          <div style={S.refThumbRow}>
                            {/* 이전 패널 */}
                            {idx > 0 && (
                              <div
                                style={{
                                  ...S.refThumbItem,
                                  borderColor: generatedImages[idx - 1] ? "#2563eb" : "#e5e7eb",
                                  background: generatedImages[idx - 1] ? "#eff6ff" : "#fff",
                                  opacity: isRefExcluded(idx, "prev") ? 0.35 : 1,
                                }}
                                title="이전 패널"
                              >
                                {generatedImages[idx - 1] ? (
                                  <img src={generatedImages[idx - 1]} alt="이전 패널" style={S.refThumbImg} onClick={() => openLightbox(generatedImages[idx - 1], `Panel ${idx}`)} />
                                ) : (
                                  <div style={S.refThumbEmpty}><span style={{ fontSize: "16px" }}>+</span></div>
                                )}
                                <span style={S.refThumbLabel}>이전패널</span>
                                {generatedImages[idx - 1] && (
                                  <button
                                    onClick={e => { e.stopPropagation(); toggleExcludeRef(idx, "prev"); }}
                                    style={isRefExcluded(idx, "prev") ? S.refExcludeBtnActive : S.refExcludeBtn}
                                    title={isRefExcluded(idx, "prev") ? "다시 포함" : "제외"}
                                  >{isRefExcluded(idx, "prev") ? "↩" : "✕"}</button>
                                )}
                              </div>
                            )}
                            {/* 캐릭터 의상 레퍼런스 — ref:outfit/... 태그로 표시 */}
                            {(panel?.characters || []).map((cn: string) => {
                              // 1. panel.characterOutfits에서 정확 매칭
                              let outfitId = (panel as any).characterOutfits?.[cn];
                              let outfitEntry = outfitId ? registeredOutfits.find(o => o.id === outfitId) : undefined;
                              // 2. 정확 매칭 실패 시 갤러리에서 캐릭터 이름으로 퍼지 매칭
                              if (!outfitEntry) {
                                outfitEntry = registeredOutfits.find(o => o.id.startsWith(cn + "_") || o.id.startsWith(cn));
                                if (outfitEntry) outfitId = outfitEntry.id;
                              }
                              const outfitThumb = outfitEntry?.references?.[0]?.storageUrl;
                              const charThumb = refImages[`char_${cn}`];
                              const thumb = outfitThumb || charThumb;
                              const refTag = outfitId ? `ref:outfit/${outfitId}` : `ref:outfit/${cn}`;
                              const charRefKey = `char_${cn}`;
                              return (
                                <div
                                  key={`ref_outfit_${cn}`}
                                  style={{
                                    ...S.refThumbItem,
                                    borderColor: thumb ? "#2563eb" : "#e5e7eb",
                                    background: thumb ? "#eff6ff" : "#fff",
                                    opacity: isRefExcluded(idx, charRefKey) ? 0.35 : 1,
                                  }}
                                  title={refTag}
                                >
                                  {thumb ? (
                                    <img src={thumb} alt={refTag} style={S.refThumbImg} onClick={() => openLightbox(thumb, refTag)} />
                                  ) : (
                                    <div style={S.refThumbEmpty} onClick={() => openSaveRefModal(idx)}>
                                      <span style={{ fontSize: "16px" }}>+</span>
                                    </div>
                                  )}
                                  <span style={S.refThumbLabel} title={refTag}>
                                    {outfitEntry?.label || cn}
                                  </span>
                                  {thumb && (
                                    <>
                                      <button
                                        onClick={e => { e.stopPropagation(); toggleExcludeRef(idx, charRefKey); }}
                                        style={isRefExcluded(idx, charRefKey) ? S.refExcludeBtnActive : S.refExcludeBtn}
                                        title={isRefExcluded(idx, charRefKey) ? "다시 포함" : "제외"}
                                      >{isRefExcluded(idx, charRefKey) ? "↩" : "✕"}</button>
                                      <button
                                        onClick={e => { e.stopPropagation(); openSaveRefModal(idx); }}
                                        style={S.refStripSwap}
                                        title="교체"
                                      >↻</button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {/* 장소 레퍼런스 — ref:location/... 태그로 표시 */}
                            {(() => {
                              const panelLocName = (panel as any)?.location || analysis?.location?.name;
                              // 1. refImages state (직접 생성된 이미지)
                              let locThumb = panelLocName ? (refImages[`loc_${panelLocName}`] || refImages[`loc_${analysis?.location?.name}`]) : undefined;
                              // 2. 갤러리에 등록된 장소 레퍼런스 이미지
                              if (!locThumb && panelLocName) {
                                const regLoc = registeredLocs.find(l => l.name === panelLocName) || registeredLocs.find(l => l.name === analysis?.location?.name);
                                locThumb = regLoc?.references?.[0]?.storageUrl;
                              }
                              const refLocTag = panelLocName ? `ref:location/${panelLocName.replace(/\s/g, "_")}` : "";
                              const locRefKey = `loc_${panelLocName}`;
                              return panelLocName ? (
                                <div
                                  style={{
                                    ...S.refThumbItem,
                                    borderColor: locThumb ? "#2563eb" : "#e5e7eb",
                                    background: locThumb ? "#eff6ff" : "#fff",
                                    opacity: isRefExcluded(idx, locRefKey) ? 0.35 : 1,
                                  }}
                                  title={refLocTag}
                                >
                                  {locThumb ? (
                                    <img src={locThumb} alt={refLocTag} style={S.refThumbImg} onClick={() => openLightbox(locThumb, panelLocName)} />
                                  ) : (
                                    <div style={S.refThumbEmpty} onClick={() => openSaveRefModal(idx)}>
                                      <span style={{ fontSize: "16px" }}>+</span>
                                    </div>
                                  )}
                                  <span style={S.refThumbLabel} title={refLocTag}>장소</span>
                                  {locThumb && (
                                    <>
                                      <button
                                        onClick={e => { e.stopPropagation(); toggleExcludeRef(idx, locRefKey); }}
                                        style={isRefExcluded(idx, locRefKey) ? S.refExcludeBtnActive : S.refExcludeBtn}
                                        title={isRefExcluded(idx, locRefKey) ? "다시 포함" : "제외"}
                                      >{isRefExcluded(idx, locRefKey) ? "↩" : "✕"}</button>
                                      <button
                                        onClick={e => { e.stopPropagation(); openSaveRefModal(idx); }}
                                        style={S.refStripSwap}
                                        title="교체"
                                      >↻</button>
                                    </>
                                  )}
                                </div>
                              ) : null;
                            })()}
                            {/* 커스텀 레퍼런스 썸네일 */}
                            {(panelCustomRefs[idx] || []).map((cUrl, ci) => (
                              <div
                                key={`cref_${ci}`}
                                style={{ ...S.refThumbItem, borderColor: "#10B981", background: "#ECFDF5" }}
                                title="커스텀 레퍼런스"
                              >
                                <img src={cUrl} alt={`Custom ref ${ci + 1}`} style={S.refThumbImg} onClick={() => openLightbox(cUrl, `커스텀 레퍼런스 ${ci + 1}`)} />
                                <span style={S.refThumbLabel}>커스텀{ci + 1}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); removeCustomRef(idx, cUrl); }}
                                  style={{ ...S.refStripSwap, color: "#EF4444" }}
                                  title="제거"
                                >✕</button>
                              </div>
                            ))}
                            {/* + 버튼: 커스텀 레퍼런스 추가 */}
                            <div style={{ position: "relative" }}>
                              <div
                                style={{
                                  ...S.refThumbItem,
                                  borderColor: "#D1D5DB",
                                  borderStyle: "dashed",
                                  background: "#F9FAFB",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                onClick={() => setCustomRefPickerPanel(customRefPickerPanel === idx ? null : idx)}
                                title="레퍼런스 추가 (이전 패널 선택 / 이미지 업로드)"
                              >
                                <span style={{ fontSize: "20px", color: "#9CA3AF", lineHeight: 1 }}>+</span>
                                <span style={{ fontSize: "9px", color: "#9CA3AF", marginTop: "2px" }}>추가</span>
                              </div>
                              {/* 드롭다운 피커 */}
                              {customRefPickerPanel === idx && (
                                <div style={{
                                  position: "absolute", top: "100%", left: 0, zIndex: 50,
                                  background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "8px", minWidth: "180px",
                                  maxHeight: "260px", overflowY: "auto",
                                }}>
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "6px" }}>이전 패널 선택</div>
                                  {idx === 0 ? (
                                    <div style={{ fontSize: "11px", color: "#9CA3AF", padding: "4px 0" }}>이전 패널 없음</div>
                                  ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                                      {Array.from({ length: idx }, (_, i) => i).map(pi => {
                                        const isSelected = (panelCustomRefs[idx] || []).includes(generatedImages[pi]);
                                        return (
                                          <div
                                            key={`pick_${pi}`}
                                            onClick={() => generatedImages[pi] ? addPrevPanelAsRef(idx, pi) : undefined}
                                            style={{
                                              width: "48px", height: "48px", borderRadius: "4px", overflow: "hidden",
                                              border: isSelected ? "2px solid #10B981" : generatedImages[pi] ? "2px solid #2563EB" : "1px solid #E5E7EB",
                                              cursor: generatedImages[pi] ? "pointer" : "not-allowed",
                                              opacity: generatedImages[pi] ? 1 : 0.4,
                                              position: "relative",
                                            }}
                                            title={isSelected ? `Panel ${pi + 1} (선택됨 — 클릭하여 해제)` : generatedImages[pi] ? `Panel ${pi + 1} 선택` : `Panel ${pi + 1} (이미지 없음)`}
                                          >
                                            {generatedImages[pi] ? (
                                              <img src={generatedImages[pi]} alt={`P${pi + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            ) : (
                                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F4F6", fontSize: "10px", color: "#9CA3AF" }}>
                                                {pi + 1}
                                              </div>
                                            )}
                                            {isSelected && (
                                              <div style={{ position: "absolute", top: 0, right: 0, background: "#10B981", color: "#fff", fontSize: "10px", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "0 4px 0 4px" }}>
                                                ✓
                                              </div>
                                            )}
                                            <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: isSelected ? "rgba(16,185,129,0.7)" : "rgba(0,0,0,0.5)", color: "#fff", fontSize: "8px", textAlign: "center", lineHeight: "14px" }}>
                                              P{pi + 1}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "6px" }}>
                                    <button
                                      onClick={() => {
                                        customRefTargetPanel.current = idx;
                                        customRefFileInput.current?.click();
                                      }}
                                      disabled={isUploadingRef}
                                      style={{
                                        width: "100%", padding: "6px 8px", fontSize: "11px", fontWeight: 600,
                                        background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: "4px",
                                        cursor: isUploadingRef ? "not-allowed" : "pointer", color: "#374151",
                                      }}
                                    >
                                      {isUploadingRef ? "업로드 중..." : "이미지 업로드"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 대사/SFX 별도 표시 (이미지 프롬프트에 포함 안 됨) */}
                        {(((panel as any).dialogues && (panel as any).dialogues.length > 0) || ((panel as any).sfx && (panel as any).sfx.length > 0)) && (
                          <div style={{ marginTop: "8px", padding: "6px 8px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                            {(panel as any).dialogues?.map((d: any, di: number) => (
                              <div key={`dlg_${di}`} style={{ fontSize: "12px", color: "#334155", marginBottom: "2px" }}>
                                <span style={{ fontWeight: 600, color: "#2563eb" }}>💬 {d.character}:</span> {d.text}
                              </div>
                            ))}
                            {(panel as any).sfx?.map((s: string, si: number) => (
                              <div key={`sfx_${si}`} style={{ fontSize: "12px", color: "#dc2626", fontWeight: 700, fontStyle: "italic" }}>
                                ✦ SFX: {s}
                              </div>
                            ))}
                          </div>
                        )}

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
                          <button
                            onClick={() => triggerPanelImageUpload(idx)}
                            style={S.panelUploadBtn}
                            disabled={isGen || isGeneratingAll}
                            title="이미지 직접 업로드"
                          >
                            📁
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
                        {/* 레퍼런스 스트립 — 왼쪽 참조 레퍼런스로 이동됨 */}
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
                      // v2.1: panel.dialogues + panel.sfx 또는 extractDialogueHints 폴백
                      const pDialogues = (panel as any).dialogues || [];
                      const pSfx = (panel as any).sfx || [];
                      const hasInlineData = pDialogues.length > 0 || pSfx.length > 0;
                      const dialoguesToShow = hasInlineData ? pDialogues : panelDialogues.map((d: any) => ({ character: d.character, text: d.text }));
                      const sfxToShow = pSfx;

                      if (dialoguesToShow.length > 0 || sfxToShow.length > 0) {
                        return (
                          <div style={S3.dialogueOverlay}>
                            {dialoguesToShow.map((d: any, di: number) => (
                              <div key={`dlg_${di}`} style={S3.speechBubble}>
                                <span style={S3.speechCharName}>{d.character}</span>
                                <span style={S3.speechText}>{d.text}</span>
                              </div>
                            ))}
                            {sfxToShow.map((s: string, si: number) => (
                              <div key={`sfx_${si}`} style={{
                                fontFamily: "'Nanum Brush Script', 'Black Han Sans', cursive",
                                fontWeight: 900,
                                fontSize: "18px",
                                color: "#dc2626",
                                textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                                textAlign: "center" as const,
                                padding: "2px 6px",
                                letterSpacing: "2px",
                              }}>
                                {s}
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

      {/* ═══ 커스텀 레퍼런스 피커 백드롭 (외부 클릭 시 닫기) ═══ */}
      {customRefPickerPanel !== null && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
          onClick={() => setCustomRefPickerPanel(null)}
        />
      )}

      {/* ═══ 커스텀 레퍼런스 이미지 업로드용 hidden input ═══ */}
      <input
        type="file"
        ref={customRefFileInput}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleCustomRefUpload}
      />

      {/* ═══ 패널 이미지 직접 업로드용 hidden input ═══ */}
      <input
        type="file"
        ref={panelUploadRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handlePanelImageUpload}
      />

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
  panelUploadBtn: {
    padding: "10px 12px", background: "#f3f4f6", color: "#374151",
    border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer", fontSize: "14px",
    lineHeight: 1,
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
    position: "relative" as const,
    width: "56px", display: "flex", flexDirection: "column" as const,
    alignItems: "center", gap: "2px", border: "2px solid #e5e7eb",
    borderRadius: "8px", padding: "3px", transition: "border-color 0.15s",
    overflow: "visible",
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
  refExcludeBtn: {
    position: "absolute" as const, top: "-4px", left: "-4px",
    width: "16px", height: "16px", borderRadius: "50%", border: "1px solid #EF4444",
    background: "#FEE2E2", cursor: "pointer", fontSize: "10px", lineHeight: "14px",
    textAlign: "center" as const, padding: 0, color: "#EF4444",
    zIndex: 2,
  } as const,
  refExcludeBtnActive: {
    position: "absolute" as const, top: "-4px", left: "-4px",
    width: "16px", height: "16px", borderRadius: "50%", border: "1px solid #2563EB",
    background: "#DBEAFE", cursor: "pointer", fontSize: "10px", lineHeight: "14px",
    textAlign: "center" as const, padding: 0, color: "#2563EB",
    zIndex: 2,
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
