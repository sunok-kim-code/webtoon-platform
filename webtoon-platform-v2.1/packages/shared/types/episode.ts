// ============================================================
// Episode & Project 타입 정의
// 웹 플랫폼과 Figma 플러그인이 공유하는 핵심 데이터 모델
// ============================================================

/** 프로젝트 상태 */
export type ProjectStatus = "active" | "archived" | "draft";

/** 에피소드 상태 (v2.1 파이프라인 기반) */
export type EpisodeStatus =
  | "draft"               // 초기 생성
  | "references_ready"    // Step 1 완료: 레퍼런스 준비됨
  | "storyboard_ready"    // Step 2 완료: 스토리보드 확정
  | "panels_generated"    // Step 3 완료: 패널 이미지 생성됨
  | "in_figma"            // Step 4: Figma에서 후반 작업 중
  | "completed";          // Step 5 완료: 최종 내보내기 완료

/** 파이프라인 단계 이름 */
export type PipelineStep =
  | "step1_references"
  | "step2_storyboard"
  | "step3_panels"
  | "step4_figma"
  | "step5_export";

/** 프로젝트 */
export interface Project {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;        // Firebase Storage URL
  status: ProjectStatus;
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSettings {
  defaultProvider?: string;
  stripWidth: number;         // 기본 웹툰 스트립 너비 (px)
  defaultFont: string;
  aiApiKeys?: Record<string, string>;  // provider → key
}

/** 에피소드 */
export interface Episode {
  id: string;
  projectId: string;
  number: number;
  title: string;
  status: EpisodeStatus;
  completedSteps: PipelineStep[];
  createdAt: number;
  updatedAt: number;
  // 전체 스토리 분석 결과로 생성된 씬 데이터 (선택적)
  sceneData?: unknown[];     // FullStoryScene[] (순환 참조 방지로 unknown 사용)
  keyEvents?: string[];      // 이 화의 주요 사건
  totalScenes?: number;      // 총 씬 수
}

/** 스토리보드 항목 (Step 2 결과) */
export interface StoryboardItem {
  panelIndex: number;
  sceneId: string;
  prompt: string;
  characters: string[];       // character IDs
  locationId?: string;
  emotion?: string;
  cameraAngle?: string;
  notes?: string;
}

/** 생성된 패널 (Step 3 결과) */
export interface GeneratedPanel {
  index: number;
  imageUrl: string;           // Firebase Storage URL
  prompt: string;
  providerId: string;
  width: number;
  height: number;
  generatedAt: number;
  referenceIds?: string[];    // 사용된 레퍼런스 ID들
}
