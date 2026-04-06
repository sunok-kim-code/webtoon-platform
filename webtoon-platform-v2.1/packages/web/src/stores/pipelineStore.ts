// ============================================================
// pipelineStore — Steps 1-3 워크플로우 상태 (v2.1)
// 레퍼런스 → 스토리보드 → 패널 생성 파이프라인
// ============================================================

import { create } from "zustand";
import type { StoryboardItem, GeneratedPanel, PipelineStep } from "@webtoon/shared/types";

interface PipelineState {
  currentStep: PipelineStep;
  storyboard: StoryboardItem[];
  generatedPanels: GeneratedPanel[];
  generationQueue: number[];       // 생성 대기 중인 패널 인덱스
  isGenerating: boolean;

  setCurrentStep: (step: PipelineStep) => void;
  setStoryboard: (items: StoryboardItem[]) => void;
  addGeneratedPanel: (panel: GeneratedPanel) => void;
  setGenerating: (generating: boolean) => void;
  enqueueGeneration: (panelIndices: number[]) => void;
  dequeueGeneration: (index: number) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  currentStep: "step1_references",
  storyboard: [],
  generatedPanels: [],
  generationQueue: [],
  isGenerating: false,

  setCurrentStep: (step) => set({ currentStep: step }),
  setStoryboard: (items) => set({ storyboard: items }),
  addGeneratedPanel: (panel) =>
    set((state) => ({
      generatedPanels: [...state.generatedPanels, panel],
    })),
  setGenerating: (generating) => set({ isGenerating: generating }),
  enqueueGeneration: (indices) =>
    set((state) => ({
      generationQueue: [...state.generationQueue, ...indices],
    })),
  dequeueGeneration: (index) =>
    set((state) => ({
      generationQueue: state.generationQueue.filter((i) => i !== index),
    })),
}));
