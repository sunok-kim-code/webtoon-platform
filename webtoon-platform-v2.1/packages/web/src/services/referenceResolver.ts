// ============================================================
// Reference Resolver Service (v2.1)
// Architecture v2.0 기반 Production-driven Reference System
// 가중치 기반 멀티팩터 레퍼런스 매칭
// ============================================================

import type {
  Character,
  Location,
  ReferenceImage,
  ContextChain,
  SceneContext,
  PanelResult,
  CharacterRefTags,
  LocationRefTags,
  CHARACTER_SCORE_WEIGHTS,
  LOCATION_SCORE_WEIGHTS,
  OutfitEntry,
} from "@webtoon/shared/types";
import { normalizeOutfit, OUTFIT_SYNONYMS } from "@webtoon/shared/types";

// ─── 타입 정의 ──────────────────────────────────────────────

export interface ResolvedReference {
  ref: ReferenceImage;
  score: number;
  priority: number;      // 0: context, 1: character, 2: location
  label: string;
}

export interface ReferenceQuery {
  characters: string[];       // character IDs
  emotion?: string;
  outfit?: string;
  location?: string;          // location ID
  timeOfDay?: string;
  mood?: string;
  currentEpisode: string;
  currentPanel: number;
}

// ─── 스코어링 가중치 ────────────────────────────────────────

const CHAR_WEIGHTS = {
  emotionMatch: 0.30,
  outfitMatch: 0.25,
  angleMatch: 0.15,
  qualityRating: 0.15,
  recencyBonus: 0.10,
  usageBonus: 0.05,
};

const LOC_WEIGHTS = {
  timeOfDayMatch: 0.35,
  weatherMatch: 0.25,
  moodMatch: 0.20,
  qualityRating: 0.15,
  usageBonus: 0.05,
};

// ─── 캐릭터 레퍼런스 스코어링 ───────────────────────────────

function scoreCharacterRef(
  ref: ReferenceImage,
  query: { emotion?: string; outfit?: string; angle?: string },
  allRefs: ReferenceImage[]
): number {
  const tags = ref.tags as CharacterRefTags;
  let score = 0;

  // 감정 매칭 (30%)
  if (query.emotion && tags.emotion === query.emotion) {
    score += CHAR_WEIGHTS.emotionMatch;
  } else if (query.emotion && tags.emotion) {
    // 유사 감정 부분 점수
    const emotionGroups: Record<string, string[]> = {
      positive: ["joy", "love", "happy", "excited"],
      negative: ["sadness", "anger", "fear", "disgust"],
      neutral: ["neutral", "calm", "serious"],
      intense: ["surprise", "anger", "fear"],
    };
    for (const group of Object.values(emotionGroups)) {
      if (group.includes(query.emotion) && group.includes(tags.emotion)) {
        score += CHAR_WEIGHTS.emotionMatch * 0.5;
        break;
      }
    }
  }

  // 복장 매칭 (25%) — 정규화 + 동의어 기반 매칭
  if (query.outfit && tags.outfit) {
    const normalizedQuery = normalizeOutfit(query.outfit);
    const normalizedTag = normalizeOutfit(tags.outfit);
    if (normalizedQuery === normalizedTag) {
      score += CHAR_WEIGHTS.outfitMatch;           // 정확 매칭 100%
    } else if (tags.outfit.toLowerCase().includes(query.outfit.toLowerCase()) ||
               query.outfit.toLowerCase().includes(tags.outfit.toLowerCase())) {
      score += CHAR_WEIGHTS.outfitMatch * 0.7;     // 부분 문자열 매칭 70%
    } else {
      // 동의어 그룹 내 부분 매칭
      for (const synonyms of Object.values(OUTFIT_SYNONYMS)) {
        const qMatch = synonyms.some(s => query.outfit!.toLowerCase().includes(s));
        const tMatch = synonyms.some(s => tags.outfit.toLowerCase().includes(s));
        if (qMatch && tMatch) {
          score += CHAR_WEIGHTS.outfitMatch * 0.5;  // 같은 그룹 50%
          break;
        }
      }
    }
  }

  // 앵글 매칭 (15%)
  if (query.angle && tags.angle === query.angle) {
    score += CHAR_WEIGHTS.angleMatch;
  }

  // 품질 점수 (15%) — 1-5 스케일 정규화
  score += CHAR_WEIGHTS.qualityRating * (ref.quality / 5);

  // 최근성 보너스 (10%)
  const daysSinceCreation = (Date.now() - ref.createdAt) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - daysSinceCreation / 30); // 30일 내 감소
  score += CHAR_WEIGHTS.recencyBonus * recency;

  // 사용 빈도 보너스 (5%)
  const maxUsage = Math.max(1, ...allRefs.map(r => r.usageCount));
  score += CHAR_WEIGHTS.usageBonus * (ref.usageCount / maxUsage);

  return score;
}

// ─── 로케이션 레퍼런스 스코어링 ─────────────────────────────

function scoreLocationRef(
  ref: ReferenceImage,
  query: { timeOfDay?: string; weather?: string; mood?: string },
  allRefs: ReferenceImage[]
): number {
  const tags = ref.tags as LocationRefTags;
  let score = 0;

  // 시간대 매칭 (35%)
  if (query.timeOfDay && tags.timeOfDay === query.timeOfDay) {
    score += LOC_WEIGHTS.timeOfDayMatch;
  }

  // 날씨 매칭 (25%)
  if (query.weather && tags.weather === query.weather) {
    score += LOC_WEIGHTS.weatherMatch;
  }

  // 분위기 매칭 (20%)
  if (query.mood && tags.mood === query.mood) {
    score += LOC_WEIGHTS.moodMatch;
  }

  // 품질 점수 (15%)
  score += LOC_WEIGHTS.qualityRating * (ref.quality / 5);

  // 사용 빈도 보너스 (5%)
  const maxUsage = Math.max(1, ...allRefs.map(r => r.usageCount));
  score += LOC_WEIGHTS.usageBonus * (ref.usageCount / maxUsage);

  return score;
}

// ─── Reference Resolver 메인 클래스 ─────────────────────────

export class ReferenceResolver {
  private characters: Character[];
  private locations: Location[];
  private contextChain: ContextChain | null;
  private outfitEntries: OutfitEntry[];

  constructor(
    characters: Character[],
    locations: Location[],
    contextChain: ContextChain | null = null,
    outfitEntries: OutfitEntry[] = []
  ) {
    this.characters = characters;
    this.locations = locations;
    this.contextChain = contextChain;
    this.outfitEntries = outfitEntries;
  }

  /**
   * 쿼리에 가장 적합한 레퍼런스를 찾아 반환합니다.
   * 반환 순서: context refs → character refs → location refs
   */
  resolve(query: ReferenceQuery, maxResults: number = 4): ResolvedReference[] {
    const results: ResolvedReference[] = [];

    // 1. Context Chain 레퍼런스 (최우선)
    const contextRefs = this.resolveContextRefs(query);
    results.push(...contextRefs);

    // 2. 캐릭터 레퍼런스 (의상 카탈로그 연동)
    for (const charName of query.characters) {
      const character = this.characters.find(c => c.name === charName || c.id === charName);
      if (!character || character.references.length === 0) continue;

      // OutfitEntry에서 현재 의상 해석
      const outfitPrompt = this.resolveOutfitPrompt(character, query.outfit, this.outfitEntries);

      const scored = character.references
        .map(ref => ({
          ref,
          score: scoreCharacterRef(ref, {
            emotion: query.emotion,
            outfit: query.outfit,
          }, character.references),
          priority: 1,
          label: outfitPrompt
            ? `character:${character.name}[outfit:${outfitPrompt}]`
            : `character:${character.name}`,
        }))
        .sort((a, b) => b.score - a.score);

      // 캐릭터당 최대 2개
      results.push(...scored.slice(0, 2));
    }

    // 3. 로케이션 레퍼런스
    if (query.location) {
      const location = this.locations.find(l => l.name === query.location || l.id === query.location);
      if (location && location.references.length > 0) {
        const scored = location.references
          .map(ref => ({
            ref,
            score: scoreLocationRef(ref, {
              timeOfDay: query.timeOfDay,
              mood: query.mood,
            }, location.references),
            priority: 2,
            label: `location:${location.name}`,
          }))
          .sort((a, b) => b.score - a.score);

        results.push(...scored.slice(0, 1));
      }
    }

    // priority → score 순으로 정렬 후 maxResults 개 반환
    return results
      .sort((a, b) => a.priority - b.priority || b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Context Chain에서 같은 씬의 이전 패널 레퍼런스를 가져옵니다.
   * 씬 연속성 유지를 위한 핵심 메커니즘
   */
  private resolveContextRefs(query: ReferenceQuery): ResolvedReference[] {
    if (!this.contextChain) return [];

    const currentScene = this.contextChain.scenes.find(scene =>
      scene.startPanel <= query.currentPanel && scene.endPanel >= query.currentPanel
    );

    if (!currentScene || currentScene.panelResults.length === 0) return [];

    // 현재 패널 이전의 최대 2개 패널 결과를 레퍼런스로 사용
    const previousPanels = currentScene.panelResults
      .filter(pr => pr.panelIndex < query.currentPanel)
      .sort((a, b) => b.panelIndex - a.panelIndex)
      .slice(0, 2);

    return previousPanels.map(pr => ({
      ref: {
        id: `context_${pr.panelIndex}`,
        storageUrl: pr.storageUrl,
        tags: {} as CharacterRefTags,
        sourceEpisode: query.currentEpisode,
        sourcePanel: pr.panelIndex,
        usageCount: 0,
        quality: 5,    // context refs는 최고 품질로 간주
        createdAt: Date.now(),
      },
      score: 1.0,       // context refs는 최고 점수
      priority: 0,       // 최우선
      label: `context:panel_${pr.panelIndex}`,
    }));
  }

  /**
   * 씬 변경 감지 (캐릭터 세트 또는 장소 변경 시)
   */
  detectSceneChange(
    prevCharacters: string[],
    prevLocation: string | undefined,
    currentCharacters: string[],
    currentLocation: string | undefined
  ): boolean {
    if (prevLocation !== currentLocation) return true;

    const prevSet = new Set(prevCharacters);
    const currentSet = new Set(currentCharacters);

    // 캐릭터 절반 이상이 변경되면 씬 변경으로 판단
    const intersection = [...prevSet].filter(c => currentSet.has(c));
    const unionSize = new Set([...prevSet, ...currentSet]).size;

    return unionSize > 0 && intersection.length / unionSize < 0.5;
  }

  /**
   * Context Chain 업데이트 (패널 생성 완료 후 호출)
   */
  updateContextChain(
    episodeId: string,
    panelIndex: number,
    result: PanelResult,
    characterIds: string[],
    locationId?: string
  ): ContextChain {
    const chain = this.contextChain || { episodeId, scenes: [] };

    // 현재 씬 찾기 또는 새 씬 생성
    let currentScene = chain.scenes.find(
      s => s.endPanel === panelIndex - 1 || s.endPanel === panelIndex
    );

    if (!currentScene || this.detectSceneChange(
      currentScene.characters,
      currentScene.locationId,
      characterIds,
      locationId
    )) {
      // 새 씬 시작
      currentScene = {
        sceneId: `scene_${Date.now()}`,
        startPanel: panelIndex,
        endPanel: panelIndex,
        characters: characterIds,
        locationId,
        panelResults: [],
      };
      chain.scenes.push(currentScene);
    }

    // 현재 패널 결과 추가
    currentScene.endPanel = panelIndex;
    currentScene.panelResults.push(result);

    this.contextChain = chain;
    return chain;
  }

  /**
   * 캐릭터의 현재 의상에 맞는 프롬프트 스니펫을 생성합니다.
   * OutfitEntry[] (outfit library)에서 매칭되는 의상을 찾아 상세 설명 반환
   */
  resolveOutfitPrompt(character: Character, outfitQuery?: string, outfitEntries?: OutfitEntry[]): string {
    // OutfitEntry 기반 조회 (파라미터 없으면 클래스에 저장된 entries 사용)
    const entries = outfitEntries || this.outfitEntries;
    const charOutfits = entries.filter(o => o.characterId === character.id);
    if (charOutfits.length === 0) {
      return "";
    }

    // 1. currentOutfitId가 있으면 우선 사용
    if (character.currentOutfitId) {
      const current = charOutfits.find(o => o.id === character.currentOutfitId);
      if (current) return this.buildOutfitSnippet(current);
    }

    // 2. outfitQuery로 매칭
    if (outfitQuery) {
      const normalized = normalizeOutfit(outfitQuery);
      const match = charOutfits.find(o =>
        normalizeOutfit(o.label) === normalized ||
        normalizeOutfit(o.description).includes(normalized)
      );
      if (match) return this.buildOutfitSnippet(match);
    }

    // 3. 기본 의상 폴백
    const defaultOutfit = charOutfits.find(o => o.isDefault);
    if (defaultOutfit) return this.buildOutfitSnippet(defaultOutfit);

    return "";
  }

  private buildOutfitSnippet(outfit: OutfitEntry): string {
    let snippet = outfit.description;
    // accessories가 있고 description에 아직 포함되지 않은 경우에만 추가
    if (outfit.accessories && outfit.accessories.length > 0) {
      const accStr = outfit.accessories.join(", ");
      if (!snippet.toLowerCase().includes(accStr.toLowerCase().split(",")[0])) {
        snippet += `, with accessories: ${accStr}`;
      }
    }
    if (outfit.colorPalette && outfit.colorPalette.length > 0) {
      snippet += `, color palette: ${outfit.colorPalette.join(", ")}`;
    }
    return snippet;
  }
}

/**
 * 레퍼런스 시스템이 비어있을 때의 폴백 (첫 에피소드 제작 시)
 * Reference가 없어도 텍스트 기반 프롬프트로 생성 가능
 */
export function buildFallbackPrompt(
  panelDescription: string,
  characters: { name: string; promptSnippet: string; outfitSnippet?: string }[],
  location: { name: string; promptSnippet: string } | null,
  cameraAngle: string
): string {
  const charParts = characters
    .map(c => {
      let part = c.promptSnippet ? `[${c.name}: ${c.promptSnippet}` : `[${c.name}`;
      if (c.outfitSnippet) part += `, outfit: ${c.outfitSnippet}`;
      part += "]";
      return part;
    })
    .join(", ");

  const locPart = location?.promptSnippet
    ? `[Setting: ${location.promptSnippet}]`
    : "";

  return `webtoon style, ${panelDescription}\n\nCharacters: ${charParts}\n${locPart}\nCamera: ${cameraAngle}\n\nhigh quality, detailed, korean webtoon art style`;
}
