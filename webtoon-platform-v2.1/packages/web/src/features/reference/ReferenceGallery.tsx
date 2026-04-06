// ============================================================
// ReferenceGallery — 레퍼런스 갤러리 & 의상 관리 (v2.1)
// Production-driven Reference System의 UI
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReferenceStore } from "@/stores";
import { firebaseService } from "@/services";
import type { Character, Location, CharacterRefTags, LocationRefTags, ReferenceImage, CharacterTraits, OutfitEntry } from "@webtoon/shared";
import { normalizeOutfit, OUTFIT_SYNONYMS, LOCATION_CANONICAL_CATEGORIES, ART_STYLES, ART_STYLE_KEYS, DEFAULT_ART_STYLE, buildCharRefPrompt, buildBgRefPrompt, buildAppearanceFromTraits } from "@webtoon/shared/types";
import type { CharacterPromptData } from "@webtoon/shared/types";
import {
  generateImage,
  isKieImageConfigured,
  getSelectedImageModel,
  setSelectedImageModel,
  KIE_IMAGE_MODELS,
  type KieTaskState,
} from "@/services/kieImageService";

const CHARACTER_TAG_OPTIONS = {
  emotion: ["happy", "angry", "sad", "neutral", "surprised", "scared"],
  outfit: ["uniform", "casual", "formal", "school", "sport", "pajamas", "swimwear", "traditional", "military", "costume"],
  angle: ["front", "side", "back", "three-quarter", "profile"],
  action: ["standing", "sitting", "running", "jumping", "lying"],
};

/**
 * 캐릭터의 description / defaultPromptSnippet 텍스트에서 traits를 자동 추출합니다.
 * TRAIT_OPTIONS의 값들과 매칭하여 가장 적합한 값을 찾습니다.
 */
function extractTraitsFromText(text: string): CharacterTraits {
  if (!text) return {};
  const lower = text.toLowerCase();
  const traits: CharacterTraits = {};

  // Gender
  if (/\bmale\b/.test(lower) && !/\bfemale\b/.test(lower)) traits.gender = "male";
  else if (/\bfemale\b|\bwoman\b|\b여성\b|\b여자\b/.test(lower)) traits.gender = "female";
  else if (/\bandrogynous\b/.test(lower)) traits.gender = "androgynous";
  if (/\b남성\b|\b남자\b|\b남편\b|\b동생\b/.test(lower) && !traits.gender) traits.gender = "male";
  if (/\b여성\b|\b여자\b|\b아내\b/.test(lower) && !traits.gender) traits.gender = "female";

  // Age
  const ageMatch = lower.match(/\b(\d{2})[\s-]?(?:year|세|살|대)/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age < 13) traits.age = "child";
    else if (age < 20) traits.age = "teen";
    else if (age < 30) traits.age = "20s";
    else if (age < 40) traits.age = "30s";
    else if (age < 50) traits.age = "40s";
    else traits.age = "50s+";
  } else {
    if (/\b20s?\b|20대/.test(lower)) traits.age = "20s";
    else if (/\b30s?\b|30대/.test(lower)) traits.age = "30s";
    else if (/\b40s?\b|40대/.test(lower)) traits.age = "40s";
    else if (/\b50s?\b|50대/.test(lower)) traits.age = "50s+";
    else if (/\bteen\b|10대/.test(lower)) traits.age = "teen";
  }

  // Hair color
  const hairColors = ["platinum blonde", "light brown", "dark brown", "black", "brown", "blonde", "red", "auburn", "silver", "white", "blue", "pink", "green", "purple"];
  for (const c of hairColors) {
    if (lower.includes(c) && lower.includes("hair")) { traits.hairColor = c; break; }
  }
  if (!traits.hairColor) {
    for (const c of hairColors) {
      if (lower.includes(c + " hair") || lower.includes(c + " ")) { traits.hairColor = c; break; }
    }
  }

  // Hair style
  const hairStyles = ["short straight", "short wavy", "short bob", "medium straight", "medium wavy", "long straight", "long wavy", "long curly", "ponytail", "twin tails", "braid", "bun", "pixie cut", "undercut", "buzz cut"];
  for (const s of hairStyles) {
    if (lower.includes(s)) { traits.hairStyle = s; break; }
  }
  // fallback: "short" + something
  if (!traits.hairStyle) {
    if (/\bshort\b.*\bhair\b|\bhair\b.*\bshort\b/.test(lower)) {
      if (lower.includes("wavy")) traits.hairStyle = "short wavy";
      else if (lower.includes("straight")) traits.hairStyle = "short straight";
    } else if (/\blong\b.*\bhair\b|\bhair\b.*\blong\b/.test(lower)) {
      if (lower.includes("wavy")) traits.hairStyle = "long wavy";
      else if (lower.includes("curly")) traits.hairStyle = "long curly";
      else traits.hairStyle = "long straight";
    }
  }

  // Eye color
  const eyeColors = ["dark brown", "brown", "hazel", "amber", "green", "blue", "gray", "black", "red", "gold"];
  for (const c of eyeColors) {
    if (lower.includes(c) && lower.includes("eye")) { traits.eyeColor = c; break; }
  }

  // Eye shape
  const eyeShapes = ["round", "almond", "sharp", "droopy", "upturned", "monolid", "double lid", "big", "narrow"];
  for (const s of eyeShapes) {
    if (lower.includes(s) && lower.includes("eye")) { traits.eyeShape = s; break; }
  }

  // Skin tone
  const skinTones = ["fair", "light", "medium", "olive", "tan", "brown", "dark"];
  for (const s of skinTones) {
    if (lower.includes(s + " skin") || lower.includes(s + " tone")) { traits.skinTone = s; break; }
  }

  // Body type
  if (/\bmuscular\b|\b근육\b/.test(lower)) traits.bodyType = "muscular";
  else if (/\bathletic\b/.test(lower)) traits.bodyType = "athletic";
  else if (/\bslim\b|\b날씬\b/.test(lower)) traits.bodyType = "slim";
  else if (/\bcurvy\b/.test(lower)) traits.bodyType = "curvy";
  else if (/\bpetite\b|\b단아\b|\b청초\b/.test(lower)) traits.bodyType = "petite";

  // Height
  if (/\btall\b|\b큰 키\b|\b장신\b/.test(lower)) traits.height = "tall";
  else if (/\bshort\b.*\bheight\b|\bpetite\b|\b작은\b/.test(lower)) traits.height = "short";

  // Face shape
  const faceShapes = ["oval", "round", "square", "heart", "long", "diamond", "v-line", "angular"];
  for (const s of faceShapes) {
    if (lower.includes(s) && /face|얼굴/.test(lower)) {
      traits.faceShape = s === "angular" ? "square" : s;
      break;
    }
  }

  return traits;
}

// ── 캐릭터 특성 옵션 ──
const TRAIT_OPTIONS = {
  gender: ["male", "female", "androgynous"],
  age: ["child", "teen", "20s", "30s", "40s", "50s+"],
  hairColor: ["black", "dark brown", "brown", "light brown", "blonde", "platinum blonde", "red", "auburn", "silver", "white", "blue", "pink", "green", "purple"],
  hairStyle: ["short straight", "short wavy", "short bob", "medium straight", "medium wavy", "long straight", "long wavy", "long curly", "ponytail", "twin tails", "braid", "bun", "pixie cut", "undercut", "buzz cut"],
  eyeColor: ["dark brown", "brown", "hazel", "amber", "green", "blue", "gray", "black", "red", "gold"],
  eyeShape: ["round", "almond", "sharp", "droopy", "upturned", "monolid", "double lid", "big", "narrow"],
  skinTone: ["fair", "light", "medium", "olive", "tan", "brown", "dark"],
  bodyType: ["slim", "average", "athletic", "muscular", "curvy", "petite", "tall and lean"],
  faceShape: ["oval", "round", "square", "heart", "long", "diamond", "v-line"],
};

const LOCATION_TAG_OPTIONS = {
  timeOfDay: ["morning", "afternoon", "evening", "night"],
  weather: ["clear", "rainy", "cloudy", "snowy", "stormy"],
  mood: ["bright", "dark", "mysterious", "peaceful", "tense"],
};

export function ReferenceGallery() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { characters, locations, outfits, addCharacter, addLocation, removeCharacter, removeLocation, addOrUpdateOutfit, removeOutfit, loading, currentProjectId, reloadReferences, setCharacters } =
    useReferenceStore();

  const resolvedProjectId = projectId || currentProjectId;

  useEffect(() => {
    if (projectId) {
      reloadReferences(projectId);
    }
  }, [projectId, reloadReferences]);

  const [activeTab, setActiveTab] = useState<"characters" | "locations" | "outfits">("characters");
  const [selectedCharEmotion, setSelectedCharEmotion] = useState<string | null>(null);
  const [selectedCharOutfit, setSelectedCharOutfit] = useState<string | null>(null);
  const [selectedCharAngle, setSelectedCharAngle] = useState<string | null>(null);
  const [selectedLocTimeOfDay, setSelectedLocTimeOfDay] = useState<string | null>(null);
  const [selectedLocWeather, setSelectedLocWeather] = useState<string | null>(null);
  const [selectedLocMood, setSelectedLocMood] = useState<string | null>(null);

  // 캐릭터/장소 생성 폼
  const [showNewCharacterForm, setShowNewCharacterForm] = useState(false);
  const [newCharData, setNewCharData] = useState({ name: "", description: "" });
  const [showNewLocationForm, setShowNewLocationForm] = useState(false);
  const [newLocData, setNewLocData] = useState({ name: "", description: "" });

  // 의상 관리 모달
  const [outfitModal, setOutfitModal] = useState<{
    open: boolean;
    charId: string;
    mode: "add" | "edit";
    editOutfitId?: string;
  }>({ open: false, charId: "", mode: "add" });
  const [outfitForm, setOutfitForm] = useState({
    name: "",
    description: "",
    promptSnippet: "",
    accessories: "",
    colorPalette: "",
    isDefault: false,
  });

  // 의상 상세 보기
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);

  // ── 의상 라이브러리 (OutfitEntry) ──
  const [outfitLibFilter, setOutfitLibFilter] = useState<string>("all"); // "all" | characterId
  const [outfitLibModal, setOutfitLibModal] = useState<{
    open: boolean;
    mode: "add" | "edit";
    editId?: string;
    prefillCharId?: string;
  }>({ open: false, mode: "add" });
  const [outfitLibForm, setOutfitLibForm] = useState({
    characterId: "",
    label: "",
    description: "",
    colorPalette: "",
    accessories: "",
    isDefault: false,
  });

  // ── 캐릭터 특성 편집 ──
  const [traitsEditingCharId, setTraitsEditingCharId] = useState<string | null>(null);
  const [traitsForm, setTraitsForm] = useState<CharacterTraits>({});
  const [characterCoreForm, setCharacterCoreForm] = useState<string>("");

  // ── 프롬프트 미리보기/편집 팝업 ──
  const [promptPopup, setPromptPopup] = useState<{
    open: boolean; charId: string; locId: string; prompt: string; isCustom: boolean;
  }>({ open: false, charId: "", locId: "", prompt: "", isCustom: false });

  // ── 이미지 라이트박스 ──
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

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
    } catch {
      window.open(url, "_blank");
    }
  }, []);

  // ── 레퍼런스 이미지 생성 ──
  const [artStyleKey, setArtStyleKey] = useState(DEFAULT_ART_STYLE);
  const [selectedModel, setSelectedModel] = useState(getSelectedImageModel());
  const [generatingRefId, setGeneratingRefId] = useState<string | null>(null); // "char_{id}" | "loc_{id}"
  const [refGenProgress, setRefGenProgress] = useState<Record<string, string>>({});
  const kieReady = isKieImageConfigured();

  // ── 카테고리별 일괄 생성 ──
  const [isBulkGenChar, setIsBulkGenChar] = useState(false);
  const [isBulkGenLoc, setIsBulkGenLoc] = useState(false);
  const [isBulkGenOutfit, setIsBulkGenOutfit] = useState(false);
  const [bulkGenProgress, setBulkGenProgress] = useState<Record<string, string>>({});
  const [bulkGenImages, setBulkGenImages] = useState<Record<string, string>>({});
  const [bulkGenError, setBulkGenError] = useState<string | null>(null);

  // ── 카테고리별 모델 선택 ──
  const [charModel, setCharModel] = useState(() => localStorage.getItem("KIE_CHAR_MODEL") || getSelectedImageModel());
  const [locModel, setLocModel] = useState(() => localStorage.getItem("KIE_LOC_MODEL") || getSelectedImageModel());
  const [outfitModel, setOutfitModel] = useState(() => localStorage.getItem("KIE_OUTFIT_MODEL") || getSelectedImageModel());

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    setSelectedImageModel(modelId);
  };
  const handleCharModelChange = (modelId: string) => { setCharModel(modelId); localStorage.setItem("KIE_CHAR_MODEL", modelId); };
  const handleLocModelChange = (modelId: string) => { setLocModel(modelId); localStorage.setItem("KIE_LOC_MODEL", modelId); };
  const handleOutfitModelChange = (modelId: string) => { setOutfitModel(modelId); localStorage.setItem("KIE_OUTFIT_MODEL", modelId); };

  // ── 캐릭터 특성 편집 ──
  const openTraitsEditor = (char: Character) => {
    if (traitsEditingCharId === char.id) {
      // 이미 열려있으면 접기
      setTraitsEditingCharId(null);
      return;
    }
    setTraitsEditingCharId(char.id);
    setCharacterCoreForm(char.characterCore || "");

    // traits가 이미 있으면 그대로 사용, 없으면 description/prompt에서 자동 추출
    const existingTraits = char.traits || {};
    const hasAnyTrait = Object.values(existingTraits).some(Boolean);
    if (hasAnyTrait) {
      setTraitsForm(existingTraits);
    } else {
      // description과 defaultPromptSnippet 합쳐서 추출
      const textSource = [char.description || "", char.defaultPromptSnippet || ""].join(" ");
      const extracted = extractTraitsFromText(textSource);
      setTraitsForm(extracted);
      console.log("[Gallery] 캐릭터 특성 자동 추출:", char.name, extracted);
    }
  };

  // ── 의상 단건 레퍼런스 생성 (OutfitEntry 기반) ──
  const handleGenerateSingleOutfit = useCallback(async (outfit: OutfitEntry, char: Character) => {
    if (!kieReady || !resolvedProjectId) return;
    const key = `outfit_${outfit.id}`;
    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };
    setBulkGenProgress(p => ({ ...p, [key]: "대기 중..." }));
    const style = ART_STYLES[artStyleKey];
    const charBase = char.characterCore || char.defaultPromptSnippet || char.description || char.name;
    const prompt = `${style?.prefix || ""}full body character reference sheet, front view, clean background. ${charBase}, wearing ${outfit.description}. ${style?.charSuffix || "high quality, clean illustration"}`;
    let refImageUrls: string[] | undefined;
    if (char.baseRefImageId) {
      const baseRef = char.references.find(r => r.id === char.baseRefImageId);
      if (baseRef?.storageUrl && !baseRef.storageUrl.startsWith("data:")) {
        refImageUrls = [baseRef.storageUrl];
      }
    }
    try {
      const result = await generateImage(prompt, {
        imageSize: "portrait_4_3", modelId: outfitModel,
        referenceImageUrls: refImageUrls,
        onProgress: (state: KieTaskState, elapsed: number) =>
          setBulkGenProgress(p => ({ ...p, [key]: `${stateLabels[state] || state} (${elapsed}초)` })),
      });
      setBulkGenProgress(p => ({ ...p, [key]: `✓ 완료 (${result.duration}초)` }));
      const now = Date.now();
      const newRef: ReferenceImage = {
        id: `ref_${now}_outfit`,
        storageUrl: result.imageUrl,
        tags: { emotion: "neutral", outfit: outfit.label, angle: "front" } as any,
        sourceEpisode: "", sourcePanel: 0, usageCount: 0, quality: 3, createdAt: now,
      };
      const updatedOutfit = { ...outfit, references: [newRef, ...outfit.references], updatedAt: now };
      addOrUpdateOutfit(updatedOutfit);
    } catch (e: any) {
      setBulkGenProgress(p => ({ ...p, [key]: `❌ ${(e.message || "오류").slice(0, 60)}` }));
    }
  }, [kieReady, resolvedProjectId, artStyleKey, outfitModel, addOrUpdateOutfit]);

  // ── 기준 외형 이미지 핀 고정 ──
  const handleSetBaseRef = useCallback(async (charId: string, refId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !resolvedProjectId) return;
    // 이미 핀된 이미지 클릭 시 해제
    const newBaseId = char.baseRefImageId === refId ? undefined : refId;
    const updatedChar = { ...char, baseRefImageId: newBaseId, updatedAt: Date.now() };
    setCharacters(characters.map(c => c.id === charId ? updatedChar : c));
    try {
      await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
    } catch (e) { console.error("[Gallery] 기준 외형 저장 실패:", e); }
  }, [characters, resolvedProjectId, setCharacters]);

  const saveTraits = useCallback(async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !resolvedProjectId) return;
    const updatedChar = {
      ...char,
      traits: { ...traitsForm },
      characterCore: characterCoreForm.trim() || char.characterCore,
      updatedAt: Date.now(),
    };
    setCharacters(characters.map(c => c.id === charId ? updatedChar : c));
    setTraitsEditingCharId(null);
    try {
      await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
    } catch (e) { console.error("[Gallery] 특성 저장 실패:", e); }
  }, [traitsForm, characterCoreForm, characters, resolvedProjectId, setCharacters]);

  // ── 프롬프트 생성 & 팝업 ──
  const buildPromptForChar = useCallback((char: Character): string => {
    const traits = char.traits || {};
    const appearance = buildAppearanceFromTraits(traits);
    const charOutfits = outfits.filter(o => o.characterId === char.id);
    const activeOutfit = charOutfits.find(o => o.id === char.currentOutfitId)
      || charOutfits.find(o => o.isDefault);

    // traits가 하나라도 설정되어 있으면 refPrompt를 무시하고 traits 기반 구조화 프롬프트 사용
    const hasTraits = Object.values(traits).some(Boolean);
    const charData: CharacterPromptData = {
      name: char.name,
      refPrompt: hasTraits ? "" : (char.defaultPromptSnippet || ""),
      appearance: appearance || (char as any).appearance || char.description || "",
      outfit: activeOutfit?.description || "",
      accessories: activeOutfit?.accessories?.join(", ") || "",
      distinctFeatures: traits.distinctFeatures || (char as any).distinctFeatures || "",
      promptSnippet: char.defaultPromptSnippet || char.description || "",
      traits,
    };

    let prompt = buildCharRefPrompt(charData, { artStyleKey });

    if (!prompt || prompt.length < 50) {
      const style = ART_STYLES[artStyleKey];
      prompt = `${style?.prefix || ""}character reference sheet, full body portrait, white background, clean illustration, ${appearance || char.description || "young character"}, multiple angles, front view and side view${style?.charSuffix || ", high quality, detailed"}`;
    }

    return prompt;
  }, [characters, artStyleKey]);

  const openPromptPopup = (char: Character) => {
    const prompt = buildPromptForChar(char);
    setPromptPopup({ open: true, charId: char.id, locId: "", prompt, isCustom: false });
  };

  const buildPromptForLoc = useCallback((loc: Location): string => {
    // spaceStyle이 있으면 공간 일관성을 위해 description 앞에 추가
    const descBase = loc.description || loc.defaultPromptSnippet || "detailed location";
    const fullDesc = (loc as any).spaceStyle
      ? `${(loc as any).spaceStyle}. ${descBase}`
      : descBase;
    return buildBgRefPrompt(loc.name, fullDesc, artStyleKey);
  }, [artStyleKey]);

  const openLocPromptPopup = (loc: Location) => {
    const prompt = buildPromptForLoc(loc);
    setPromptPopup({ open: true, charId: "", locId: loc.id, prompt, isCustom: false });
  };

  const generateFromPopup = useCallback(async () => {
    // 장소 프롬프트 팝업에서 생성
    if (promptPopup.locId) {
      const loc = locations.find(l => l.id === promptPopup.locId);
      if (!loc || !kieReady || !resolvedProjectId) return;
      const key = `loc_${loc.id}`;
      setPromptPopup(prev => ({ ...prev, open: false }));
      setGeneratingRefId(key);
      setRefGenProgress(prev => ({ ...prev, [key]: "대기 중..." }));
      const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };
      try {
        const result = await generateImage(promptPopup.prompt, {
          imageSize: "landscape_4_3",
          onProgress: (state: KieTaskState, elapsed: number) => {
            setRefGenProgress(prev => ({ ...prev, [key]: `${stateLabels[state] || state} (${elapsed}초)` }));
          },
        });
        setRefGenProgress(prev => ({ ...prev, [key]: `완료 (${result.duration}초)` }));
        const now = Date.now();
        const newRef: ReferenceImage = {
          id: `ref_${now}_refgen`,
          storageUrl: result.imageUrl,
          tags: { timeOfDay: "afternoon", weather: "clear", mood: "bright" },
          sourceEpisode: "",
          sourcePanel: 0,
          usageCount: 0,
          quality: 3,
          createdAt: now,
        };
        const updatedLoc = { ...loc, references: [...loc.references, newRef], updatedAt: now };
        const { locations: curLocs } = useReferenceStore.getState();
        useReferenceStore.getState().setLocations(curLocs.map(l => l.id === loc.id ? updatedLoc : l));
        await firebaseService.saveLocation(resolvedProjectId, updatedLoc);
        console.log(`[Gallery] 장소 레퍼런스 생성 완료: ${loc.name}`);
      } catch (err: any) {
        console.error(`[Gallery] 장소 레퍼런스 생성 실패:`, err);
        setRefGenProgress(prev => ({ ...prev, [key]: `실패: ${err.message}` }));
      } finally {
        setGeneratingRefId(null);
      }
      return;
    }

    // 캐릭터 프롬프트 팝업에서 생성
    const char = characters.find(c => c.id === promptPopup.charId);
    if (!char || !kieReady || !resolvedProjectId) return;
    const key = `char_${char.id}`;
    setPromptPopup(prev => ({ ...prev, open: false }));
    setGeneratingRefId(key);
    setRefGenProgress(prev => ({ ...prev, [key]: "대기 중..." }));

    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };

    try {
      const result = await generateImage(promptPopup.prompt, {
        imageSize: "portrait_4_3",
        onProgress: (state: KieTaskState, elapsed: number) => {
          setRefGenProgress(prev => ({ ...prev, [key]: `${stateLabels[state] || state} (${elapsed}초)` }));
        },
      });
      setRefGenProgress(prev => ({ ...prev, [key]: `완료 (${result.duration}초)` }));

      const now = Date.now();
      const charOutfitsForTag = outfits.filter(o => o.characterId === char.id);
      const activeOutfitForTag = charOutfitsForTag.find(o => o.id === char.currentOutfitId);
      const newRef: ReferenceImage = {
        id: `ref_${now}_refgen`,
        storageUrl: result.imageUrl,
        tags: { emotion: "neutral", outfit: activeOutfitForTag?.label || "default", angle: "front" },
        sourceEpisode: "",
        sourcePanel: 0,
        usageCount: 0,
        quality: 3,
        createdAt: now,
      };
      const updatedChar = { ...char, references: [...char.references, newRef], updatedAt: now };
      setCharacters(characters.map(c => c.id === char.id ? updatedChar : c));
      await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
    } catch (err: any) {
      console.error(`[Gallery] 레퍼런스 생성 실패:`, err);
      setRefGenProgress(prev => ({ ...prev, [key]: `실패: ${err.message}` }));
    } finally {
      setGeneratingRefId(null);
    }
  }, [promptPopup, characters, locations, kieReady, resolvedProjectId, setCharacters]);

  const generateCharRefImage = useCallback(async (char: Character) => {
    if (!kieReady || !resolvedProjectId) return;
    // 프롬프트 팝업을 통해 생성
    openPromptPopup(char);
  }, [kieReady, resolvedProjectId, buildPromptForChar]);

  const generateLocRefImage = useCallback(async (loc: Location) => {
    if (!kieReady || !resolvedProjectId) return;
    const key = `loc_${loc.id}`;
    setGeneratingRefId(key);
    setRefGenProgress(prev => ({ ...prev, [key]: "대기 중..." }));

    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };
    const refPrompt = buildBgRefPrompt(loc.name, loc.description || loc.defaultPromptSnippet || "detailed location", artStyleKey);

    try {
      const result = await generateImage(refPrompt, {
        imageSize: "landscape_4_3",
        onProgress: (state: KieTaskState, elapsed: number) => {
          setRefGenProgress(prev => ({ ...prev, [key]: `${stateLabels[state] || state} (${elapsed}초)` }));
        },
      });
      setRefGenProgress(prev => ({ ...prev, [key]: `완료 (${result.duration}초)` }));

      const now = Date.now();
      const newRef: ReferenceImage = {
        id: `ref_${now}_refgen`,
        storageUrl: result.imageUrl,
        tags: { timeOfDay: "afternoon", weather: "clear", mood: "bright" },
        sourceEpisode: "",
        sourcePanel: 0,
        usageCount: 0,
        quality: 3,
        createdAt: now,
      };
      const updatedLoc = { ...loc, references: [...loc.references, newRef], updatedAt: now };
      const { locations: curLocs } = useReferenceStore.getState();
      useReferenceStore.getState().setLocations(curLocs.map(l => l.id === loc.id ? updatedLoc : l));
      await firebaseService.saveLocation(resolvedProjectId, updatedLoc);
      console.log(`[Gallery] 장소 레퍼런스 생성 완료: ${loc.name}`);
    } catch (err: any) {
      console.error(`[Gallery] 장소 레퍼런스 생성 실패:`, err);
      setRefGenProgress(prev => ({ ...prev, [key]: `실패: ${err.message}` }));
    } finally {
      setGeneratingRefId(null);
    }
  }, [kieReady, resolvedProjectId, artStyleKey]);

  // ── 캐릭터 일괄 생성 ──────────────────────────────────────────
  const handleBulkGenerateChars = useCallback(async () => {
    if (!kieReady || !resolvedProjectId) return;
    setIsBulkGenChar(true);
    setBulkGenError(null);
    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };
    const charsToGen = useReferenceStore.getState().characters.filter(c => c.references.length === 0);
    for (const char of charsToGen) {
      const key = `char_${char.id}`;
      setBulkGenProgress(p => ({ ...p, [key]: "대기 중..." }));
      const prompt = buildPromptForChar(char);
      try {
        const result = await generateImage(prompt, {
          imageSize: "portrait_4_3",
          modelId: charModel,
          onProgress: (state: KieTaskState, elapsed: number) =>
            setBulkGenProgress(p => ({ ...p, [key]: `${stateLabels[state] || state} (${elapsed}초)` })),
        });
        setBulkGenProgress(p => ({ ...p, [key]: `✓ 완료 (${result.duration}초)` }));
        setBulkGenImages(p => ({ ...p, [key]: result.imageUrl }));
        const now = Date.now();
        const newRef: ReferenceImage = {
          id: `ref_${now}_bulk`,
          storageUrl: result.imageUrl,
          tags: { emotion: "neutral", outfit: "default", angle: "front" },
          sourceEpisode: "", sourcePanel: 0, usageCount: 0, quality: 3, createdAt: now,
        };
        const { characters: curChars } = useReferenceStore.getState();
        const curChar = curChars.find(c => c.id === char.id) || char;
        const updatedChar = { ...curChar, references: [...curChar.references, newRef], updatedAt: now };
        useReferenceStore.getState().setCharacters(curChars.map(c => c.id === char.id ? updatedChar : c));
        await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
      } catch (e: any) {
        setBulkGenProgress(p => ({ ...p, [key]: `❌ ${(e.message || "오류").slice(0, 60)}` }));
      }
    }
    setIsBulkGenChar(false);
  }, [kieReady, resolvedProjectId, charModel, buildPromptForChar]);

  // ── 장소 일괄 생성 ────────────────────────────────────────────
  const handleBulkGenerateLocs = useCallback(async () => {
    if (!kieReady || !resolvedProjectId) return;
    setIsBulkGenLoc(true);
    setBulkGenError(null);
    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };
    const locsToGen = useReferenceStore.getState().locations.filter(l => l.references.length === 0);
    for (const loc of locsToGen) {
      const key = `loc_${loc.id}`;
      setBulkGenProgress(p => ({ ...p, [key]: "대기 중..." }));
      const prompt = buildPromptForLoc(loc);
      try {
        const result = await generateImage(prompt, {
          imageSize: "landscape_4_3",
          modelId: locModel,
          onProgress: (state: KieTaskState, elapsed: number) =>
            setBulkGenProgress(p => ({ ...p, [key]: `${stateLabels[state] || state} (${elapsed}초)` })),
        });
        setBulkGenProgress(p => ({ ...p, [key]: `✓ 완료 (${result.duration}초)` }));
        setBulkGenImages(p => ({ ...p, [key]: result.imageUrl }));
        const now = Date.now();
        const newRef: ReferenceImage = {
          id: `ref_${now}_bulk`,
          storageUrl: result.imageUrl,
          tags: { timeOfDay: "afternoon", weather: "clear", mood: "bright" },
          sourceEpisode: "", sourcePanel: 0, usageCount: 0, quality: 3, createdAt: now,
        };
        const { locations: curLocs } = useReferenceStore.getState();
        const curLoc = curLocs.find(l => l.id === loc.id) || loc;
        const updatedLoc = { ...curLoc, references: [...curLoc.references, newRef], updatedAt: now };
        useReferenceStore.getState().setLocations(curLocs.map(l => l.id === loc.id ? updatedLoc : l));
        await firebaseService.saveLocation(resolvedProjectId, updatedLoc);
      } catch (e: any) {
        setBulkGenProgress(p => ({ ...p, [key]: `❌ ${(e.message || "오류").slice(0, 60)}` }));
      }
    }
    setIsBulkGenLoc(false);
  }, [kieReady, resolvedProjectId, locModel, buildPromptForLoc]);

  // ── 의상 일괄 생성 ────────────────────────────────────────────
  const handleBulkGenerateOutfits = useCallback(async () => {
    if (!kieReady || !resolvedProjectId) return;
    setIsBulkGenOutfit(true);
    setBulkGenError(null);
    const stateLabels: Record<string, string> = { waiting: "대기 중", queuing: "큐 대기", generating: "생성 중" };
    const outfitsToGen = useReferenceStore.getState().outfits.filter(o => o.references.length === 0);
    for (const outfit of outfitsToGen) {
      const key = `outfit_${outfit.id}`;
      setBulkGenProgress(p => ({ ...p, [key]: "대기 중..." }));
      const style = ART_STYLES[artStyleKey];
      // Find the matching character to build "character wearing outfit" prompt
      const { characters: allChars } = useReferenceStore.getState();
      const matchedChar = allChars.find(
        c => c.id === outfit.characterId || c.name === outfit.characterName
      );
      let prompt: string;
      let refImageUrls: string[] | undefined;
      if (matchedChar) {
        const charBase = matchedChar.characterCore || matchedChar.defaultPromptSnippet || matchedChar.description || matchedChar.name;
        prompt = `${style?.prefix || ""}full body character reference sheet, front view, clean background. ${charBase}, wearing ${outfit.description}. ${style?.charSuffix || "high quality, clean illustration"}`;
        // 기준 외형 이미지가 있으면 img2img reference로 전달 (data URL 제외)
        if (matchedChar.baseRefImageId) {
          const baseRef = matchedChar.references.find(r => r.id === matchedChar.baseRefImageId);
          if (baseRef && baseRef.storageUrl && !baseRef.storageUrl.startsWith("data:")) {
            refImageUrls = [baseRef.storageUrl];
          }
        }
      } else {
        // Fallback to flat-lay if character not found
        prompt = `${style?.prefix || ""}clothing reference sheet, flat-lay style, clean white background. ${outfit.description}. Detailed fabric texture, color, pattern. ${style?.charSuffix || "high quality, clean illustration"}`;
      }
      try {
        const result = await generateImage(prompt, {
          imageSize: "portrait_4_3",
          modelId: outfitModel,
          referenceImageUrls: refImageUrls,
          onProgress: (state: KieTaskState, elapsed: number) =>
            setBulkGenProgress(p => ({ ...p, [key]: `${stateLabels[state] || state} (${elapsed}초)` })),
        });
        setBulkGenProgress(p => ({ ...p, [key]: `✓ 완료 (${result.duration}초)` }));
        setBulkGenImages(p => ({ ...p, [key]: result.imageUrl }));
        const now = Date.now();
        const newRef: ReferenceImage = {
          id: `ref_${now}_bulk`,
          storageUrl: result.imageUrl,
          tags: { emotion: "neutral", outfit: outfit.label, angle: "front" } as any,
          sourceEpisode: "", sourcePanel: 0, usageCount: 0, quality: 3, createdAt: now,
        };
        const updatedOutfit = { ...outfit, references: [...outfit.references, newRef], updatedAt: now };
        addOrUpdateOutfit(updatedOutfit);
      } catch (e: any) {
        setBulkGenProgress(p => ({ ...p, [key]: `❌ ${(e.message || "오류").slice(0, 60)}` }));
      }
    }
    setIsBulkGenOutfit(false);
  }, [kieReady, resolvedProjectId, artStyleKey, outfitModel, addOrUpdateOutfit]);

  const handleCreateCharacter = async () => {
    if (!newCharData.name.trim()) { alert("캐릭터 이름을 입력하세요"); return; }
    if (!resolvedProjectId) { alert("프로젝트를 먼저 선택하세요"); return; }
    const newChar: Character = {
      id: `char_${Date.now()}`,
      projectId: resolvedProjectId,
      name: newCharData.name,
      description: newCharData.description,
      defaultPromptSnippet: "",
      references: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      addCharacter(newChar);
      firebaseService.saveCharacter(resolvedProjectId, newChar).catch(console.error);
      setShowNewCharacterForm(false);
      setNewCharData({ name: "", description: "" });
    } catch (err) { console.error("Failed to create character", err); }
  };

  const handleCreateLocation = async () => {
    if (!newLocData.name.trim()) { alert("장소 이름을 입력하세요"); return; }
    if (!resolvedProjectId) { alert("프로젝트를 먼저 선택하세요"); return; }
    const newLoc: Location = {
      id: `loc_${Date.now()}`,
      projectId: resolvedProjectId,
      name: newLocData.name,
      description: newLocData.description,
      defaultPromptSnippet: "",
      references: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      addLocation(newLoc);
      firebaseService.saveLocation(resolvedProjectId, newLoc).catch(console.error);
      setShowNewLocationForm(false);
      setNewLocData({ name: "", description: "" });
    } catch (err) { console.error("Failed to create location", err); }
  };

  // ── 의상 CRUD ──
  const openAddOutfit = (charId: string) => {
    setOutfitModal({ open: true, charId, mode: "add" });
    setOutfitForm({ name: "", description: "", promptSnippet: "", accessories: "", colorPalette: "", isDefault: false });
  };

  const openEditOutfit = (charId: string, outfit: OutfitEntry) => {
    setOutfitModal({ open: true, charId, mode: "edit", editOutfitId: outfit.id });
    setOutfitForm({
      name: outfit.label,
      description: outfit.description,
      promptSnippet: outfit.description,
      accessories: (outfit.accessories || []).join(", "),
      colorPalette: (outfit.colorPalette || []).join(", "),
      isDefault: outfit.isDefault || false,
    });
  };

  const handleSaveOutfit = useCallback(async () => {
    if (!outfitForm.name.trim()) { alert("의상 이름을 입력하세요"); return; }
    const char = characters.find(c => c.id === outfitModal.charId);
    if (!char || !resolvedProjectId) return;

    const now = Date.now();
    const accessories = outfitForm.accessories.split(",").map(s => s.trim()).filter(Boolean);
    const colorPalette = outfitForm.colorPalette.split(",").map(s => s.trim()).filter(Boolean);
    const charOutfitsLocal = outfits.filter(o => o.characterId === char.id);

    if (outfitModal.mode === "add") {
      const outfitId = `outfit_${now}_${normalizeOutfit(outfitForm.name)}`;
      // 기본 의상 설정 시 기존 기본 해제
      if (outfitForm.isDefault) {
        for (const existing of charOutfitsLocal) {
          if (existing.isDefault) {
            addOrUpdateOutfit({ ...existing, isDefault: false, updatedAt: now });
          }
        }
      }
      addOrUpdateOutfit({
        id: outfitId,
        projectId: resolvedProjectId,
        characterId: char.id,
        characterName: char.name,
        label: outfitForm.name,
        description: outfitForm.description || `wearing ${outfitForm.name}`,
        references: [],
        accessories: accessories.length > 0 ? accessories : undefined,
        colorPalette: colorPalette.length > 0 ? colorPalette : undefined,
        isDefault: outfitForm.isDefault,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existingOutfit = charOutfitsLocal.find(o => o.id === outfitModal.editOutfitId);
      if (existingOutfit) {
        if (outfitForm.isDefault) {
          for (const other of charOutfitsLocal) {
            if (other.isDefault && other.id !== existingOutfit.id) {
              addOrUpdateOutfit({ ...other, isDefault: false, updatedAt: now });
            }
          }
        }
        addOrUpdateOutfit({
          ...existingOutfit,
          label: outfitForm.name,
          description: outfitForm.description || `wearing ${outfitForm.name}`,
          accessories: accessories.length > 0 ? accessories : undefined,
          colorPalette: colorPalette.length > 0 ? colorPalette : undefined,
          isDefault: outfitForm.isDefault,
          updatedAt: now,
        });
      }
    }

    console.log(`[Gallery] 의상 저장 완료 (OutfitEntry): ${char.name} → ${outfitForm.name}`);
    setOutfitModal({ open: false, charId: "", mode: "add" });
  }, [outfitForm, outfitModal, characters, outfits, resolvedProjectId, addOrUpdateOutfit]);

  const handleDeleteOutfit = useCallback(async (charId: string, outfitId: string) => {
    if (!confirm("이 의상을 삭제하시겠습니까?")) return;
    const char = characters.find(c => c.id === charId);
    if (!char || !resolvedProjectId) return;

    removeOutfit(outfitId);

    // currentOutfitId가 삭제된 의상이면 다른 의상으로 전환
    if (char.currentOutfitId === outfitId) {
      const remaining = outfits.filter(o => o.characterId === charId && o.id !== outfitId);
      const nextId = remaining.find(o => o.isDefault)?.id || remaining[0]?.id;
      const updatedChar = { ...char, currentOutfitId: nextId, updatedAt: Date.now() };
      setCharacters(characters.map(c => c.id === charId ? updatedChar : c));
      try {
        await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
      } catch (e) { console.error("[Gallery] currentOutfitId 업데이트 실패:", e); }
    }
  }, [characters, outfits, resolvedProjectId, setCharacters, removeOutfit]);

  const handleSetActiveOutfit = useCallback(async (charId: string, outfitId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !resolvedProjectId) return;
    const updatedChar = { ...char, currentOutfitId: outfitId, updatedAt: Date.now() };
    setCharacters(characters.map(c => c.id === charId ? updatedChar : c));
    try {
      await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
    } catch (e) { console.error("[Gallery] 활성 의상 변경 실패:", e); }
  }, [characters, resolvedProjectId, setCharacters]);

  // ── 의상 라이브러리 CRUD ──────────────────────────────────────
  const handleSaveOutfitLib = useCallback(() => {
    if (!outfitLibForm.characterId) { alert("캐릭터를 선택하세요"); return; }
    if (!outfitLibForm.label.trim()) { alert("의상 이름을 입력하세요"); return; }
    const char = characters.find(c => c.id === outfitLibForm.characterId);
    if (!char) return;

    const now = Date.now();
    const accessories = outfitLibForm.accessories.split(",").map(s => s.trim()).filter(Boolean);
    const colorPalette = outfitLibForm.colorPalette.split(",").map(s => s.trim()).filter(Boolean);

    // normalized_id: "{char_name_romanized}_outfit_{label_keyword}"
    const labelKey = outfitLibForm.label.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
    const charKey = char.name.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
    const id = outfitLibModal.mode === "edit" && outfitLibModal.editId
      ? outfitLibModal.editId
      : `${charKey}_outfit_${labelKey}_${now}`;

    const entry: OutfitEntry = {
      id,
      projectId: resolvedProjectId || "",
      characterId: outfitLibForm.characterId,
      characterName: char.name,
      label: outfitLibForm.label,
      description: outfitLibForm.description,
      references: outfitLibModal.mode === "edit"
        ? (outfits.find(o => o.id === outfitLibModal.editId)?.references || [])
        : [],
      colorPalette: colorPalette.length > 0 ? colorPalette : undefined,
      accessories: accessories.length > 0 ? accessories : undefined,
      isDefault: outfitLibForm.isDefault,
      usageCount: outfitLibModal.mode === "edit"
        ? (outfits.find(o => o.id === outfitLibModal.editId)?.usageCount || 0)
        : 0,
      createdAt: outfitLibModal.mode === "edit"
        ? (outfits.find(o => o.id === outfitLibModal.editId)?.createdAt || now)
        : now,
      updatedAt: now,
    };

    addOrUpdateOutfit(entry);
    setOutfitLibModal({ open: false, mode: "add" });
    setOutfitLibForm({ characterId: "", label: "", description: "", colorPalette: "", accessories: "", isDefault: false });
  }, [outfitLibForm, outfitLibModal, characters, outfits, resolvedProjectId, addOrUpdateOutfit]);

  const openOutfitLibAdd = useCallback((prefillCharId?: string) => {
    setOutfitLibForm({ characterId: prefillCharId || (characters[0]?.id || ""), label: "", description: "", colorPalette: "", accessories: "", isDefault: false });
    setOutfitLibModal({ open: true, mode: "add", prefillCharId });
  }, [characters]);

  const openOutfitLibEdit = useCallback((outfit: OutfitEntry) => {
    setOutfitLibForm({
      characterId: outfit.characterId,
      label: outfit.label,
      description: outfit.description,
      colorPalette: (outfit.colorPalette || []).join(", "),
      accessories: (outfit.accessories || []).join(", "),
      isDefault: outfit.isDefault || false,
    });
    setOutfitLibModal({ open: true, mode: "edit", editId: outfit.id });
  }, []);

  // ── 캐릭터/장소 삭제 ──
  const handleDeleteCharacter = useCallback((charId: string, charName: string) => {
    if (!confirm(`"${charName}" 캐릭터를 삭제하시겠습니까?\n\n등록된 레퍼런스 이미지와 의상 정보가 모두 삭제됩니다.`)) return;
    removeCharacter(charId);
  }, [removeCharacter]);

  const handleDeleteLocation = useCallback((locId: string, locName: string) => {
    if (!confirm(`"${locName}" 장소를 삭제하시겠습니까?\n\n등록된 레퍼런스 이미지가 모두 삭제됩니다.`)) return;
    removeLocation(locId);
  }, [removeLocation]);

  // ── 개별 레퍼런스 이미지 삭제 ──
  // ── 이미지 업로드 → 기준 외형 레퍼런스로 저장 ──
  const handleUploadBaseRef = useCallback(async (charId: string, file: File) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !resolvedProjectId) return;
    // FileReader로 data URL 생성 (로컬 미리보기; 필요 시 Storage 업로드로 교체 가능)
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const now = Date.now();
      const newRef: ReferenceImage = {
        id: `ref_upload_${now}`,
        storageUrl: dataUrl,
        tags: { emotion: "neutral", outfit: "base", angle: "front" } as any,
        sourceEpisode: "", sourcePanel: 0, usageCount: 0, quality: 5, createdAt: now,
      };
      const updatedChar = {
        ...char,
        references: [newRef, ...char.references],
        baseRefImageId: newRef.id,
        updatedAt: now,
      };
      setCharacters(characters.map(c => c.id === charId ? updatedChar : c));
      try {
        await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
      } catch (e) { console.error("[Gallery] 업로드 레퍼런스 저장 실패:", e); }
    };
    reader.readAsDataURL(file);
  }, [characters, resolvedProjectId, setCharacters]);

  const handleDeleteCharRef = useCallback(async (charId: string, refId: string) => {
    if (!confirm("이 레퍼런스 이미지를 삭제하시겠습니까?")) return;
    const char = characters.find(c => c.id === charId);
    if (!char || !resolvedProjectId) return;
    const updatedChar = { ...char, references: char.references.filter(r => r.id !== refId), updatedAt: Date.now() };
    setCharacters(characters.map(c => c.id === charId ? updatedChar : c));
    try {
      await firebaseService.saveCharacter(resolvedProjectId, updatedChar);
    } catch (e) { console.error("[Gallery] 레퍼런스 이미지 삭제 실패:", e); }
  }, [characters, resolvedProjectId, setCharacters]);

  const handleDeleteLocRef = useCallback(async (locId: string, refId: string) => {
    if (!confirm("이 레퍼런스 이미지를 삭제하시겠습니까?")) return;
    const { locations: curLocs } = useReferenceStore.getState();
    const loc = curLocs.find(l => l.id === locId);
    if (!loc || !resolvedProjectId) return;
    const updatedLoc = { ...loc, references: loc.references.filter(r => r.id !== refId), updatedAt: Date.now() };
    useReferenceStore.getState().setLocations(curLocs.map(l => l.id === locId ? updatedLoc : l));
    try {
      await firebaseService.saveLocation(resolvedProjectId, updatedLoc);
    } catch (e) { console.error("[Gallery] 장소 레퍼런스 이미지 삭제 실패:", e); }
  }, [resolvedProjectId]);

  // ── 필터링 ──
  const filteredCharacters = characters.filter((char) => {
    if (!selectedCharEmotion && !selectedCharOutfit && !selectedCharAngle) return true;
    // 의상 필터: OutfitEntry + 레퍼런스 태그 모두 검색
    if (selectedCharOutfit) {
      const normalized = normalizeOutfit(selectedCharOutfit);
      const hasOutfitMatch = outfits.filter(o => o.characterId === char.id).some(o => normalizeOutfit(o.label) === normalized);
      const hasRefMatch = char.references.some(ref => {
        const tags = ref.tags as CharacterRefTags;
        return normalizeOutfit(tags.outfit) === normalized;
      });
      if (!hasOutfitMatch && !hasRefMatch) return false;
    }
    if (selectedCharEmotion || selectedCharAngle) {
      const hasTagMatch = char.references.length === 0 || char.references.some((ref) => {
        const tags = ref.tags as CharacterRefTags;
        if (selectedCharEmotion && tags.emotion !== selectedCharEmotion) return false;
        if (selectedCharAngle && tags.angle !== selectedCharAngle) return false;
        return true;
      });
      if (!hasTagMatch) return false;
    }
    return true;
  });

  const filteredLocations = locations.filter((loc) => {
    if (!selectedLocTimeOfDay && !selectedLocWeather && !selectedLocMood) return true;
    return loc.references.some((ref) => {
      const tags = ref.tags as LocationRefTags;
      if (selectedLocTimeOfDay && tags.timeOfDay !== selectedLocTimeOfDay) return false;
      if (selectedLocWeather && tags.weather !== selectedLocWeather) return false;
      if (selectedLocMood && tags.mood !== selectedLocMood) return false;
      return true;
    });
  });

  // 프로젝트가 선택되지 않은 경우
  if (!resolvedProjectId) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.header, textAlign: "center" as const, padding: "60px 20px" }}>
          <h1 style={styles.title}>레퍼런스 라이브러리</h1>
          <p style={{ color: "#666", fontSize: "15px", marginBottom: "20px" }}>
            레퍼런스는 프로젝트 단위로 관리됩니다.<br />
            프로젝트를 먼저 선택한 뒤 레퍼런스 페이지로 이동해주세요.
          </p>
          <button onClick={() => navigate("/")} style={{ ...styles.submitBtn, padding: "12px 32px", fontSize: "15px" }}>
            프로젝트 목록으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
          <h1 style={{ ...styles.title, margin: 0 }}>레퍼런스 라이브러리</h1>
          <span style={styles.projectBadge}>{resolvedProjectId}</span>
          {loading && <span style={{ color: "#999", fontSize: "13px" }}>로딩 중...</span>}
        </div>
        <div style={styles.tabNav}>
          <button onClick={() => setActiveTab("characters")} style={styles.tabButton(activeTab === "characters")}>
            캐릭터 ({characters.length})
          </button>
          <button onClick={() => setActiveTab("locations")} style={styles.tabButton(activeTab === "locations")}>
            장소 ({locations.length})
          </button>
          <button onClick={() => setActiveTab("outfits")} style={styles.tabButton(activeTab === "outfits")}>
            의상 라이브러리 ({outfits.length})
          </button>
        </div>
      </div>

      {/* ── AI 레퍼런스 생성 설정 바 (모델 + 스타일 한 줄) ── */}
      <div style={styles.aiBar}>
        <label style={styles.aiBarLabel}>모델</label>
        <select value={selectedModel} onChange={e => handleModelChange(e.target.value)} style={styles.aiBarSelect}>
          {KIE_IMAGE_MODELS.filter(m => m.mode === "text2img").map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <label style={styles.aiBarLabel}>스타일</label>
        <select value={artStyleKey} onChange={e => setArtStyleKey(e.target.value)} style={styles.aiBarSelect}>
          {ART_STYLE_KEYS.map(key => <option key={key} value={key}>{ART_STYLES[key].name}</option>)}
        </select>
        <span style={{ fontSize: "12px", color: kieReady ? "#059669" : "#d97706", fontWeight: 500, whiteSpace: "nowrap" }}>
          {kieReady ? "✓ Kie.ai" : "⚠️ API 키 필요"}
        </span>
      </div>

      {/* ── 카테고리별 레퍼런스 일괄 생성 패널 ── */}
      {kieReady && (() => {
        const missingChars = characters.filter(c => c.references.length === 0);
        const missingLocs = locations.filter(l => l.references.length === 0);
        const missingOutfits = outfits.filter(o => o.references.length === 0);
        const totalMissing = missingChars.length + missingLocs.length + missingOutfits.length;
        const hasBulkActivity = Object.keys(bulkGenProgress).length > 0;
        if (totalMissing === 0 && !hasBulkActivity) return null;
        const text2imgModels = KIE_IMAGE_MODELS.filter(m => m.mode === "text2img");
        const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" };
        const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151", minWidth: 130, flexShrink: 0 };
        const modelSelectStyle: React.CSSProperties = { fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid #DDD6FE", background: "white", color: "#374151", flex: 1, minWidth: 120, maxWidth: 220 };
        const genBtnStyle = (active: boolean): React.CSSProperties => ({
          padding: "6px 14px", background: active ? "#9CA3AF" : "#7C3AED", color: "white",
          border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12,
          cursor: active ? "not-allowed" : "pointer", flexShrink: 0, whiteSpace: "nowrap",
        });
        return (
          <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#5B21B6", fontSize: 14, marginBottom: 10 }}>🚀 카테고리별 레퍼런스 생성</div>

            {/* 캐릭터 행 */}
            <div style={rowStyle}>
              <span style={labelStyle}>👤 캐릭터 {missingChars.length}명 미생성</span>
              <select value={charModel} onChange={e => handleCharModelChange(e.target.value)} style={modelSelectStyle}>
                {text2imgModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {missingChars.length > 0 ? (
                <button onClick={handleBulkGenerateChars} disabled={isBulkGenChar || isBulkGenLoc || isBulkGenOutfit} style={genBtnStyle(isBulkGenChar)}>
                  {isBulkGenChar ? "⏳ 생성 중..." : `✨ 생성 (${missingChars.length}개)`}
                </button>
              ) : <span style={{ fontSize: 12, color: "#10B981" }}>✓ 완료</span>}
            </div>

            {/* 장소 행 */}
            <div style={rowStyle}>
              <span style={labelStyle}>📍 장소 {missingLocs.length}개 미생성</span>
              <select value={locModel} onChange={e => handleLocModelChange(e.target.value)} style={modelSelectStyle}>
                {text2imgModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {missingLocs.length > 0 ? (
                <button onClick={handleBulkGenerateLocs} disabled={isBulkGenChar || isBulkGenLoc || isBulkGenOutfit} style={genBtnStyle(isBulkGenLoc)}>
                  {isBulkGenLoc ? "⏳ 생성 중..." : `✨ 생성 (${missingLocs.length}개)`}
                </button>
              ) : <span style={{ fontSize: 12, color: "#10B981" }}>✓ 완료</span>}
            </div>

            {/* 의상 행 */}
            <div style={{ ...rowStyle, marginBottom: 0 }}>
              <span style={labelStyle}>👗 의상 {missingOutfits.length}개 미생성</span>
              <select value={outfitModel} onChange={e => handleOutfitModelChange(e.target.value)} style={modelSelectStyle}>
                {text2imgModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {missingOutfits.length > 0 ? (
                <button onClick={handleBulkGenerateOutfits} disabled={isBulkGenChar || isBulkGenLoc || isBulkGenOutfit} style={genBtnStyle(isBulkGenOutfit)}>
                  {isBulkGenOutfit ? "⏳ 생성 중..." : `✨ 생성 (${missingOutfits.length}개)`}
                </button>
              ) : <span style={{ fontSize: 12, color: "#10B981" }}>✓ 완료</span>}
            </div>

            {/* 진행 상황 */}
            {hasBulkActivity && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {characters.filter(c => bulkGenProgress[`char_${c.id}`]).map(c => {
                  const key = `char_${c.id}`;
                  const prog = bulkGenProgress[key];
                  const imgUrl = bulkGenImages[key] || c.references[0]?.storageUrl;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {imgUrl ? (
                        <img src={imgUrl} style={{ width: 38, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid #DDD6FE", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 38, height: 52, background: "#EDE9FE", borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>👤 {c.name}</div>
                        <div style={{ fontSize: 11, color: prog?.startsWith("✓") ? "#10B981" : prog?.startsWith("❌") ? "#EF4444" : "#7C3AED" }}>{prog}</div>
                      </div>
                    </div>
                  );
                })}
                {locations.filter(l => bulkGenProgress[`loc_${l.id}`]).map(l => {
                  const key = `loc_${l.id}`;
                  const prog = bulkGenProgress[key];
                  const imgUrl = bulkGenImages[key] || l.references[0]?.storageUrl;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {imgUrl ? (
                        <img src={imgUrl} style={{ width: 38, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid #DDD6FE", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 38, height: 52, background: "#EDE9FE", borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>📍 {l.name}</div>
                        <div style={{ fontSize: 11, color: prog?.startsWith("✓") ? "#10B981" : prog?.startsWith("❌") ? "#EF4444" : "#7C3AED" }}>{prog}</div>
                      </div>
                    </div>
                  );
                })}
                {outfits.filter(o => bulkGenProgress[`outfit_${o.id}`]).map(o => {
                  const key = `outfit_${o.id}`;
                  const prog = bulkGenProgress[key];
                  const imgUrl = bulkGenImages[key] || o.references[0]?.storageUrl;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {imgUrl ? (
                        <img src={imgUrl} style={{ width: 38, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid #DDD6FE", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 38, height: 52, background: "#EDE9FE", borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>👗 {o.characterName} · {o.label}</div>
                        <div style={{ fontSize: 11, color: prog?.startsWith("✓") ? "#10B981" : prog?.startsWith("❌") ? "#EF4444" : "#7C3AED" }}>{prog}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {bulkGenError && <div style={{ marginTop: 8, fontSize: 12, color: "#EF4444" }}>❌ {bulkGenError}</div>}
          </div>
        );
      })()}

      {/* ═══════ 캐릭터 탭 ═══════ */}
      {activeTab === "characters" && (
        <div style={styles.tabContent}>
          <div style={styles.controls}>
            <div style={styles.filterGroup}>
              <select value={selectedCharEmotion || ""} onChange={(e) => setSelectedCharEmotion(e.target.value || null)} style={styles.filterSelect}>
                <option value="">모든 표정</option>
                {CHARACTER_TAG_OPTIONS.emotion.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <select value={selectedCharOutfit || ""} onChange={(e) => setSelectedCharOutfit(e.target.value || null)} style={styles.filterSelect}>
                <option value="">모든 의상</option>
                {CHARACTER_TAG_OPTIONS.outfit.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={selectedCharAngle || ""} onChange={(e) => setSelectedCharAngle(e.target.value || null)} style={styles.filterSelect}>
                <option value="">모든 각도</option>
                {CHARACTER_TAG_OPTIONS.angle.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <button onClick={() => setShowNewCharacterForm(true)} style={styles.newBtn}>+ 새 캐릭터</button>
          </div>

          <div style={styles.refGrid}>
            {filteredCharacters.map((char) => {
              const charOutfits = outfits.filter(o => o.characterId === char.id);
              const gKey = `char_${char.id}`;
              const isGen = generatingRefId === gKey;

              return (
                <div key={char.id} style={styles.characterCard}>
                  {/* ── 캐릭터 헤더 ── */}
                  <div style={styles.charCardHeader}>
                    <div>
                      <h3 style={styles.characterName}>{char.name}</h3>
                      {char.description && <p style={styles.characterDesc}>{char.description}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button onClick={() => openTraitsEditor(char)} style={styles.traitsToggleBtn}>
                        {traitsEditingCharId === char.id ? "특성 접기" : "특성 편집"}
                      </button>
                      <div style={styles.charRefCount}>
                        {char.references.length} refs
                      </div>
                      <button onClick={() => handleDeleteCharacter(char.id, char.name)} style={styles.deleteBtn} title="캐릭터 삭제">✕</button>
                    </div>
                  </div>

                  {/* ── characterCore 미리보기 (편집 모드 아닐 때) ── */}
                  {traitsEditingCharId !== char.id && char.characterCore && (
                    <div style={{ fontSize: "10px", color: "#6b7280", padding: "2px 0 4px", lineHeight: 1.4, borderBottom: "1px solid #1f2937" }}>
                      <span style={{ color: "#f59e0b", marginRight: "4px" }}>외형:</span>
                      {char.characterCore.length > 80 ? char.characterCore.slice(0, 80) + "…" : char.characterCore}
                    </div>
                  )}

                  {/* ── 캐릭터 특성 요약 (편집 모드 아닐 때) ── */}
                  {traitsEditingCharId !== char.id && char.traits && Object.values(char.traits).some(Boolean) && (
                    <div style={styles.traitsSummary}>
                      {[
                        char.traits.gender, char.traits.age,
                        char.traits.hairColor && char.traits.hairStyle ? `${char.traits.hairColor} ${char.traits.hairStyle} hair` : char.traits.hairColor ? `${char.traits.hairColor} hair` : char.traits.hairStyle ? `${char.traits.hairStyle} hair` : null,
                        char.traits.eyeColor ? `${char.traits.eyeShape || ""} ${char.traits.eyeColor} eyes`.trim() : null,
                        char.traits.skinTone ? `${char.traits.skinTone} skin` : null,
                        char.traits.bodyType, char.traits.height,
                        char.traits.distinctFeatures,
                      ].filter(Boolean).map((t, i) => (
                        <span key={i} style={styles.traitTag}>{t}</span>
                      ))}
                    </div>
                  )}

                  {/* ── 캐릭터 특성 편집 패널 ── */}
                  {traitsEditingCharId === char.id && (
                    <div style={styles.traitsPanel}>
                      <div style={styles.traitsGrid}>
                        {([
                          ["gender", "성별"], ["age", "나이대"], ["hairColor", "머리색"], ["hairStyle", "헤어스타일"],
                          ["eyeColor", "눈 색"], ["eyeShape", "눈 모양"], ["skinTone", "피부색"],
                          ["bodyType", "체형"], ["faceShape", "얼굴형"],
                        ] as [keyof typeof TRAIT_OPTIONS, string][]).map(([field, label]) => (
                          <div key={field} style={styles.traitField}>
                            <label style={styles.traitLabel}>{label}</label>
                            <select
                              value={(traitsForm as any)[field] || ""}
                              onChange={e => setTraitsForm(prev => ({ ...prev, [field]: e.target.value || undefined }))}
                              style={styles.traitSelect}
                            >
                              <option value="">미지정</option>
                              {TRAIT_OPTIONS[field].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        ))}
                        {/* 키: 구체적 수치 입력 */}
                        <div style={styles.traitField}>
                          <label style={styles.traitLabel}>키</label>
                          <input
                            type="text"
                            placeholder="예: 175cm, 160cm, tall"
                            value={traitsForm.height || ""}
                            onChange={e => setTraitsForm(prev => ({ ...prev, height: e.target.value || undefined }))}
                            style={styles.traitInput}
                          />
                        </div>
                      </div>
                      <div style={styles.traitField}>
                        <label style={styles.traitLabel}>고유 특징 (자유 입력)</label>
                        <input
                          type="text"
                          placeholder="예: scar on left cheek, round glasses, mole under right eye"
                          value={traitsForm.distinctFeatures || ""}
                          onChange={e => setTraitsForm(prev => ({ ...prev, distinctFeatures: e.target.value || undefined }))}
                          style={styles.traitInput}
                        />
                      </div>
                      <div style={styles.traitField}>
                        <label style={styles.traitLabel}>성격 (표정 기본값)</label>
                        <input
                          type="text"
                          placeholder="예: cheerful, cold, shy, tsundere"
                          value={traitsForm.personality || ""}
                          onChange={e => setTraitsForm(prev => ({ ...prev, personality: e.target.value || undefined }))}
                          style={styles.traitInput}
                        />
                      </div>
                      {/* ── 기준 외형 텍스트 (characterCore) ── */}
                      <div style={{ marginTop: "12px", borderTop: "1px solid #374151", paddingTop: "10px" }}>
                        <label style={{ ...styles.traitLabel, display: "block", marginBottom: "4px", color: "#f59e0b" }}>
                          기준 외형 프롬프트 (의상 제외)
                        </label>
                        <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "6px" }}>
                          AI가 추출한 외형 텍스트입니다. 직접 수정하면 의상 생성 시 이 내용이 기준으로 사용됩니다.
                        </div>
                        <textarea
                          value={characterCoreForm}
                          onChange={e => setCharacterCoreForm(e.target.value)}
                          placeholder="예: 20s female, long black straight hair with bangs, dark brown almond eyes, fair skin, slim build, oval face, small mole under left eye"
                          style={{
                            width: "100%", boxSizing: "border-box",
                            background: "#1f2937", border: "1px solid #374151", borderRadius: "4px",
                            color: "#e5e7eb", fontSize: "11px", padding: "6px 8px",
                            minHeight: "70px", resize: "vertical", fontFamily: "monospace",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                        <button onClick={() => saveTraits(char.id)} style={styles.traitSaveBtn}>특성 저장</button>
                        <button onClick={() => setTraitsEditingCharId(null)} style={styles.traitCancelBtn}>취소</button>
                      </div>
                    </div>
                  )}

                  {/* ── 의상 섹션 (OutfitEntry 기반) ── */}
                  <div style={styles.outfitSection}>
                    <div style={styles.outfitHeader}>
                      <span style={styles.outfitLabel}>
                        의상 ({charOutfits.length})
                      </span>
                      <button onClick={() => openOutfitLibAdd(char.id)} style={styles.outfitAddBtn}>+ 추가</button>
                    </div>

                    {charOutfits.length > 0 ? (
                      // ── OutfitEntry 기반 UI (신규) ──
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {charOutfits.map(outfit => {
                          const refImg = outfit.references?.[0];
                          const oKey = `outfit_${outfit.id}`;
                          const prog = bulkGenProgress[oKey];
                          const isGenning = !!prog && !prog.startsWith("✓") && !prog.startsWith("❌");
                          return (
                            <div key={outfit.id} style={{
                              border: "1px solid #2d3748", borderRadius: "8px",
                              background: "#111827", overflow: "hidden",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px" }}>
                                {/* 썸네일 */}
                                <div
                                  onClick={() => refImg && setLightbox({ url: refImg.storageUrl, title: `${char.name} — ${outfit.label}` })}
                                  style={{
                                    width: "48px", height: "48px", borderRadius: "6px", flexShrink: 0,
                                    background: refImg ? "transparent" : "#1f2937",
                                    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                                    cursor: refImg ? "pointer" : "default", border: "1px solid #374151",
                                  }}>
                                  {refImg
                                    ? <img src={refImg.storageUrl} alt={outfit.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    : <span style={{ fontSize: "20px" }}>👗</span>
                                  }
                                </div>
                                {/* 정보 */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                                    {outfit.label}
                                    {outfit.isDefault && <span style={{ fontSize: "9px", background: "#065f46", color: "#6ee7b7", padding: "1px 4px", borderRadius: "3px" }}>기본</span>}
                                    {outfit.references.length > 1 && <span style={{ fontSize: "9px", color: "#6b7280" }}>+{outfit.references.length - 1}장</span>}
                                  </div>
                                  {outfit.description && (
                                    <div style={{ fontSize: "10px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                                      {outfit.description}
                                    </div>
                                  )}
                                  {prog && (
                                    <div style={{ fontSize: "10px", color: prog.startsWith("✓") ? "#10b981" : prog.startsWith("❌") ? "#ef4444" : "#9ca3af" }}>
                                      {prog}
                                    </div>
                                  )}
                                </div>
                                {/* 생성 버튼 */}
                                <button
                                  onClick={() => handleGenerateSingleOutfit(outfit, char)}
                                  disabled={isGenning || !kieReady}
                                  style={{
                                    flexShrink: 0, fontSize: "10px", padding: "4px 8px", borderRadius: "5px",
                                    border: "none", cursor: isGenning || !kieReady ? "not-allowed" : "pointer",
                                    background: refImg ? "#374151" : "#2563eb", color: "#fff",
                                    opacity: isGenning || !kieReady ? 0.5 : 1,
                                  }}
                                >
                                  {isGenning ? "생성중…" : refImg ? "재생성" : "생성"}
                                </button>
                              </div>
                              {/* 추가 이미지 행 */}
                              {outfit.references.length > 1 && (
                                <div style={{ display: "flex", gap: "4px", padding: "0 10px 8px", overflowX: "auto" }}>
                                  {outfit.references.slice(1).map(ref => (
                                    <div key={ref.id}
                                      onClick={() => setLightbox({ url: ref.storageUrl, title: `${char.name} — ${outfit.label}` })}
                                      style={{ width: "38px", height: "38px", flexShrink: 0, borderRadius: "4px", overflow: "hidden", cursor: "pointer", border: "1px solid #374151" }}>
                                      <img src={ref.storageUrl} alt={outfit.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={styles.outfitEmpty}>
                        등록된 의상이 없습니다
                        <button onClick={() => openOutfitLibAdd(char.id)} style={styles.outfitEmptyBtn}>의상 추가하기</button>
                      </div>
                    )}
                  </div>

                  {/* ── 레퍼런스 이미지 ── */}
                  <div style={styles.refSection}>
                    <div style={styles.refSectionHeader}>
                      <span style={styles.outfitLabel}>레퍼런스 이미지</span>
                    </div>

                    {char.references.length > 0 ? (
                      <div style={styles.referenceGrid}>
                        {/* 기준 외형 이미지를 맨 앞에 */}
                        {[...char.references].sort((a, b) =>
                          a.id === char.baseRefImageId ? -1 : b.id === char.baseRefImageId ? 1 : 0
                        ).map((ref: ReferenceImage) => {
                          const tags = ref.tags as CharacterRefTags;
                          const isBase = ref.id === char.baseRefImageId;
                          return (
                            <div key={ref.id} style={{
                              ...styles.refImage, cursor: "pointer", position: "relative",
                              outline: isBase ? "2px solid #f59e0b" : "none",
                              boxShadow: isBase ? "0 0 0 2px rgba(245,158,11,0.3)" : "none",
                            }}
                              onClick={() => setLightbox({ url: ref.storageUrl, title: `${char.name} 레퍼런스` })}>
                              <img src={ref.storageUrl} alt={char.name} style={styles.refImageEl} />
                              {/* 기준 외형 배지 */}
                              {isBase && (
                                <div style={{
                                  position: "absolute", top: "2px", left: "2px",
                                  background: "#f59e0b", color: "#000", fontSize: "9px",
                                  fontWeight: 700, padding: "1px 4px", borderRadius: "3px",
                                  pointerEvents: "none",
                                }}>기준</div>
                              )}
                              {/* 핀 버튼 */}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSetBaseRef(char.id, ref.id); }}
                                style={{
                                  position: "absolute", top: "2px", right: "22px",
                                  background: isBase ? "#f59e0b" : "rgba(0,0,0,0.55)",
                                  border: "none", borderRadius: "3px", cursor: "pointer",
                                  color: isBase ? "#000" : "#e5e7eb", fontSize: "11px",
                                  padding: "1px 4px", lineHeight: 1,
                                }}
                                title={isBase ? "기준 외형 해제" : "기준 외형으로 지정"}
                              >📌</button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteCharRef(char.id, ref.id); }}
                                style={styles.refImageDeleteBtn}
                                title="이미지 삭제"
                              >✕</button>
                              {tags.outfit && tags.outfit !== "default" && (
                                <div style={styles.refOutfitTag}>{tags.outfit}</div>
                              )}
                              <div style={styles.refTagBar}>
                                <span style={styles.refTagItem}>{tags.emotion || "neutral"}</span>
                                <span style={styles.refTagItem}>{tags.angle || "front"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={styles.emptyRefBox}>
                        <div style={styles.emptyRefIcon}>🎨</div>
                        <div style={styles.emptyRefText}>아직 레퍼런스 이미지가 없습니다</div>
                        <div style={styles.emptyRefHint}>AI로 캐릭터 레퍼런스 시트를 생성해보세요</div>
                      </div>
                    )}

                    {/* AI 생성 + 업로드 영역 */}
                    <div style={styles.refGenArea}>
                      <button
                        onClick={() => openPromptPopup(char)}
                        disabled={isGen || generatingRefId !== null || !kieReady}
                        style={{
                          ...styles.refGenAreaBtn,
                          opacity: isGen || generatingRefId !== null || !kieReady ? 0.5 : 1,
                        }}
                      >
                        {isGen ? "생성 중..." : "AI 레퍼런스 생성"}
                      </button>
                      {/* 이미지 업로드 → 기준 외형 지정 */}
                      <label style={{
                        ...styles.refGenAreaBtn,
                        background: "#1f2937", border: "1px solid #374151",
                        color: "#9ca3af", cursor: "pointer", display: "inline-block",
                        textAlign: "center", lineHeight: "28px",
                      }} title="이미지 업로드 후 기준 외형으로 자동 지정">
                        📁 업로드·기준 설정
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadBaseRef(char.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {refGenProgress[gKey] && (
                        <span style={styles.refGenAreaProgress}>{refGenProgress[gKey]}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ 장소 탭 ═══════ */}
      {activeTab === "locations" && (
        <div style={styles.tabContent}>
          <div style={styles.controls}>
            <div style={styles.filterGroup}>
              <select value={selectedLocTimeOfDay || ""} onChange={(e) => setSelectedLocTimeOfDay(e.target.value || null)} style={styles.filterSelect}>
                <option value="">모든 시간대</option>
                {LOCATION_TAG_OPTIONS.timeOfDay.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={selectedLocWeather || ""} onChange={(e) => setSelectedLocWeather(e.target.value || null)} style={styles.filterSelect}>
                <option value="">모든 날씨</option>
                {LOCATION_TAG_OPTIONS.weather.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <select value={selectedLocMood || ""} onChange={(e) => setSelectedLocMood(e.target.value || null)} style={styles.filterSelect}>
                <option value="">모든 분위기</option>
                {LOCATION_TAG_OPTIONS.mood.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={() => setShowNewLocationForm(true)} style={styles.newBtn}>+ 새 장소</button>
          </div>

          <div style={styles.refGrid}>
            {filteredLocations.map((loc) => (
              <div key={loc.id} style={styles.locationCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={styles.locationName}>{loc.name}</h3>
                    {loc.description && <p style={styles.locationDesc}>{loc.description}</p>}
                  </div>
                  <button onClick={() => handleDeleteLocation(loc.id, loc.name)} style={styles.deleteBtn} title="장소 삭제">✕</button>
                </div>
                <div style={styles.referenceGrid}>
                  {loc.references.map((ref: ReferenceImage) => (
                    <div key={ref.id} style={{ ...styles.refImage, cursor: "pointer", position: "relative" }}
                      onClick={() => setLightbox({ url: ref.storageUrl, title: `${loc.name} 레퍼런스` })}>
                      <img src={ref.storageUrl} alt={loc.name} style={styles.refImageEl} />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteLocRef(loc.id, ref.id); }}
                        style={styles.refImageDeleteBtn}
                        title="이미지 삭제"
                      >✕</button>
                      <div style={{ fontSize: "10px", color: "#f59e0b", position: "absolute", bottom: "2px", left: "4px" }}>{"⭐".repeat(ref.quality)}</div>
                      <div style={{ fontSize: "10px", color: "#6b7280", position: "absolute", bottom: "2px", right: "4px" }}>사용: {ref.usageCount}회</div>
                    </div>
                  ))}
                  {loc.references.length === 0 && <div style={{ color: "#9ca3af", fontSize: "12px", padding: "8px" }}>레퍼런스 없음</div>}
                  {(() => {
                    const gKey = `loc_${loc.id}`;
                    const isGen = generatingRefId === gKey;
                    return (
                      <div style={styles.refGenArea}>
                        <button
                          onClick={() => openLocPromptPopup(loc)}
                          disabled={isGen || generatingRefId !== null || !kieReady}
                          style={{ ...styles.refGenAreaBtn, opacity: isGen || generatingRefId !== null || !kieReady ? 0.6 : 1 }}
                        >
                          {isGen ? "생성 중..." : "+ AI 레퍼런스 생성"}
                        </button>
                        {refGenProgress[gKey] && <span style={styles.refGenAreaProgress}>{refGenProgress[gKey]}</span>}
                      </div>
                    );
                  })()}
                </div>
                <div style={styles.tags}>
                  {loc.references.map((ref: ReferenceImage) => {
                    const tags = ref.tags as LocationRefTags;
                    return (
                      <div key={ref.id} style={styles.tagRow}>
                        <span style={styles.tag}>{tags.timeOfDay}</span>
                        {tags.weather && <span style={styles.tag}>{tags.weather}</span>}
                        {tags.mood && <span style={styles.tag}>{tags.mood}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ 의상 라이브러리 탭 ═══════ */}
      {activeTab === "outfits" && (
        <div style={styles.tabContent}>
          <div style={styles.controls}>
            <div style={styles.filterGroup}>
              <select
                value={outfitLibFilter}
                onChange={(e) => setOutfitLibFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">모든 캐릭터</option>
                {characters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button onClick={() => openOutfitLibAdd()} style={styles.newBtn}>+ 새 의상</button>
          </div>

          {outfits.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>👗</div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>등록된 의상이 없습니다</div>
              <div style={{ fontSize: "12px", marginTop: "4px" }}>씬 분석 후 자동으로 등록되거나 직접 추가할 수 있습니다</div>
            </div>
          ) : (
            <div style={styles.refGrid}>
              {outfits
                .filter(o => outfitLibFilter === "all" || o.characterId === outfitLibFilter)
                .map((outfit) => (
                  <div key={outfit.id} style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}>
                    {/* 헤더 */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{
                          display: "inline-block", fontSize: "11px", fontWeight: 600,
                          background: "#ede9fe", color: "#6d28d9",
                          borderRadius: "4px", padding: "2px 6px", marginBottom: "4px",
                        }}>{outfit.characterName}</span>
                        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#111" }}>
                          {outfit.label}
                          {outfit.isDefault && (
                            <span style={{ marginLeft: "6px", fontSize: "10px", background: "#dcfce7", color: "#166534", padding: "1px 5px", borderRadius: "4px" }}>기본</span>
                          )}
                        </h3>
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          onClick={() => openOutfitLibEdit(outfit)}
                          style={{ ...styles.deleteBtn, background: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe" }}
                          title="편집"
                        >✎</button>
                        <button
                          onClick={() => { if (confirm(`"${outfit.label}" 의상을 삭제하시겠습니까?`)) removeOutfit(outfit.id); }}
                          style={styles.deleteBtn}
                          title="삭제"
                        >✕</button>
                      </div>
                    </div>

                    {/* 설명 */}
                    {outfit.description && (
                      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", lineHeight: 1.5 }}>{outfit.description}</p>
                    )}

                    {/* 색상 팔레트 */}
                    {outfit.colorPalette && outfit.colorPalette.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {outfit.colorPalette.map((c: string) => (
                          <span key={c} style={{ fontSize: "11px", background: "#f3f4f6", padding: "1px 6px", borderRadius: "10px", color: "#374151" }}>{c}</span>
                        ))}
                      </div>
                    )}

                    {/* 레퍼런스 이미지 */}
                    {outfit.references && outfit.references.length > 0 ? (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {outfit.references.map(ref => (
                          <div key={ref.id}
                            onClick={() => setLightbox({ url: ref.storageUrl, title: `${outfit.characterName} — ${outfit.label}` })}
                            style={{ width: "72px", height: "72px", borderRadius: "6px", overflow: "hidden", cursor: "pointer", border: "1px solid #e5e7eb", flexShrink: 0 }}>
                            <img src={ref.storageUrl} alt={outfit.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "11px", color: "#9ca3af" }}>이미지 없음</span>
                        {(() => {
                          const matchedChar = characters.find(c => c.id === outfit.characterId);
                          const oKey = `outfit_${outfit.id}`;
                          const prog = bulkGenProgress[oKey];
                          const isGenning = !!prog && !prog.startsWith("✓") && !prog.startsWith("❌");
                          return matchedChar ? (
                            <button
                              onClick={() => handleGenerateSingleOutfit(outfit, matchedChar)}
                              disabled={isGenning || !kieReady}
                              style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", border: "none", cursor: "pointer", background: "#2563eb", color: "#fff", opacity: isGenning || !kieReady ? 0.5 : 1 }}
                            >
                              {isGenning ? (prog || "생성중…") : "생성"}
                            </button>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* 사용 횟수 */}
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>사용 {outfit.usageCount}회</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ 의상 라이브러리 추가/편집 모달 ═══════ */}
      {outfitLibModal.open && (
        <div style={styles.modalOverlay} onClick={() => setOutfitLibModal({ open: false, mode: "add" })}>
          <div style={styles.outfitModal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {outfitLibModal.mode === "add" ? "의상 추가" : "의상 편집"}
            </h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>캐릭터 *</label>
              <select
                value={outfitLibForm.characterId}
                onChange={(e) => setOutfitLibForm({ ...outfitLibForm, characterId: e.target.value })}
                style={styles.input}
                disabled={outfitLibModal.mode === "edit"}
              >
                <option value="">선택하세요</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>의상 이름 *</label>
              <input
                type="text"
                placeholder="예: 교복, 검정 정장, 캐주얼 후드티"
                value={outfitLibForm.label}
                onChange={(e) => setOutfitLibForm({ ...outfitLibForm, label: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>의상 설명 (AI 프롬프트용)</label>
              <textarea
                placeholder="상세 의상 설명 (영어 권장). 예: navy school blazer, white collared shirt, plaid skirt, white knee-high socks, black loafers"
                value={outfitLibForm.description}
                onChange={(e) => setOutfitLibForm({ ...outfitLibForm, description: e.target.value })}
                style={styles.textarea}
              />
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>주요 색상 (쉼표 구분)</label>
                <input
                  type="text"
                  placeholder="예: navy, white, red"
                  value={outfitLibForm.colorPalette}
                  onChange={(e) => setOutfitLibForm({ ...outfitLibForm, colorPalette: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>소품 (쉼표 구분)</label>
                <input
                  type="text"
                  placeholder="예: 안경, 가방, 목걸이"
                  value={outfitLibForm.accessories}
                  onChange={(e) => setOutfitLibForm({ ...outfitLibForm, accessories: e.target.value })}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={{ ...styles.formGroup, display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="outfitLibDefault"
                checked={outfitLibForm.isDefault}
                onChange={(e) => setOutfitLibForm({ ...outfitLibForm, isDefault: e.target.checked })}
              />
              <label htmlFor="outfitLibDefault" style={{ fontSize: "13px", color: "#555", cursor: "pointer" }}>
                기본 의상 (씬에서 별도 지정 없을 때 사용)
              </label>
            </div>

            <div style={styles.modalButtons}>
              <button onClick={() => setOutfitLibModal({ open: false, mode: "add" })} style={styles.cancelBtn}>취소</button>
              <button onClick={handleSaveOutfitLib} style={styles.submitBtn}>
                {outfitLibModal.mode === "add" ? "추가" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 새 캐릭터 모달 ═══════ */}
      {showNewCharacterForm && (
        <div style={styles.modalOverlay} onClick={() => setShowNewCharacterForm(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>새 캐릭터 추가</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>캐릭터 이름 *</label>
              <input type="text" placeholder="예: 민지" value={newCharData.name}
                onChange={(e) => setNewCharData({ ...newCharData, name: e.target.value })} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>설명</label>
              <textarea placeholder="캐릭터에 대한 설명" value={newCharData.description}
                onChange={(e) => setNewCharData({ ...newCharData, description: e.target.value })} style={styles.textarea} />
            </div>
            <div style={styles.modalButtons}>
              <button onClick={() => setShowNewCharacterForm(false)} style={styles.cancelBtn}>취소</button>
              <button onClick={handleCreateCharacter} style={styles.submitBtn}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 새 장소 모달 ═══════ */}
      {showNewLocationForm && (
        <div style={styles.modalOverlay} onClick={() => setShowNewLocationForm(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>새 장소 추가</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>장소 이름 *</label>
              <input type="text" placeholder="예: 교실" value={newLocData.name}
                onChange={(e) => setNewLocData({ ...newLocData, name: e.target.value })} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>설명</label>
              <textarea placeholder="장소에 대한 설명" value={newLocData.description}
                onChange={(e) => setNewLocData({ ...newLocData, description: e.target.value })} style={styles.textarea} />
            </div>
            <div style={styles.modalButtons}>
              <button onClick={() => setShowNewLocationForm(false)} style={styles.cancelBtn}>취소</button>
              <button onClick={handleCreateLocation} style={styles.submitBtn}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 이미지 라이트박스 ═══════ */}
      {lightbox && (
        <div style={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <div style={styles.lightboxContainer} onClick={e => e.stopPropagation()}>
            <div style={styles.lightboxTopBar}>
              <span style={styles.lightboxTitle}>{lightbox.title}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => downloadImage(lightbox.url, `${lightbox.title.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}.png`)}
                  style={styles.lightboxDownloadBtn}
                >
                  저장
                </button>
                <button onClick={() => setLightbox(null)} style={styles.lightboxCloseBtn}>✕</button>
              </div>
            </div>
            <div style={styles.lightboxImageWrap}>
              <img src={lightbox.url} alt={lightbox.title} style={styles.lightboxImage} />
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 의상 추가/편집 모달 ═══════ */}
      {outfitModal.open && (
        <div style={styles.modalOverlay} onClick={() => setOutfitModal({ open: false, charId: "", mode: "add" })}>
          <div style={styles.outfitModal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {outfitModal.mode === "add" ? "의상 추가" : "의상 편집"}
              <span style={{ fontSize: "14px", color: "#666", fontWeight: 400, marginLeft: "8px" }}>
                {characters.find(c => c.id === outfitModal.charId)?.name}
              </span>
            </h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>의상 이름 *</label>
              <input type="text" placeholder="예: 교복, 캐주얼, 정장" value={outfitForm.name}
                onChange={(e) => setOutfitForm({ ...outfitForm, name: e.target.value })} style={styles.input} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>의상 설명</label>
              <textarea placeholder="의상의 상세한 설명 (예: 네이비 블레이저에 화이트 셔츠, 체크 스커트)" value={outfitForm.description}
                onChange={(e) => setOutfitForm({ ...outfitForm, description: e.target.value })} style={styles.textarea} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>AI 프롬프트 스니펫</label>
              <textarea placeholder="이미지 생성 시 사용할 의상 프롬프트 (예: wearing navy blazer, white shirt, plaid skirt)"
                value={outfitForm.promptSnippet}
                onChange={(e) => setOutfitForm({ ...outfitForm, promptSnippet: e.target.value })} style={styles.textarea} />
              <span style={styles.hint}>비워두면 "wearing [의상이름]"이 자동 적용됩니다</span>
            </div>

            <div style={styles.formRow}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>소품/액세서리</label>
                <input type="text" placeholder="쉼표로 구분 (예: 안경, 가방, 목걸이)" value={outfitForm.accessories}
                  onChange={(e) => setOutfitForm({ ...outfitForm, accessories: e.target.value })} style={styles.input} />
              </div>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>주요 색상</label>
                <input type="text" placeholder="쉼표로 구분 (예: navy, white, red)" value={outfitForm.colorPalette}
                  onChange={(e) => setOutfitForm({ ...outfitForm, colorPalette: e.target.value })} style={styles.input} />
              </div>
            </div>

            <div style={{ ...styles.formGroup, display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" id="isDefaultOutfit" checked={outfitForm.isDefault}
                onChange={(e) => setOutfitForm({ ...outfitForm, isDefault: e.target.checked })} />
              <label htmlFor="isDefaultOutfit" style={{ fontSize: "13px", color: "#555", cursor: "pointer" }}>
                기본 의상으로 설정 (씬에서 별도 지정 없을 때 사용)
              </label>
            </div>

            <div style={styles.modalButtons}>
              <button onClick={() => setOutfitModal({ open: false, charId: "", mode: "add" })} style={styles.cancelBtn}>취소</button>
              <button onClick={handleSaveOutfit} style={styles.submitBtn}>
                {outfitModal.mode === "add" ? "추가" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 프롬프트 미리보기/편집 팝업 (캐릭터 & 장소 공용) ═══════ */}
      {promptPopup.open && (() => {
        const popupChar = promptPopup.charId ? characters.find(c => c.id === promptPopup.charId) : null;
        const popupLoc = promptPopup.locId ? locations.find(l => l.id === promptPopup.locId) : null;
        const popupName = popupChar?.name || popupLoc?.name || "";
        const isLocMode = !!promptPopup.locId;
        const handleAutoRegen = () => {
          if (popupChar) setPromptPopup(prev => ({ ...prev, prompt: buildPromptForChar(popupChar), isCustom: false }));
          else if (popupLoc) setPromptPopup(prev => ({ ...prev, prompt: buildPromptForLoc(popupLoc), isCustom: false }));
        };
        return (
          <div style={styles.modalOverlay} onClick={() => setPromptPopup(prev => ({ ...prev, open: false }))}>
            <div style={styles.promptModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.promptModalHeader}>
                <h2 style={{ ...styles.modalTitle, margin: 0, fontSize: "18px" }}>
                  프롬프트 미리보기
                  {popupName && <span style={{ fontSize: "14px", color: isLocMode ? "#059669" : "#6366f1", marginLeft: "8px", fontWeight: 400 }}>{popupName}</span>}
                </h2>
                <button onClick={() => setPromptPopup(prev => ({ ...prev, open: false }))} style={styles.promptCloseBtn}>✕</button>
              </div>

              {/* 특성 기반 자동 생성 vs 직접 입력 토글 */}
              <div style={styles.promptModeBar}>
                <button
                  onClick={() => { if (promptPopup.isCustom) handleAutoRegen(); }}
                  style={promptPopup.isCustom ? styles.promptModeBtn : styles.promptModeBtnActive}
                >
                  AI 자동 생성
                </button>
                <button
                  onClick={() => setPromptPopup(prev => ({ ...prev, isCustom: true }))}
                  style={promptPopup.isCustom ? styles.promptModeBtnActive : styles.promptModeBtn}
                >
                  직접 편집
                </button>
                {!promptPopup.isCustom && (popupChar || popupLoc) && (
                  <button
                    onClick={() => {
                      if (popupChar) setPromptPopup(prev => ({ ...prev, prompt: buildPromptForChar(popupChar) }));
                      else if (popupLoc) setPromptPopup(prev => ({ ...prev, prompt: buildPromptForLoc(popupLoc) }));
                    }}
                    style={styles.promptRefreshBtn}
                  >
                    프롬프트 재생성
                  </button>
                )}
              </div>

              {/* 프롬프트 텍스트 */}
              <textarea
                value={promptPopup.prompt}
                onChange={e => setPromptPopup(prev => ({ ...prev, prompt: e.target.value, isCustom: true }))}
                style={styles.promptTextarea}
                readOnly={!promptPopup.isCustom}
                rows={12}
              />

              <div style={styles.promptFooter}>
                <span style={styles.promptCharCount}>{promptPopup.prompt.length}자</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => setPromptPopup(prev => ({ ...prev, open: false }))} style={styles.cancelBtn}>취소</button>
                  <button
                    onClick={generateFromPopup}
                    disabled={!kieReady || !promptPopup.prompt.trim() || generatingRefId !== null}
                    style={{
                      ...styles.promptGenBtn,
                      opacity: !kieReady || !promptPopup.prompt.trim() || generatingRefId !== null ? 0.5 : 1,
                    }}
                  >
                    이미지 생성
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 스타일
// ═══════════════════════════════════════════════════════════════

const styles = {
  container: { padding: "24px", maxWidth: "1400px", margin: "0 auto" } as const,
  header: { marginBottom: "24px" } as const,
  title: { fontSize: "28px", fontWeight: "bold", margin: "0 0 16px 0", color: "#333" } as const,
  projectBadge: {
    padding: "3px 10px", backgroundColor: "#e8f4f8", color: "#0c5460",
    fontSize: "12px", borderRadius: "10px", fontWeight: 500,
  } as const,
  tabNav: { display: "flex", gap: "8px", borderBottom: "1px solid #e0e0e0", paddingBottom: "12px" } as const,
  tabButton: (isActive: boolean) => ({
    padding: "10px 16px", border: "none", backgroundColor: "transparent",
    borderBottom: isActive ? "3px solid #007AFF" : "none",
    color: isActive ? "#007AFF" : "#666", cursor: "pointer", fontSize: "14px", fontWeight: "600",
  } as const),
  tabContent: { padding: "20px 0" } as const,
  controls: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", marginBottom: "20px" } as const,
  filterGroup: { display: "flex", gap: "12px", flex: 1 } as const,
  filterSelect: { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "13px", flex: 1 } as const,
  newBtn: {
    padding: "10px 20px", backgroundColor: "#10B981", color: "white", border: "none",
    borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap" as const,
  } as const,
  refGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" } as const,

  // ── 캐릭터 카드 ──
  characterCard: {
    backgroundColor: "white", border: "1px solid #e0e0e0", borderRadius: "10px",
    padding: "0", overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  } as const,
  charCardHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 16px 10px",
  } as const,
  characterName: { fontSize: "17px", fontWeight: "700", margin: "0 0 4px 0", color: "#1a1a2e" } as const,
  characterDesc: {
    fontSize: "12px", color: "#666", margin: 0, lineHeight: 1.5,
    display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden",
  } as const,
  charRefCount: {
    fontSize: "11px", fontWeight: "600", color: "#6366f1",
    backgroundColor: "#eef2ff", padding: "2px 8px", borderRadius: "10px",
    whiteSpace: "nowrap" as const, flexShrink: 0,
  } as const,

  // ── 의상 섹션 ──
  outfitSection: {
    margin: "0", padding: "10px 16px 12px",
    backgroundColor: "#fafbfc", borderTop: "1px solid #eef0f2",
  } as const,
  outfitHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px",
  } as const,
  outfitLabel: { fontSize: "12px", fontWeight: "700", color: "#444", letterSpacing: "0.02em" } as const,
  outfitAddBtn: {
    fontSize: "11px", padding: "3px 10px", border: "none", borderRadius: "4px",
    backgroundColor: "#6366f1", color: "white", cursor: "pointer", fontWeight: 600,
  } as const,
  outfitEmpty: {
    padding: "12px 0", textAlign: "center" as const, fontSize: "12px", color: "#999",
    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "6px",
  } as const,
  outfitEmptyBtn: {
    fontSize: "11px", padding: "3px 10px", border: "1px dashed #c7d2fe",
    borderRadius: "4px", backgroundColor: "#f5f3ff", color: "#6366f1",
    cursor: "pointer", fontWeight: 600,
  } as const,
  outfitChips: { display: "flex", flexWrap: "wrap" as const, gap: "5px" } as const,
  outfitChip: {
    fontSize: "12px", padding: "4px 10px", backgroundColor: "#f0f0f5", color: "#555",
    borderRadius: "16px", cursor: "pointer", border: "1px solid #e0e0e8",
    display: "inline-flex", alignItems: "center", gap: "4px",
    transition: "all 0.15s",
  } as const,
  outfitChipActive: {
    fontSize: "12px", padding: "4px 10px", backgroundColor: "#eef2ff", color: "#4338ca",
    borderRadius: "16px", cursor: "pointer", border: "2px solid #6366f1", fontWeight: 700,
    display: "inline-flex", alignItems: "center", gap: "4px",
    boxShadow: "0 0 0 2px rgba(99,102,241,0.15)",
  } as const,
  chipCheck: { fontSize: "10px", fontWeight: 800, color: "#4338ca" } as const,
  chipDefault: {
    fontSize: "9px", backgroundColor: "#fef3cd", color: "#856404",
    padding: "0 4px", borderRadius: "3px", marginLeft: "2px",
  } as const,

  // 활성 의상 상세
  activeOutfitDetail: {
    margin: "8px 0 0", padding: "8px 10px", backgroundColor: "#eef2ff",
    border: "1px solid #c7d2fe", borderRadius: "6px", fontSize: "12px",
  } as const,
  activeOutfitRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px",
  } as const,
  activeOutfitName: { fontWeight: 700, color: "#4338ca", fontSize: "13px" } as const,
  activeOutfitDesc: { color: "#555", lineHeight: 1.4, marginBottom: "4px" } as const,
  activeOutfitAccessories: {
    display: "flex", gap: "4px", flexWrap: "wrap" as const, marginTop: "4px",
  } as const,

  outfitExpandBtn: {
    fontSize: "11px", padding: "3px 0", border: "none", backgroundColor: "transparent",
    cursor: "pointer", color: "#6366f1", fontWeight: 600, marginTop: "6px",
    display: "block", width: "100%", textAlign: "left" as const,
  } as const,

  // ── 의상 상세 목록 ──
  outfitDetailList: { display: "flex", flexDirection: "column" as const, gap: "4px", marginTop: "6px" } as const,
  outfitDetailItem: {
    padding: "6px 10px", backgroundColor: "white", border: "1px solid #e8eaed",
    borderRadius: "6px", fontSize: "12px",
  } as const,
  outfitDetailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" } as const,
  outfitDetailName: { fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: "6px" } as const,
  defaultBadge: {
    fontSize: "10px", backgroundColor: "#fef3cd", color: "#856404",
    padding: "0 5px", borderRadius: "3px",
  } as const,
  outfitDetailDesc: { color: "#777", lineHeight: 1.4, fontSize: "11px" } as const,
  accessoryChip: {
    fontSize: "10px", padding: "1px 6px", backgroundColor: "#fff3cd",
    color: "#856404", borderRadius: "3px",
  } as const,
  outfitColors: { display: "flex", gap: "4px", marginTop: "4px" } as const,
  colorDot: {
    width: "14px", height: "14px", borderRadius: "50%", border: "1px solid #ddd",
    display: "inline-block", cursor: "help",
  } as const,
  outfitActionBtn: {
    fontSize: "11px", padding: "2px 8px", border: "1px solid #ddd", borderRadius: "4px",
    backgroundColor: "white", cursor: "pointer", color: "#555",
  } as const,
  outfitDeleteBtn: {
    fontSize: "11px", padding: "2px 8px", border: "1px solid #f5c6cb", borderRadius: "4px",
    backgroundColor: "#fff5f5", cursor: "pointer", color: "#dc3545",
  } as const,
  deleteBtn: {
    fontSize: "14px", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid #e0e0e0", borderRadius: "6px", backgroundColor: "white", cursor: "pointer", color: "#999",
    flexShrink: 0, transition: "all 0.15s",
  } as const,
  refImageDeleteBtn: {
    position: "absolute" as const, top: "4px", right: "4px", width: "22px", height: "22px",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "none", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.55)", cursor: "pointer",
    color: "#fff", fontSize: "11px", lineHeight: 1, padding: 0, zIndex: 2,
    opacity: 0.7, transition: "opacity 0.15s",
  } as const,

  // ── 장소 카드 ──
  locationCard: { backgroundColor: "white", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "16px" } as const,
  locationName: { fontSize: "16px", fontWeight: "700", margin: "0 0 8px 0", color: "#333" } as const,
  locationDesc: {
    fontSize: "12px", color: "#666", margin: "0 0 12px 0",
    display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden",
  } as const,

  // ── 레퍼런스 이미지 섹션 ──
  refSection: {
    padding: "12px 16px 16px", borderTop: "1px solid #eef0f2",
  } as const,
  refSectionHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px",
  } as const,
  referenceGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "8px" } as const,
  refImage: {
    position: "relative" as const, borderRadius: "6px", overflow: "hidden",
    aspectRatio: "3/4", backgroundColor: "#f0f0f5",
    transition: "transform 0.15s, box-shadow 0.15s",
  } as const,
  refImageEl: { width: "100%", height: "100%", objectFit: "cover" as const },
  refOutfitTag: {
    position: "absolute" as const, top: "4px", left: "4px",
    backgroundColor: "rgba(99,102,241,0.85)", color: "white",
    padding: "1px 6px", borderRadius: "3px", fontSize: "9px", fontWeight: 700,
  } as const,
  refTagBar: {
    position: "absolute" as const, bottom: 0, left: 0, right: 0,
    display: "flex", gap: "3px", padding: "3px 4px",
    background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
  } as const,
  refTagItem: {
    fontSize: "9px", padding: "1px 5px", backgroundColor: "rgba(255,255,255,0.85)",
    color: "#333", borderRadius: "2px", fontWeight: 500,
  } as const,
  emptyRefBox: {
    padding: "24px 16px", textAlign: "center" as const, borderRadius: "8px",
    border: "2px dashed #e0e0e8", backgroundColor: "#fafbfc",
  } as const,
  emptyRefIcon: { fontSize: "28px", marginBottom: "6px" } as const,
  emptyRefText: { fontSize: "13px", color: "#555", fontWeight: 600 } as const,
  emptyRefHint: { fontSize: "11px", color: "#999", marginTop: "4px" } as const,

  // AI 생성 영역
  refGenArea: {
    display: "flex", alignItems: "center", gap: "10px",
  } as const,
  refGenAreaBtn: {
    padding: "7px 16px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white", border: "none", borderRadius: "6px", cursor: "pointer",
    fontSize: "12px", fontWeight: "600", boxShadow: "0 1px 4px rgba(99,102,241,0.25)",
  } as const,
  refGenAreaProgress: { fontSize: "11px", color: "#6366f1", fontWeight: 500 } as const,

  // 태그 (호환용 — 이제 refTagBar에 통합됨)
  tags: { display: "none" } as const,
  tagRow: { display: "none" } as const,
  tag: { display: "none" } as const,

  // ── 폼 & 모달 ──
  formGroup: { marginBottom: "16px" } as const,
  formRow: { display: "flex", gap: "16px", marginBottom: "16px" } as const,
  label: { display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px", color: "#333" } as const,
  hint: { display: "block", fontSize: "11px", color: "#999", marginTop: "4px" } as const,
  input: {
    width: "100%", padding: "10px 12px", border: "1px solid #ddd",
    borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" as const,
  } as const,
  textarea: {
    width: "100%", padding: "10px 12px", border: "1px solid #ddd",
    borderRadius: "6px", fontSize: "14px", minHeight: "70px", fontFamily: "inherit", boxSizing: "border-box" as const,
  } as const,
  modalOverlay: {
    position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    backgroundColor: "white", borderRadius: "12px", padding: "32px",
    maxWidth: "500px", width: "90%", boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
  } as const,
  outfitModal: {
    backgroundColor: "white", borderRadius: "12px", padding: "32px",
    maxWidth: "600px", width: "90%", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" as const,
  } as const,
  modalTitle: {
    fontSize: "20px", fontWeight: "600", marginBottom: "20px", color: "#333", margin: "0 0 20px 0",
  } as const,
  modalButtons: { display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" } as const,
  cancelBtn: {
    padding: "10px 24px", border: "1px solid #ddd", backgroundColor: "white",
    borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600", color: "#333",
  } as const,
  submitBtn: {
    padding: "10px 24px", backgroundColor: "#007AFF", color: "white", border: "none",
    borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600",
  } as const,

  // ── 캐릭터 특성 ──
  traitsToggleBtn: {
    fontSize: "11px", padding: "3px 10px", border: "1px solid #c7d2fe", borderRadius: "4px",
    backgroundColor: "#f5f3ff", color: "#6366f1", cursor: "pointer", fontWeight: 600,
    whiteSpace: "nowrap" as const,
  } as const,
  traitsSummary: {
    display: "flex", flexWrap: "wrap" as const, gap: "4px",
    padding: "6px 16px 10px", lineHeight: 1,
  } as const,
  traitTag: {
    fontSize: "11px", padding: "2px 8px", backgroundColor: "#f0fdf4", color: "#166534",
    borderRadius: "10px", border: "1px solid #bbf7d0", whiteSpace: "nowrap" as const,
  } as const,
  traitsPanel: {
    padding: "12px 16px", backgroundColor: "#fefce8", borderTop: "1px solid #fde68a",
    borderBottom: "1px solid #fde68a",
  } as const,
  traitsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px",
    marginBottom: "8px",
  } as const,
  traitField: { marginBottom: "6px" } as const,
  traitLabel: { display: "block", fontSize: "11px", fontWeight: "600", color: "#92400e", marginBottom: "3px" } as const,
  traitSelect: {
    width: "100%", padding: "5px 8px", border: "1px solid #fde68a", borderRadius: "5px",
    fontSize: "12px", background: "white", color: "#1e1b4b", boxSizing: "border-box" as const,
  } as const,
  traitInput: {
    width: "100%", padding: "5px 8px", border: "1px solid #fde68a", borderRadius: "5px",
    fontSize: "12px", background: "white", color: "#1e1b4b", boxSizing: "border-box" as const,
  } as const,
  traitSaveBtn: {
    padding: "5px 14px", background: "#f59e0b", color: "white", border: "none",
    borderRadius: "5px", cursor: "pointer", fontSize: "12px", fontWeight: 600,
  } as const,
  traitCancelBtn: {
    padding: "5px 14px", background: "white", color: "#555", border: "1px solid #ddd",
    borderRadius: "5px", cursor: "pointer", fontSize: "12px", fontWeight: 600,
  } as const,

  // ── 프롬프트 팝업 ──
  promptModal: {
    backgroundColor: "white", borderRadius: "14px", padding: "0",
    maxWidth: "700px", width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" as const,
  } as const,
  promptModalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 24px", borderBottom: "1px solid #e5e7eb",
  } as const,
  promptCloseBtn: {
    width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", color: "#999", border: "1px solid #e5e7eb", borderRadius: "6px",
    cursor: "pointer", fontSize: "16px",
  } as const,
  promptModeBar: {
    display: "flex", alignItems: "center", gap: "6px",
    padding: "12px 24px", backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb",
  } as const,
  promptModeBtn: {
    padding: "5px 14px", fontSize: "12px", fontWeight: 600, border: "1px solid #d1d5db",
    borderRadius: "6px", backgroundColor: "white", color: "#555", cursor: "pointer",
  } as const,
  promptModeBtnActive: {
    padding: "5px 14px", fontSize: "12px", fontWeight: 600, border: "1px solid #6366f1",
    borderRadius: "6px", backgroundColor: "#eef2ff", color: "#4338ca", cursor: "pointer",
  } as const,
  promptRefreshBtn: {
    padding: "5px 12px", fontSize: "11px", fontWeight: 600, border: "1px solid #d1d5db",
    borderRadius: "6px", backgroundColor: "white", color: "#059669", cursor: "pointer",
    marginLeft: "auto",
  } as const,
  promptTextarea: {
    width: "100%", padding: "16px 24px", border: "none", fontSize: "13px",
    fontFamily: "monospace", lineHeight: 1.6, color: "#1e1b4b", boxSizing: "border-box" as const,
    resize: "vertical" as const, outline: "none", flex: 1, minHeight: "200px",
  } as const,
  promptFooter: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 24px", borderTop: "1px solid #e5e7eb", backgroundColor: "#f9fafb",
  } as const,
  promptCharCount: { fontSize: "12px", color: "#999" } as const,
  promptGenBtn: {
    padding: "10px 28px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white", border: "none", borderRadius: "8px", cursor: "pointer",
    fontSize: "14px", fontWeight: "600", boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
  } as const,

  // ── AI 생성 바 (모델 + 스타일 한 줄) ──
  aiBar: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" as const,
    padding: "10px 14px", marginBottom: "16px",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    border: "1px solid #c7d2fe", borderRadius: "10px",
  } as const,
  aiBarLabel: { fontSize: "12px", fontWeight: "600", color: "#4338ca", whiteSpace: "nowrap" as const } as const,
  aiBarSelect: {
    padding: "6px 10px", border: "1px solid #c7d2fe", borderRadius: "6px",
    fontSize: "12px", background: "white", color: "#1e1b4b", maxWidth: "220px", flex: 1,
  } as const,

  // (refGenCell은 refGenArea로 대체됨)

  // ── 라이트박스 ──
  lightboxOverlay: {
    position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.85)", display: "flex",
    alignItems: "center", justifyContent: "center",
    zIndex: 2000, cursor: "zoom-out",
  } as const,
  lightboxContainer: {
    display: "flex", flexDirection: "column" as const,
    maxWidth: "92vw", maxHeight: "92vh",
    borderRadius: "12px", overflow: "hidden",
    background: "#111827", cursor: "default",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
  } as const,
  lightboxTopBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", background: "#1f2937", borderBottom: "1px solid #374151",
  } as const,
  lightboxTitle: { fontSize: "14px", fontWeight: "600", color: "#e5e7eb" } as const,
  lightboxDownloadBtn: {
    padding: "6px 16px", background: "#2563eb", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer",
    fontSize: "13px", fontWeight: "600",
  } as const,
  lightboxCloseBtn: {
    width: "32px", height: "32px", display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "transparent", color: "#9ca3af",
    border: "1px solid #4b5563", borderRadius: "6px",
    cursor: "pointer", fontSize: "16px",
  } as const,
  lightboxImageWrap: {
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "auto", padding: "8px",
  } as const,
  lightboxImage: {
    maxWidth: "88vw", maxHeight: "82vh",
    objectFit: "contain" as const, borderRadius: "4px",
  } as const,
};
