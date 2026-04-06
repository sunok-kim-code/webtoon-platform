// ============================================================
// 서비스 레이어 통합 내보내기
// ============================================================

export { firebaseService, getFirebaseConfig, saveFirebaseConfig, ensureFirebaseReady } from "./firebase";
export { offlineService } from "./offline";
export { imageProcessor } from "./imageProcessor";
export {
  analyzeSceneWithGemini,
  autoTagWithGemini,
  autoTagImageWithVision,
  enhancePromptWithReferences,
  isGeminiConfigured,
  getGeminiAuthMode,
  testGeminiConnection,
  getCurrentModelId,
  setGeminiModel,
  GEMINI_MODELS,
  type GeminiModelId,
  type GeminiModelOption,
  type GeminiSceneAnalysis,
  type GeminiCharacterAnalysis,
  type GeminiLocationAnalysis,
  type GeminiPanelSuggestion,
} from "./geminiService";
export { ReferenceResolver, buildFallbackPrompt } from "./referenceResolver";
