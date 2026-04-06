// ============================================================
// episodeStore — 에피소드 라이프사이클, 순서 관리 (v2.1)
// ============================================================

import { create } from "zustand";
import type { Episode } from "@webtoon/shared/types";

interface EpisodeState {
  episodes: Episode[];
  activeEpisode: Episode | null;
  loading: boolean;

  setEpisodes: (episodes: Episode[]) => void;
  setActiveEpisode: (episode: Episode | null) => void;
  setLoading: (loading: boolean) => void;
  updateEpisodeStatus: (id: string, status: Episode["status"]) => void;
}

export const useEpisodeStore = create<EpisodeState>((set) => ({
  episodes: [],
  activeEpisode: null,
  loading: false,

  setEpisodes: (episodes) => set({ episodes }),
  setActiveEpisode: (episode) => set({ activeEpisode: episode }),
  setLoading: (loading) => set({ loading }),
  updateEpisodeStatus: (id, status) =>
    set((state) => ({
      episodes: state.episodes.map((ep) =>
        ep.id === id ? { ...ep, status, updatedAt: Date.now() } : ep
      ),
    })),
}));
