// ============================================================
// figmaBridgeStore — Figma 내보내기/동기화 상태 (v2.1)
// 웹 플랫폼 ↔ Figma 플러그인 브릿지 상태
// ============================================================

import { create } from "zustand";
import type { FigmaExportDoc } from "@webtoon/shared/types";

interface FigmaBridgeState {
  exports: Record<string, FigmaExportDoc>;  // episodeId → export doc
  syncStatus: "idle" | "exporting" | "syncing" | "error";
  lastError: string | null;

  setExport: (episodeId: string, doc: FigmaExportDoc) => void;
  setSyncStatus: (status: FigmaBridgeState["syncStatus"]) => void;
  setError: (error: string | null) => void;
}

export const useFigmaBridgeStore = create<FigmaBridgeState>((set) => ({
  exports: {},
  syncStatus: "idle",
  lastError: null,

  setExport: (episodeId, doc) =>
    set((state) => ({
      exports: { ...state.exports, [episodeId]: doc },
    })),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setError: (error) => set({ lastError: error, syncStatus: error ? "error" : "idle" }),
}));
