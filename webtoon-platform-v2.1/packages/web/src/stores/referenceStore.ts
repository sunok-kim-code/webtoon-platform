// ============================================================
// referenceStore — 캐릭터, 로케이션, 컨텍스트 체인 (v2.1)
// Production-driven Reference System의 상태 관리
// ============================================================

import { create } from "zustand";
import type { Character, Location, ContextChain, OutfitEntry } from "@webtoon/shared/types";

interface ReferenceState {
  /** 현재 로드된 프로젝트 ID */
  currentProjectId: string | null;
  /** 로딩 상태 */
  loading: boolean;

  characters: Character[];
  locations: Location[];
  outfits: OutfitEntry[];        // 의상 라이브러리
  contextChain: ContextChain | null;

  setCharacters: (characters: Character[]) => void;
  setLocations: (locations: Location[]) => void;
  setContextChain: (chain: ContextChain | null) => void;
  addCharacter: (character: Character) => void;
  addLocation: (location: Location) => void;
  removeCharacter: (characterId: string) => void;
  removeLocation: (locationId: string) => void;

  // ─── 의상 라이브러리 액션 ───────────────────────────────
  setOutfits: (outfits: OutfitEntry[]) => void;
  addOrUpdateOutfit: (outfit: OutfitEntry) => void;
  removeOutfit: (outfitId: string) => void;
  /** normalizedId로 의상 조회 */
  getOutfitById: (id: string) => OutfitEntry | undefined;
  /** 캐릭터 ID로 의상 목록 조회 */
  getOutfitsByCharacter: (characterId: string) => OutfitEntry[];

  /** 프로젝트 ID로 Firestore에서 레퍼런스 로드 (중복 호출 시 기존 Promise 재사용) */
  loadReferences: (projectId: string) => Promise<void>;
  /** 강제 리로드 (캐시 무시) */
  reloadReferences: (projectId: string) => Promise<void>;
}

/** 진행 중인 loadReferences Promise (중복 호출 방지) */
let _loadPromise: Promise<void> | null = null;

export const useReferenceStore = create<ReferenceState>((set, get) => ({
  currentProjectId: null,
  loading: false,

  characters: [],
  locations: [],
  outfits: [],
  contextChain: null,

  setCharacters: (characters) => {
    const prev = get().characters;
    set({ characters });
    // 변경된 캐릭터만 Firebase에 저장
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, saveCharacter } = await import("@/services/firebase");
          await ensureFirebaseReady();
          for (const c of characters) {
            const old = prev.find(p => p.id === c.id);
            if (!old || old.updatedAt !== c.updatedAt || old.references?.length !== c.references?.length
              || old.currentOutfitId !== c.currentOutfitId) {
              await saveCharacter(pid, c);
              console.log(`[ReferenceStore] Character saved to Firebase: ${c.name} (refs: ${c.references?.length})`);
            }
          }
        } catch (e) {
          console.error("[ReferenceStore] setCharacters Firebase save error:", e);
        }
      })();
    }
  },
  setLocations: (locations) => {
    const prev = get().locations;
    set({ locations });
    // 변경된 장소만 Firebase에 저장
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, saveLocation } = await import("@/services/firebase");
          await ensureFirebaseReady();
          for (const l of locations) {
            const old = prev.find(p => p.id === l.id);
            if (!old || old.updatedAt !== l.updatedAt || old.references?.length !== l.references?.length) {
              await saveLocation(pid, l);
              console.log(`[ReferenceStore] Location saved to Firebase: ${l.name} (refs: ${l.references?.length})`);
            }
          }
        } catch (e) {
          console.error("[ReferenceStore] setLocations Firebase save error:", e);
        }
      })();
    }
  },
  setContextChain: (chain) => set({ contextChain: chain }),
  addCharacter: (character) => {
    // 중복 체크: 같은 이름의 캐릭터가 이미 있으면 스킵
    const existing = get().characters;
    if (existing.some(c => c.name === character.name)) {
      console.log(`[ReferenceStore] addCharacter skipped (duplicate): ${character.name}`);
      return;
    }
    set((state) => ({ characters: [...state.characters, character] }));
    // Firebase 비동기 저장 (초기화 보장)
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, saveCharacter } = await import("@/services/firebase");
          await ensureFirebaseReady();
          await saveCharacter(pid, character);
          console.log(`[ReferenceStore] addCharacter saved: ${character.name} → ${pid}`);
        } catch (e) {
          console.error("[ReferenceStore] addCharacter Firebase error:", e);
        }
      })();
    } else {
      console.warn("[ReferenceStore] addCharacter: no currentProjectId, skipping Firebase save");
    }
  },
  addLocation: (location) => {
    // 중복 체크: 같은 이름의 장소가 이미 있으면 스킵
    const existing = get().locations;
    if (existing.some(l => l.name === location.name)) {
      console.log(`[ReferenceStore] addLocation skipped (duplicate): ${location.name}`);
      return;
    }
    set((state) => ({ locations: [...state.locations, location] }));
    // Firebase 비동기 저장 (초기화 보장)
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, saveLocation } = await import("@/services/firebase");
          await ensureFirebaseReady();
          await saveLocation(pid, location);
          console.log(`[ReferenceStore] addLocation saved: ${location.name} → ${pid}`);
        } catch (e) {
          console.error("[ReferenceStore] addLocation Firebase error:", e);
        }
      })();
    } else {
      console.warn("[ReferenceStore] addLocation: no currentProjectId, skipping Firebase save");
    }
  },
  removeCharacter: (characterId) => {
    set((state) => ({ characters: state.characters.filter(c => c.id !== characterId) }));
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, deleteCharacter } = await import("@/services/firebase");
          await ensureFirebaseReady();
          await deleteCharacter(pid, characterId);
          console.log(`[ReferenceStore] removeCharacter deleted: ${characterId} → ${pid}`);
        } catch (e) {
          console.error("[ReferenceStore] removeCharacter Firebase error:", e);
        }
      })();
    }
  },
  removeLocation: (locationId) => {
    set((state) => ({ locations: state.locations.filter(l => l.id !== locationId) }));
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, deleteLocation } = await import("@/services/firebase");
          await ensureFirebaseReady();
          await deleteLocation(pid, locationId);
          console.log(`[ReferenceStore] removeLocation deleted: ${locationId} → ${pid}`);
        } catch (e) {
          console.error("[ReferenceStore] removeLocation Firebase error:", e);
        }
      })();
    }
  },

  // ─── 의상 라이브러리 액션 ─────────────────────────────────

  setOutfits: (outfits) => set({ outfits }),

  addOrUpdateOutfit: (outfit) => {
    set((state) => {
      const idx = state.outfits.findIndex(o => o.id === outfit.id);
      const updated = idx >= 0
        ? state.outfits.map(o => o.id === outfit.id ? outfit : o)
        : [...state.outfits, outfit];
      return { outfits: updated };
    });
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, saveOutfit } = await import("@/services/firebase");
          await ensureFirebaseReady();
          await saveOutfit(pid, outfit);
          console.log(`[ReferenceStore] Outfit saved: ${outfit.id}`);
        } catch (e) {
          console.error("[ReferenceStore] addOrUpdateOutfit Firebase error:", e);
        }
      })();
    }
  },

  removeOutfit: (outfitId) => {
    set((state) => ({ outfits: state.outfits.filter(o => o.id !== outfitId) }));
    const pid = get().currentProjectId;
    if (pid) {
      (async () => {
        try {
          const { ensureFirebaseReady, deleteOutfit } = await import("@/services/firebase");
          await ensureFirebaseReady();
          await deleteOutfit(pid, outfitId);
          console.log(`[ReferenceStore] Outfit deleted: ${outfitId}`);
        } catch (e) {
          console.error("[ReferenceStore] removeOutfit Firebase error:", e);
        }
      })();
    }
  },

  getOutfitById: (id) => get().outfits.find(o => o.id === id),

  getOutfitsByCharacter: (characterId) =>
    get().outfits.filter(o => o.characterId === characterId),

  /** 강제 리로드 (캐시 무시) */
  reloadReferences: async (projectId: string) => {
    set({ loading: true, currentProjectId: projectId });
    try {
      const { ensureFirebaseReady, fetchCharacters, fetchLocations, fetchOutfits } = await import("@/services/firebase");
      await ensureFirebaseReady();
      const [chars, locs, outfits] = await Promise.all([
        fetchCharacters(projectId),
        fetchLocations(projectId),
        fetchOutfits(projectId),
      ]);
      set({ characters: chars, locations: locs, outfits, loading: false });
      console.log(`[ReferenceStore] Reloaded ${chars.length} characters, ${locs.length} locations, ${outfits.length} outfits`);
    } catch (err) {
      console.error("[ReferenceStore] reloadReferences error:", err);
      set({ loading: false });
    }
  },

  loadReferences: async (projectId: string) => {
    // 이미 같은 프로젝트가 로드 완료된 상태면 스킵
    if (get().currentProjectId === projectId && !get().loading) return;

    // 이미 로딩 중이면 기존 Promise를 재사용 (중복 호출 방지)
    if (_loadPromise && get().loading) {
      await _loadPromise;
      return;
    }

    const doLoad = async () => {
      set({ loading: true, currentProjectId: projectId });
      try {
        const { ensureFirebaseReady, fetchCharacters, fetchLocations, fetchOutfits } = await import("@/services/firebase");
        await ensureFirebaseReady();
        const [chars, locs, outfits] = await Promise.all([
          fetchCharacters(projectId),
          fetchLocations(projectId),
          fetchOutfits(projectId),
        ]);
        set({ characters: chars, locations: locs, outfits, loading: false });
        console.log(`[ReferenceStore] Loaded ${chars.length} chars, ${locs.length} locs, ${outfits.length} outfits for ${projectId}`);
      } catch (err) {
        console.error("[ReferenceStore] loadReferences error:", err);
        set({ loading: false });
      } finally {
        _loadPromise = null;
      }
    };

    _loadPromise = doLoad();
    await _loadPromise;
  },
}));
