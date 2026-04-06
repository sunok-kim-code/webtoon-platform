// ============================================================
// projectStore — 프로젝트 CRUD, 활성 프로젝트 선택 (v2.1)
// ============================================================

import { create } from "zustand";
import type { Project } from "@webtoon/shared/types";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  error: string | null;

  // Actions
  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProject: null,
  loading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

// Convenience hook to use projectStore actions
export const useProjectActions = () => {
  const store = useProjectStore();
  return {
    setProjects: store.setProjects,
    setActiveProject: store.setActiveProject,
    setLoading: store.setLoading,
    setError: store.setError,
  };
};
