// ============================================================
// aiStore — 생성 큐, 프로바이더 상태, API 키 (v2.1)
// AI Orchestrator의 상태 관리
// ============================================================

import { create } from "zustand";
import type { ProviderId, GenerationResult } from "@webtoon/shared/types";

interface AiState {
  activeProvider: ProviderId | null;
  apiKeys: Partial<Record<ProviderId, string>>;
  recentResults: GenerationResult[];
  isGenerating: boolean;

  setActiveProvider: (provider: ProviderId | null) => void;
  setApiKey: (provider: ProviderId, key: string) => void;
  addResult: (result: GenerationResult) => void;
  setGenerating: (generating: boolean) => void;
}

export const useAiStore = create<AiState>((set) => ({
  activeProvider: null,
  apiKeys: {},
  recentResults: [],
  isGenerating: false,

  setActiveProvider: (provider) => set({ activeProvider: provider }),
  setApiKey: (provider, key) =>
    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: key },
    })),
  addResult: (result) =>
    set((state) => ({
      recentResults: [result, ...state.recentResults].slice(0, 50),
    })),
  setGenerating: (generating) => set({ isGenerating: generating }),
}));
