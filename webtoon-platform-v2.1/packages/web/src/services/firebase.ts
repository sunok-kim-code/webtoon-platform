// ============================================================
// Firebase 서비스 래퍼 (v2.1)
// Firestore CRUD + Firebase Storage (이미지 URL 기반)
// v1 호환: localStorage 동적 설정 + /api/firebase-config 자동 로드
// ============================================================

import type {
  Project,
  Episode,
  Character,
  Location,
  ReferenceImage,
  GeneratedPanel,
  OutfitEntry,
} from "@webtoon/shared";

// ─── Firestore 유틸: undefined 재귀 제거 ────────────────────
/** Firestore setDoc()는 모든 depth 에서 undefined 를 거부 → 재귀적으로 제거 */
function deepRemoveUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(deepRemoveUndefined);
  if (typeof obj === "object" && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = deepRemoveUndefined(v);
      }
    }
    return cleaned;
  }
  return obj;
}

// ─── Firebase 초기화 (lazy, v1 호환) ────────────────────────

let _app: any = null;
let _db: any = null;
let _storage: any = null;
let _auth: any = null;

// v1 호환: localStorage 기반 설정 관리
const FIREBASE_CONFIG_KEY = "firebase_config";

// ─── 기본 Firebase 설정 (모바일 등 새 기기에서도 즉시 연결) ───
// Vercel 환경변수(VITE_FIREBASE_*) 우선 → 없으면 rhivclass 하드코딩 폴백
const DEFAULT_FIREBASE_CONFIG: Record<string, string> = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyA10E1hk8uVmqns41x0_mTAjRsBhiTK7cY",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "rhivclass.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "rhivclass",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "rhivclass.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1052958322645",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:1052958322645:web:40ff7c9b66739bf738975c",
};

/**
 * Firebase 설정 읽기: localStorage → 기본값 fallback
 */
export function getFirebaseConfig(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  // localStorage에 없으면 기본값 사용 (모바일/새 기기 대응)
  return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Firebase 설정을 localStorage에 저장하고 재초기화 (v1 호환)
 */
export function saveFirebaseConfig(cfg: Record<string, string>) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(cfg));
  _app = null;
  _db = null;
  _storage = null;
  initFirebase(cfg);
}

/**
 * Firebase 애플리케이션 초기화
 * 동적 import를 사용하여 필요할 때만 로드
 * config를 생략하면 localStorage에서 자동 로드 (v1 호환)
 */
export async function initFirebase(config?: Record<string, string>) {
  if (_app) return;

  const cfg = config || getFirebaseConfig();
  if (!cfg || !cfg.apiKey || !cfg.projectId) {
    console.warn("[Firebase] No config available. Call initFirebase(config) or saveFirebaseConfig(config) first.");
    return;
  }

  try {
    const { initializeApp } = await import("firebase/app");
    const { getFirestore } = await import("firebase/firestore");
    const { getStorage: getFirebaseStorage } = await import("firebase/storage");
    const { getAuth, signInAnonymously } = await import("firebase/auth");

    _app = initializeApp(cfg);
    _db = getFirestore(_app);
    _storage = getFirebaseStorage(_app);
    _auth = getAuth(_app);

    // 익명 로그인 — Storage Rules에서 auth != null 조건 충족
    try {
      const cred = await signInAnonymously(_auth);
      console.log("[Firebase] Anonymous auth OK:", cred.user.uid);
    } catch (authErr) {
      console.warn("[Firebase] Anonymous auth failed (Storage uploads may fail):", authErr);
    }

    console.log("[Firebase] Initialized with project:", cfg.projectId);
  } catch (error) {
    console.error("[Firebase] Initialization failed:", error);
    throw error;
  }
}

// ─── API 키 관리 (v1 호환) ──────────────────────────────────

const API_KEY_NAMES = [
  "VERTEX_PROJECT_ID",
  "VERTEX_LOCATION",
  "VERTEX_ACCESS_TOKEN",
  "XAI_API_KEY",
  "STABILITY_API_KEY",
  "FAL_API_KEY",
  "A2E_API_KEY",
  "NINJACHAT_API_KEY",
  "KIE_API_KEY",
  "SIRAY_API_KEY",
  "HIGGSFIELD_CREDENTIALS",
];

let _apiKeySyncResolve: (value: number) => void;
const _apiKeySyncPromise = new Promise<number>((r) => {
  _apiKeySyncResolve = r;
});
export function waitForApiKeySync() {
  return _apiKeySyncPromise;
}

/**
 * Firestore에서 API 키 동기화 (v1 호환)
 */
async function syncApiKeysFromFirestore(): Promise<number> {
  try {
    const { collection, doc, getDoc } = await import("firebase/firestore");
    const db = getDb();
    const snap = await getDoc(doc(collection(db, "api_keys"), "shared"));
    if (!snap.exists()) return 0;
    const data = snap.data() as Record<string, string>;
    let synced = 0;
    for (const key of API_KEY_NAMES) {
      if (data[key] && !localStorage.getItem(key)) {
        localStorage.setItem(key, data[key]);
        synced++;
      }
    }
    return synced;
  } catch {
    return 0;
  }
}

/**
 * API 키를 Firestore에 저장 (v1 호환)
 */
export async function saveApiKeys(keys: Record<string, string>): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();
    await setDoc(doc(collection(db, "api_keys"), "shared"), keys, { merge: true });
    // localStorage에도 저장
    for (const [k, v] of Object.entries(keys)) {
      if (v) localStorage.setItem(k, v);
    }
    console.log("[Firebase] API keys saved");
  } catch (error) {
    console.error("[Firebase] saveApiKeys error:", error);
  }
}

/**
 * 서버에서 Firebase 설정 + API 키 자동 로드 (v1 호환)
 * /api/firebase-config 엔드포인트에서 가져옴
 */
export async function autoLoadServerConfig(): Promise<void> {
  let serverKeySynced = 0;
  try {
    const res = await fetch("/api/firebase-config");
    if (!res.ok) throw new Error("Server config unavailable");
    const data = await res.json();

    // Firebase 설정 자동 적용
    if (data.firebase) {
      saveFirebaseConfig(data.firebase);
    }

    // Vertex AI 설정
    if (data.vertex) {
      if (data.vertex.projectId) localStorage.setItem("VERTEX_PROJECT_ID", data.vertex.projectId);
      if (data.vertex.location) localStorage.setItem("VERTEX_LOCATION", data.vertex.location);
      if (data.vertex.accessToken) localStorage.setItem("VERTEX_ACCESS_TOKEN", data.vertex.accessToken);
      if (data.vertex.grokApiKey) localStorage.setItem("GROK_API_KEY", data.vertex.grokApiKey);
      if (data.vertex.stabilityApiKey) localStorage.setItem("STABILITY_API_KEY", data.vertex.stabilityApiKey);
    }

    // 추가 API 키
    if (data.apiKeys) {
      for (const [key, val] of Object.entries(data.apiKeys)) {
        if (val && !localStorage.getItem(key)) {
          localStorage.setItem(key, val as string);
          serverKeySynced++;
        }
      }
    }
  } catch {
    // 서버 설정 없으면 localStorage에서 진행
  }

  // Firestore에서도 키 동기화
  try {
    await initFirebase();
    const firestoreSynced = await syncApiKeysFromFirestore();
    const total = serverKeySynced + firestoreSynced;
    console.log("[KeySync] autoLoad complete — server:", serverKeySynced, "firestore:", firestoreSynced);
    _apiKeySyncResolve(total);
  } catch {
    _apiKeySyncResolve(serverKeySynced);
  }
}

// ─── Vertex AI 토큰 관리 (v1 호환) ─────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiry = 0;

export async function fetchFreshToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _tokenExpiry > now + 300000) return _cachedToken;
  try {
    const res = await fetch("/api/vertex-token");
    if (res.ok) {
      const d = await res.json();
      if (d.access_token) {
        _cachedToken = d.access_token;
        _tokenExpiry = now + (d.expires_in || 3600) * 1000;
        localStorage.setItem("VERTEX_ACCESS_TOKEN", d.access_token);
        return d.access_token;
      }
    }
  } catch {
    /* fallback */
  }
  return localStorage.getItem("VERTEX_ACCESS_TOKEN") || "";
}

export async function getVertexConfig(): Promise<{
  projectId: string;
  location: string;
  accessToken: string;
}> {
  const p = localStorage.getItem("VERTEX_PROJECT_ID");
  const l = localStorage.getItem("VERTEX_LOCATION") || "us-central1";
  const t = await fetchFreshToken();
  if (!p || !t) throw new Error("Vertex AI config not set");
  return { projectId: p, location: l, accessToken: t };
}

// API 키 헬퍼 (v1 호환)
export function hasGeminiKey() {
  return !!(localStorage.getItem("VERTEX_PROJECT_ID") || localStorage.getItem("KIE_API_KEY"));
}
export function hasXaiKey() {
  return !!localStorage.getItem("XAI_API_KEY");
}
export function getXaiKey() {
  const k = localStorage.getItem("XAI_API_KEY");
  if (!k) throw new Error("XAI key missing");
  return k;
}
export function hasStabilityKey() {
  return !!localStorage.getItem("STABILITY_API_KEY");
}
export function getStabilityKey() {
  const k = localStorage.getItem("STABILITY_API_KEY");
  if (!k) throw new Error("Stability key missing");
  return k;
}
export function getKieKey() {
  const k = localStorage.getItem("KIE_API_KEY");
  if (!k) throw new Error("Kie key missing");
  return k;
}
export function getSirayKey() {
  const k = localStorage.getItem("SIRAY_API_KEY");
  if (!k) throw new Error("Siray key missing");
  return k;
}

/**
 * Firestore와 Storage 인스턴스 반환 (내부용)
 */
export function getDb() {
  if (!_db) {
    throw new Error("Firebase not initialized. Call initFirebase() first.");
  }
  return _db;
}

function getStorageInstance() {
  if (!_storage) {
    throw new Error("Firebase not initialized. Call initFirebase() first.");
  }
  return _storage;
}

/**
 * Firebase가 초기화될 때까지 대기하는 헬퍼
 * 이미 초기화되어 있으면 즉시 반환
 */
let _initPromise: Promise<void> | null = null;

export function ensureFirebaseReady(): Promise<void> {
  if (_db) return Promise.resolve();
  if (_initPromise) return _initPromise;

  _initPromise = initFirebase().then(() => {
    _initPromise = null;
  });
  return _initPromise;
}

// 모듈 로드 시 자동 설정 로드 시도
// localStorage에 config가 있으면 즉시 초기화 시작
const _bootConfig = getFirebaseConfig();
if (_bootConfig && _bootConfig.apiKey) {
  _initPromise = initFirebase(_bootConfig).then(() => { _initPromise = null; });
}
autoLoadServerConfig();

// ─── 프로젝트 CRUD ──────────────────────────────────────────

/**
 * 사용자의 모든 프로젝트 조회
 */
// ─── v1.0 → v2.1 마이그레이션 유틸 ──────────────────────────

/**
 * v1.0 프로젝트 데이터에 v2.1 필수 필드가 없으면 기본값으로 채운다.
 */
function migrateProject(raw: Record<string, any>): Project {
  return {
    id: raw.id || "",
    title: raw.title || raw.name || "제목 없음",
    description: raw.description || raw.synopsis || "",
    thumbnail: raw.thumbnail || raw.thumbnailUrl || "",
    status: raw.status || "active",
    settings: {
      defaultProvider: raw.settings?.defaultProvider || raw.provider || undefined,
      stripWidth: raw.settings?.stripWidth ?? raw.stripWidth ?? 800,
      defaultFont: raw.settings?.defaultFont || raw.font || "Arial",
      aiApiKeys: raw.settings?.aiApiKeys || raw.apiKeys || undefined,
    },
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

/** 유효한 v2.1 EpisodeStatus 목록 */
const VALID_EPISODE_STATUSES = new Set([
  "draft", "references_ready", "storyboard_ready",
  "panels_generated", "in_figma", "completed",
]);

/**
 * v1.0 에피소드 데이터를 v2.1 형식으로 마이그레이션한다.
 * - status가 v2.1 enum에 없으면 "draft"로 기본 설정
 * - completedSteps가 없으면 status에 맞춰 자동 생성
 */
function migrateEpisode(raw: Record<string, any>, projectId: string): Episode {
  // status 정규화
  let status = raw.status || "draft";
  if (!VALID_EPISODE_STATUSES.has(status)) {
    // v1.0 status → v2.1 매핑
    const statusMap: Record<string, string> = {
      "writing": "draft",
      "scripting": "draft",
      "drawing": "panels_generated",
      "done": "completed",
      "complete": "completed",
      "review": "in_figma",
      "published": "completed",
      "in_progress": "storyboard_ready",
    };
    status = statusMap[status.toLowerCase()] || "draft";
  }

  // completedSteps 자동 생성 (status에 따라)
  let completedSteps = raw.completedSteps;
  if (!completedSteps || !Array.isArray(completedSteps) || completedSteps.length === 0) {
    const stepsByStatus: Record<string, string[]> = {
      draft: [],
      references_ready: ["step1_references"],
      storyboard_ready: ["step1_references", "step2_storyboard"],
      panels_generated: ["step1_references", "step2_storyboard", "step3_panels"],
      in_figma: ["step1_references", "step2_storyboard", "step3_panels", "step4_figma"],
      completed: ["step1_references", "step2_storyboard", "step3_panels", "step4_figma", "step5_export"],
    };
    completedSteps = stepsByStatus[status] || [];
  }

  return {
    id: raw.id || "",
    projectId: raw.projectId || projectId,
    number: raw.number ?? raw.episodeNumber ?? raw.order ?? 0,
    title: raw.title || raw.name || `에피소드 ${raw.number || 0}`,
    status: status as any,
    completedSteps: completedSteps as any[],
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

/**
 * v1.0 캐릭터 데이터를 v2.1 형식으로 마이그레이션한다.
 * - references 배열 없으면 빈 배열
 * - v1.0의 appearance/visual 필드를 description에 병합
 * - outfitCatalog는 더 이상 사용하지 않음 (OutfitEntry로 대체)
 */
function migrateCharacter(raw: Record<string, any>, projectId: string): Character {
  // v1.0에 있을 수 있는 다양한 필드명 매핑
  const description = raw.description || raw.bio || raw.backstory || "";
  const promptSnippet = raw.defaultPromptSnippet || raw.promptSnippet || raw.prompt || raw.appearance || "";

  // references 마이그레이션: 없으면 빈 배열, 있으면 v2.1 형식으로 정규화
  let references: ReferenceImage[] = [];
  if (Array.isArray(raw.references)) {
    references = raw.references.map((ref: any) => ({
      id: ref.id || `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      storageUrl: ref.storageUrl || ref.url || ref.imageUrl || "",
      tags: ref.tags || { emotion: "neutral", outfit: "default", angle: "front" },
      sourceEpisode: ref.sourceEpisode || "manual",
      sourcePanel: ref.sourcePanel ?? 0,
      usageCount: ref.usageCount ?? 0,
      quality: ref.quality ?? 3,
      createdAt: ref.createdAt || Date.now(),
    }));
  } else if (raw.referenceImageUrl || raw.imageUrl) {
    // v1.0: 단일 이미지 URL만 있던 경우
    references = [{
      id: `ref_migrated_${Date.now()}`,
      storageUrl: raw.referenceImageUrl || raw.imageUrl,
      tags: { emotion: "neutral", outfit: "default", angle: "front" },
      sourceEpisode: "migrated_from_v1",
      sourcePanel: 0,
      usageCount: 0,
      quality: 3,
      createdAt: raw.createdAt || Date.now(),
    }];
  }

  // outfitCatalog는 더 이상 사용하지 않음 — OutfitEntry로 대체됨

  return {
    id: raw.id || "",
    projectId: raw.projectId || projectId,
    name: raw.name || raw.characterName || "이름 없음",
    description,
    defaultPromptSnippet: promptSnippet,
    characterCore: raw.characterCore || undefined,
    baseRefImageId: raw.baseRefImageId || undefined,
    references,
    ...(raw.currentOutfitId ? { currentOutfitId: raw.currentOutfitId } : {}),
    ...(raw.traits ? { traits: raw.traits } : {}),
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

/**
 * v1.0 로케이션 데이터를 v2.1 형식으로 마이그레이션한다.
 */
function migrateLocation(raw: Record<string, any>, projectId: string): Location {
  let references: ReferenceImage[] = [];
  if (Array.isArray(raw.references)) {
    references = raw.references.map((ref: any) => ({
      id: ref.id || `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      storageUrl: ref.storageUrl || ref.url || ref.imageUrl || "",
      tags: ref.tags || { timeOfDay: "afternoon" },
      sourceEpisode: ref.sourceEpisode || "manual",
      sourcePanel: ref.sourcePanel ?? 0,
      usageCount: ref.usageCount ?? 0,
      quality: ref.quality ?? 3,
      createdAt: ref.createdAt || Date.now(),
    }));
  } else if (raw.referenceImageUrl || raw.imageUrl) {
    references = [{
      id: `ref_migrated_${Date.now()}`,
      storageUrl: raw.referenceImageUrl || raw.imageUrl,
      tags: { timeOfDay: "afternoon" },
      sourceEpisode: "migrated_from_v1",
      sourcePanel: 0,
      usageCount: 0,
      quality: 3,
      createdAt: raw.createdAt || Date.now(),
    }];
  }

  return {
    id: raw.id || "",
    projectId: raw.projectId || projectId,
    name: raw.name || raw.locationName || "이름 없음",
    description: raw.description || "",
    defaultPromptSnippet: raw.defaultPromptSnippet || raw.promptSnippet || raw.prompt || "",
    references,
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

// ─── 프로젝트 CRUD ──────────────────────────────────────────

export async function fetchProjects(userId?: string): Promise<Project[]> {
  try {
    const { collection, query, where, getDocs } = await import("firebase/firestore");
    const db = getDb();

    // ownerId가 있는 프로젝트는 필터, 없는 프로젝트(v1 호환)는 모두 포함
    const colRef = collection(db, "webtoon_projects");
    const snap = await getDocs(colRef);

    return snap.docs.map((doc) => migrateProject({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("[Firebase] fetchProjects error:", error);
    return [];
  }
}

/**
 * 프로젝트 추가 또는 업데이트
 */
export async function saveProject(project: Project): Promise<void> {
  try {
    const { collection, setDoc, doc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), project.id);
    const timestamp = new Date().toISOString();
    const dataToSave = {
      ...project,
      updatedAt: timestamp,
      ...(!(project as any).createdAt && { createdAt: timestamp }),
    };

    await setDoc(projectRef, dataToSave);
    console.log("[Firebase] Project saved:", project.id);
  } catch (error) {
    console.error("[Firebase] saveProject error:", error);
    throw error;
  }
}

/**
 * 프로젝트 삭제 (하위 컬렉션 포함)
 */
export async function deleteProject(projectId: string): Promise<void> {
  try {
    const { collection, deleteDoc, doc, getDocs, writeBatch } = await import(
      "firebase/firestore"
    );
    const db = getDb();

    const batch = writeBatch(db);
    const projectRef = doc(collection(db, "webtoon_projects"), projectId);

    // Delete subcollections
    const subcollections = [
      "episodes",
      "characters",
      "locations",
      "figma_exports",
      "context_chains",
    ];

    for (const subcolName of subcollections) {
      const subcolRef = collection(projectRef, subcolName);
      const subDocs = await getDocs(subcolRef);
      subDocs.forEach((subDoc) => {
        batch.delete(subDoc.ref);
      });
    }

    // Delete project itself
    batch.delete(projectRef);
    await batch.commit();

    console.log("[Firebase] Project deleted:", projectId);
  } catch (error) {
    console.error("[Firebase] deleteProject error:", error);
    throw error;
  }
}

// ─── 에피소드 CRUD ───────────────────────────────────────────

/**
 * 프로젝트의 모든 에피소드 조회
 */
export async function fetchEpisodes(projectId: string): Promise<Episode[]> {
  try {
    const { collection, doc, getDocs } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const episodesRef = collection(projectRef, "episodes");
    const snap = await getDocs(episodesRef);

    return snap.docs.map((doc) => migrateEpisode({ id: doc.id, ...doc.data() }, projectId));
  } catch (error) {
    console.error("[Firebase] fetchEpisodes error:", error);
    return [];
  }
}

/**
 * 에피소드 추가 또는 업데이트
 */
export async function saveEpisode(
  projectId: string,
  episode: Episode
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const episodeRef = doc(collection(projectRef, "episodes"), episode.id);
    const timestamp = new Date().toISOString();
    const dataToSave = {
      ...episode,
      updatedAt: timestamp,
      ...(!(episode as any).createdAt && { createdAt: timestamp }),
    };

    await setDoc(episodeRef, dataToSave);
    console.log("[Firebase] Episode saved:", projectId, episode.id);
  } catch (error) {
    console.error("[Firebase] saveEpisode error:", error);
    throw error;
  }
}

/**
 * 에피소드 삭제
 */
export async function deleteEpisode(
  projectId: string,
  episodeId: string
): Promise<void> {
  try {
    const { collection, doc, deleteDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const episodeRef = doc(collection(projectRef, "episodes"), episodeId);

    await deleteDoc(episodeRef);
    console.log("[Firebase] Episode deleted:", projectId, episodeId);
  } catch (error) {
    console.error("[Firebase] deleteEpisode error:", error);
    throw error;
  }
}

// ─── 파이프라인 데이터 (씬 분석 결과 저장) ──────────────────

/**
 * 에피소드의 파이프라인 데이터 저장 (씬 텍스트, 분석 결과, 패널 프롬프트, 이미지 등)
 */
export async function savePipelineSnapshot(
  projectId: string,
  episodeId: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const episodeRef = doc(collection(projectRef, "episodes"), episodeId);
    const snapshotRef = doc(collection(episodeRef, "pipeline"), "snapshot");

    await setDoc(snapshotRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    console.log("[Firebase] Pipeline snapshot saved:", projectId, episodeId);
  } catch (error) {
    console.error("[Firebase] savePipelineSnapshot error:", error);
    throw error;
  }
}

/**
 * 에피소드의 파이프라인 데이터 불러오기
 */
export async function loadPipelineSnapshot(
  projectId: string,
  episodeId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { collection, doc, getDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const episodeRef = doc(collection(projectRef, "episodes"), episodeId);
    const snapshotRef = doc(collection(episodeRef, "pipeline"), "snapshot");

    const snap = await getDoc(snapshotRef);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      console.log("[Firebase] Pipeline snapshot loaded:", projectId, episodeId);

      // snapshot에 v1BubblesByPanel이 없으면 figma_sync에서 bubbles 보충
      // _migratedFromV1 플래그가 있거나, v1.0 패턴(editingPanels 설명이 "v1.0 패널"로 시작)이면 보충 시도
      const isV1 = data._migratedFromV1 || (
        Array.isArray(data.editingPanels) &&
        (data.editingPanels as any[]).length > 0 &&
        ((data.editingPanels as any[])[0]?.description || "").startsWith("v1.0 패널")
      );
      if (!data.v1BubblesByPanel && isV1) {
        console.log("[Firebase] v1 snapshot에 bubbles 누락 → figma_sync에서 보충 시도");
        const v1Data = await loadPipelineFromV1FigmaSync(projectId, episodeId);
        if (v1Data && (v1Data as any).v1Bubbles) {
          data.v1Bubbles = (v1Data as any).v1Bubbles;
          data.v1BubblesByPanel = (v1Data as any).v1BubblesByPanel;
          data.v1PageSize = (v1Data as any).v1PageSize;
          data.v1PageSizeByPanel = (v1Data as any).v1PageSizeByPanel;
        }
      }
      return data;
    }

    // ── v1.0 폴백: figma_sync/queue에서 이미지 복원 ──
    console.log("[Firebase] Pipeline snapshot 없음 → v1.0 figma_sync 폴백 시도:", projectId, episodeId);
    return await loadPipelineFromV1FigmaSync(projectId, episodeId);
  } catch (error) {
    console.error("[Firebase] loadPipelineSnapshot error:", error);
    return null;
  }
}

/**
 * v1.0 figma_sync/queue에서 패널 이미지를 읽어 v2.1 파이프라인 형식으로 변환
 * v1.0은 figma_sync/queue/payload 안에 images[], bubbles[] 형태로 저장함
 */
async function loadPipelineFromV1FigmaSync(
  projectId: string,
  episodeId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { collection, doc, getDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const queueRef = doc(collection(projectRef, "figma_sync"), "queue");
    const queueSnap = await getDoc(queueRef);

    if (!queueSnap.exists()) return null;

    const queueData = queueSnap.data();
    const payload = queueData?.payload;
    if (!payload) return null;

    // v1.0은 한 번에 하나의 에피소드만 queue에 저장하며, episodeNum으로 식별
    const queueEpNum = String(payload.episodeNum || "");
    // episodeId가 숫자 혹은 ep_ 접두사일 수 있으므로 숫자 부분만 추출하여 비교
    const requestedEpNum = episodeId.replace(/\D/g, "") || episodeId;
    if (queueEpNum && requestedEpNum && queueEpNum !== requestedEpNum) {
      console.log(`[Firebase] v1 figma_sync episodeNum(${queueEpNum}) ≠ requested(${requestedEpNum}), 스킵`);
      return null;
    }

    const images: any[] = payload.images || [];
    if (images.length === 0) return null;

    // v1.0 images → v2.1 generatedImages (pageIndex별 그룹핑)
    // images는 pageIndex별로 여러 개 있을 수 있음 (패널 분할)
    // v2.1의 generatedImages는 Record<number, string> (인덱스 → URL)
    const generatedImages: Record<number, string> = {};
    images.forEach((img: any, idx: number) => {
      if (img.storageUrl) {
        generatedImages[idx] = img.storageUrl;
      }
    });

    // v1.0 bubbles 보존 + sceneText 구성
    const rawBubbles: any[] = payload.bubbles || [];
    const sceneText = rawBubbles
      .filter((b: any) => b.text)
      .map((b: any) => b.text)
      .join("\n");

    // 이미지 bounds로 패널 y범위 맵 구축 (v1.0은 단일 페이지 수직 스트립)
    const panelRanges = images.map((img: any, idx: number) => {
      const b = img.bounds || {};
      const y = Number(b.y) || 0;
      const h = Number(b.h) || 1000;
      return { idx, yStart: y, yEnd: y + h };
    });

    // 버블의 y좌표로 가장 가까운 패널 매핑
    function findPanelForBubble(bubbleY: number): number {
      // 범위 내 패널 찾기 (여유값 100px)
      for (const r of panelRanges) {
        if (bubbleY >= r.yStart && bubbleY < r.yEnd + 100) return r.idx;
      }
      // 범위 밖이면 가장 가까운 패널
      let minDist = Infinity, nearest = 0;
      for (const r of panelRanges) {
        const mid = (r.yStart + r.yEnd) / 2;
        const dist = Math.abs(bubbleY - mid);
        if (dist < minDist) { minDist = dist; nearest = r.idx; }
      }
      return nearest;
    }

    // v1.0 bubbles를 BubbleData 형식으로 정규화 (undefined 제거하여 Firestore 호환)
    const v1BubblesByPanel: Record<number, any[]> = {};
    const v1Bubbles: any[] = [];

    rawBubbles.forEach((b: any, oi: number) => {
      const absY = Number(b.position?.y) || 0;
      const absX = Number(b.position?.x) || 0;
      const panelIdx = findPanelForBubble(absY);
      const panelRange = panelRanges[panelIdx];

      // 패널 로컬 좌표로 변환
      const localY = absY - (panelRange?.yStart || 0);
      const localX = absX;

      // style에서 undefined 값 제거 (Firestore는 undefined 불가)
      const style: Record<string, any> = {
        fontSize: Number(b.style?.fontSize) || 16,
        fontFamily: b.style?.fontFamily || "Pretendard",
        color: b.style?.color || "#000000",
      };
      if (b.style?.fontWeight) style.fontWeight = b.style.fontWeight;
      if (b.style?.strokeColor) style.strokeColor = b.style.strokeColor;
      if (Number(b.style?.strokeWidth)) style.strokeWidth = Number(b.style.strokeWidth);
      if (Number(b.style?.rotation)) style.rotation = Number(b.style.rotation);
      if (Number(b.style?.skewX)) style.skewX = Number(b.style.skewX);

      const bubble = {
        id: b.id || `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: b.type || "dialogue",
        text: b.text || "",
        position: { x: localX, y: localY },
        size: { w: Number(b.size?.w) || 200, h: Number(b.size?.h) || 60 },
        style,
        pageIndex: panelIdx,
        objectIndex: oi,
      };

      v1Bubbles.push(bubble);
      if (!v1BubblesByPanel[panelIdx]) v1BubblesByPanel[panelIdx] = [];
      v1BubblesByPanel[panelIdx].push(bubble);
    });

    // 각 패널의 pageSize를 해당 이미지 bounds 기반으로 저장
    const v1PageSizeByPanel: Record<number, { w: number; h: number }> = {};
    panelRanges.forEach(r => {
      const img = images[r.idx];
      const b = img?.bounds || {};
      v1PageSizeByPanel[r.idx] = { w: Number(b.w) || 800, h: Number(b.h) || 1067 };
    });

    console.log(`[Firebase] v1.0 figma_sync → 패널 ${Object.keys(generatedImages).length}개, 말풍선 ${v1Bubbles.length}개 복원 (${Object.keys(v1BubblesByPanel).length}개 패널에 분배)`);

    // v1.0 이미지를 편집 패널 형태로 변환
    const editingPanels = images.map((img: any, idx: number) => ({
      panelIndex: idx,
      description: `v1.0 패널 ${idx + 1}`,
      characters: [],
      cameraAngle: "medium shot",
      bounds: img.bounds || null,
    }));

    // v2.1 파이프라인이 step3으로 전환되려면 analysis 객체가 필요
    const analysis = {
      characters: [],
      location: { name: "v1.0 마이그레이션", description: "" },
      mood: "neutral",
      panels: editingPanels.map((_: any, idx: number) => ({
        panelIndex: idx,
        description: `v1.0 패널 ${idx + 1}`,
        characters: [],
        cameraAngle: "medium shot",
      })),
      _migratedFromV1: true,
    };

    return {
      generatedImages,
      sceneText,
      editingPanels,
      panelPrompts: {},
      refImages: {},
      analysisMode: "local",
      analysis,
      savedAt: Date.now(),
      _migratedFromV1: true,
      v1Bubbles,
      v1BubblesByPanel,
      v1PageSize: payload.pageSize || { w: 800, h: 1067 },
      v1PageSizeByPanel,
    };
  } catch (error) {
    console.error("[Firebase] loadPipelineFromV1FigmaSync error:", error);
    return null;
  }
}

// ─── 레퍼런스 CRUD ───────────────────────────────────────────

/**
 * 프로젝트의 모든 캐릭터 조회
 */
export async function fetchCharacters(projectId: string): Promise<Character[]> {
  try {
    const { collection, doc, getDocs, deleteDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const charsRef = collection(projectRef, "characters");
    const snap = await getDocs(charsRef);

    if (snap.docs.length > 0) {
      const allChars = snap.docs.map((d) => migrateCharacter({ id: d.id, ...d.data() }, projectId));
      // ── 이름 기준 중복 제거: 가장 먼저 생성된 캐릭터를 유지, 나머지는 Firestore에서 삭제 ──
      const seen = new Map<string, Character>();
      const duplicateIds: string[] = [];
      for (const ch of allChars) {
        const key = ch.name.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, ch);
        } else {
          // 레퍼런스 이미지가 더 많은 쪽을 유지
          const existing = seen.get(key)!;
          if ((ch.references?.length || 0) > (existing.references?.length || 0)) {
            duplicateIds.push(existing.id);
            seen.set(key, ch);
          } else {
            duplicateIds.push(ch.id);
          }
        }
      }
      // 중복 문서 비동기 삭제
      if (duplicateIds.length > 0) {
        console.log(`[Firebase] 중복 캐릭터 ${duplicateIds.length}개 삭제:`, duplicateIds);
        Promise.all(
          duplicateIds.map((id) => deleteDoc(doc(charsRef, id)))
        ).catch((e) => console.error("[Firebase] 중복 캐릭터 삭제 오류:", e));
      }
      return Array.from(seen.values());
    }

    // ── v1.0 폴백: episodeOutfits에서 캐릭터 추출 ──
    console.log("[Firebase] characters 서브컬렉션 비어있음 → v1.0 episodeOutfits 폴백:", projectId);
    return await extractCharactersFromV1Episodes(projectId);
  } catch (error) {
    console.error("[Firebase] fetchCharacters error:", error);
    return [];
  }
}

/**
 * v1.0 에피소드의 episodeOutfits에서 캐릭터를 추출하여 v2.1 Character 형식으로 변환
 */
async function extractCharactersFromV1Episodes(projectId: string): Promise<Character[]> {
  try {
    const { collection, doc, getDocs } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const episodesRef = collection(projectRef, "episodes");
    const epSnap = await getDocs(episodesRef);

    // 모든 에피소드의 episodeOutfits를 병합하여 유니크 캐릭터 추출
    const charMap = new Map<string, { id: string; outfit: string }>();

    epSnap.docs.forEach((epDoc) => {
      const data = epDoc.data();
      const outfits = data.episodeOutfits || {};
      for (const [charId, val] of Object.entries(outfits)) {
        if (!charMap.has(charId)) {
          const outfitText = typeof val === "string" ? val
            : (val as any)?.outfit || JSON.stringify(val);
          charMap.set(charId, { id: charId, outfit: outfitText });
        }
      }
    });

    if (charMap.size === 0) return [];

    console.log(`[Firebase] v1.0 episodeOutfits에서 캐릭터 ${charMap.size}개 추출`);

    const now = Date.now();
    return Array.from(charMap.values()).map(({ id, outfit }) => ({
      id,
      projectId,
      name: id.replace(/^char_/, "캐릭터 "),
      description: "",
      defaultPromptSnippet: outfit,
      references: [],
      createdAt: now,
      updatedAt: now,
    }));
  } catch (error) {
    console.error("[Firebase] extractCharactersFromV1Episodes error:", error);
    return [];
  }
}

/**
 * 캐릭터 추가 또는 업데이트
 */
export async function saveCharacter(
  projectId: string,
  char: Character
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const { deleteField: firestoreDeleteField } = await import("firebase/firestore");
    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const charRef = doc(collection(projectRef, "characters"), char.id);
    const timestamp = new Date().toISOString();
    const raw = {
      ...char,
      updatedAt: timestamp,
      ...(!(char as any).createdAt && { createdAt: timestamp }),
    };
    // outfitCatalog 레거시 필드 제거 — OutfitEntry로 마이그레이션 완료
    delete (raw as any).outfitCatalog;
    // Firestore setDoc()는 어떤 depth에서든 undefined를 거부 → 재귀 제거
    const dataToSave = deepRemoveUndefined(raw) as Record<string, unknown>;
    // Firestore에서 outfitCatalog 필드를 완전히 삭제 (merge 모드)
    (dataToSave as any).outfitCatalog = firestoreDeleteField();

    await setDoc(charRef, dataToSave, { merge: true });
    console.log("[Firebase] Character saved:", projectId, char.id);
  } catch (error) {
    console.error("[Firebase] saveCharacter error:", error);
    throw error;
  }
}

/**
 * 캐릭터 삭제
 */
export async function deleteCharacter(
  projectId: string,
  characterId: string
): Promise<void> {
  try {
    const { collection, doc, deleteDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const charRef = doc(collection(projectRef, "characters"), characterId);

    await deleteDoc(charRef);
    console.log("[Firebase] Character deleted:", projectId, characterId);
  } catch (error) {
    console.error("[Firebase] deleteCharacter error:", error);
    throw error;
  }
}

/**
 * 프로젝트의 모든 로케이션 조회
 */
export async function fetchLocations(projectId: string): Promise<Location[]> {
  try {
    const { collection, doc, getDocs } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const locsRef = collection(projectRef, "locations");
    const snap = await getDocs(locsRef);

    return snap.docs.map((doc) => migrateLocation({ id: doc.id, ...doc.data() }, projectId));
  } catch (error) {
    console.error("[Firebase] fetchLocations error:", error);
    return [];
  }
}

/**
 * 로케이션 추가 또는 업데이트
 */
export async function saveLocation(
  projectId: string,
  loc: Location
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const locRef = doc(collection(projectRef, "locations"), loc.id);
    const timestamp = new Date().toISOString();
    const raw = {
      ...loc,
      updatedAt: timestamp,
      ...(!(loc as any).createdAt && { createdAt: timestamp }),
    };
    // Firestore setDoc()는 어떤 depth에서든 undefined를 거부 → 재귀 제거
    const dataToSave = deepRemoveUndefined(raw) as Record<string, unknown>;

    await setDoc(locRef, dataToSave);
    console.log("[Firebase] Location saved:", projectId, loc.id);
  } catch (error) {
    console.error("[Firebase] saveLocation error:", error);
    throw error;
  }
}

/**
 * 장소 삭제
 */
export async function deleteLocation(
  projectId: string,
  locationId: string
): Promise<void> {
  try {
    const { collection, doc, deleteDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const locRef = doc(collection(projectRef, "locations"), locationId);

    await deleteDoc(locRef);
    console.log("[Firebase] Location deleted:", projectId, locationId);
  } catch (error) {
    console.error("[Firebase] deleteLocation error:", error);
    throw error;
  }
}

// ─── Outfit Library CRUD ────────────────────────────────────
// Architecture: webtoon_projects/{projectId}/outfits/{outfitId}

/**
 * 프로젝트의 의상 라이브러리 전체 로드
 */
export async function fetchOutfits(projectId: string): Promise<OutfitEntry[]> {
  try {
    const { collection, doc, getDocs } = await import("firebase/firestore");
    const db = getDb();
    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const outfitsRef = collection(projectRef, "outfits");
    const snap = await getDocs(outfitsRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as OutfitEntry));
  } catch (error) {
    console.error("[Firebase] fetchOutfits error:", error);
    return [];
  }
}

/**
 * 의상 엔트리 저장 (생성/갱신)
 */
export async function saveOutfit(
  projectId: string,
  outfit: OutfitEntry
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();
    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const outfitRef = doc(collection(projectRef, "outfits"), outfit.id);
    await setDoc(outfitRef, { ...outfit, updatedAt: Date.now() });
    console.log("[Firebase] Outfit saved:", outfit.id);
  } catch (error) {
    console.error("[Firebase] saveOutfit error:", error);
    throw error;
  }
}

/**
 * 의상 엔트리 삭제
 */
export async function deleteOutfit(
  projectId: string,
  outfitId: string
): Promise<void> {
  try {
    const { collection, doc, deleteDoc } = await import("firebase/firestore");
    const db = getDb();
    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const outfitRef = doc(collection(projectRef, "outfits"), outfitId);
    await deleteDoc(outfitRef);
    console.log("[Firebase] Outfit deleted:", outfitId);
  } catch (error) {
    console.error("[Firebase] deleteOutfit error:", error);
    throw error;
  }
}

// ─── Context Chain CRUD ─────────────────────────────────────

/**
 * Context Chain 저장 (에피소드별 씬 연속성 추적)
 * Architecture: context_chains/{episodeId}
 */
export async function saveContextChain(
  projectId: string,
  episodeId: string,
  chain: any
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const chainRef = doc(collection(projectRef, "context_chains"), episodeId);
    await setDoc(chainRef, { ...chain, updatedAt: new Date().toISOString() });
    console.log("[Firebase] Context chain saved:", projectId, episodeId);
  } catch (error) {
    console.error("[Firebase] saveContextChain error:", error);
  }
}

/**
 * Context Chain 로드
 */
export async function loadContextChain(
  projectId: string,
  episodeId: string
): Promise<any | null> {
  try {
    const { collection, doc, getDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const chainRef = doc(collection(projectRef, "context_chains"), episodeId);
    const snap = await getDoc(chainRef);

    if (snap.exists()) {
      console.log("[Firebase] Context chain loaded:", projectId, episodeId);
      return snap.data();
    }
    return null;
  } catch (error) {
    console.error("[Firebase] loadContextChain error:", error);
    return null;
  }
}

// ─── Firebase Storage (이미지) ───────────────────────────────
// v2.1: Base64 → URL 기반으로 전환
// 모든 이미지는 Storage에 업로드 후 URL만 Firestore에 저장

/**
 * 이미지 파일을 Firebase Storage(GCS)에 업로드하고 다운로드 URL 반환
 * Vertex Access Token이 있으면 GCS REST API 사용 (Firebase Auth 불필요)
 * 없으면 Firebase SDK fallback
 */
export async function uploadImage(
  path: string,
  file: File | Blob
): Promise<string> {
  const accessToken = localStorage.getItem("VERTEX_ACCESS_TOKEN") || "";

  // ── GCS REST API (Vertex Access Token) ──
  if (accessToken && accessToken.startsWith("ya29.")) {
    try {
      const cfg = getFirebaseConfig();
      const bucket = cfg?.storageBucket || "rhivclass.firebasestorage.app";
      const encodedPath = encodeURIComponent(path);
      const contentType = file.type || "image/png";
      const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Authorization": `Bearer ${accessToken}`,
        },
        body: file,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GCS upload failed (${res.status}): ${errText.substring(0, 300)}`);
      }

      // GCS 공개 다운로드 URL 생성 (Firebase Storage 형식)
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
      console.log("[Firebase] Image uploaded via GCS REST:", path);
      return downloadUrl;
    } catch (gcsErr) {
      console.warn("[Firebase] GCS REST upload failed, trying Firebase SDK:", gcsErr);
    }
  }

  // ── Firebase SDK fallback ──
  try {
    const { ref: storageRef, uploadBytes, getDownloadURL } = await import(
      "firebase/storage"
    );
    const storage = getStorageInstance();

    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    console.log("[Firebase] Image uploaded via SDK:", path);
    return url;
  } catch (error) {
    console.error("[Firebase] uploadImage error:", error);
    throw error;
  }
}

/**
 * Firebase Storage에서 이미지 삭제
 */
export async function deleteImage(path: string): Promise<void> {
  try {
    const { ref: storageRef, deleteObject } = await import("firebase/storage");
    const storage = getStorageInstance();

    const fileRef = storageRef(storage, path);
    await deleteObject(fileRef);

    console.log("[Firebase] Image deleted:", path);
  } catch (error) {
    console.error("[Firebase] deleteImage error:", error);
    throw error;
  }
}

// ─── Figma 내보내기 관리 ────────────────────────────────────

/**
 * 에피소드의 Figma 내보내기 메타데이터 조회
 */
export async function fetchFigmaExport(
  projectId: string,
  episodeId: string
): Promise<any> {
  try {
    const { collection, doc, getDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const exportRef = doc(
      collection(projectRef, "figma_exports"),
      episodeId
    );
    const snap = await getDoc(exportRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (error) {
    console.error("[Firebase] fetchFigmaExport error:", error);
    return null;
  }
}

/**
 * Figma 내보내기 메타데이터 저장
 */
export async function saveFigmaExport(
  projectId: string,
  episodeId: string,
  data: any
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const exportRef = doc(
      collection(projectRef, "figma_exports"),
      episodeId
    );
    const timestamp = new Date().toISOString();
    const dataToSave = {
      ...data,
      updatedAt: timestamp,
      ...(!(data as any).createdAt && { createdAt: timestamp }),
    };

    await setDoc(exportRef, dataToSave);
    console.log("[Firebase] Figma export saved:", projectId, episodeId);
  } catch (error) {
    console.error("[Firebase] saveFigmaExport error:", error);
    throw error;
  }
}

// ─── 패널 결과 저장 ──────────────────────────────────────────

/**
 * 생성된 패널 결과 일괄 저장
 */
export async function savePanelResults(
  projectId: string,
  episodeId: string,
  panels: GeneratedPanel[]
): Promise<void> {
  try {
    const { collection, doc, writeBatch } = await import("firebase/firestore");
    const db = getDb();

    const batch = writeBatch(db);
    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const timestamp = new Date().toISOString();

    panels.forEach((panel, idx) => {
      const panelRef = doc(
        collection(projectRef, "episodes"),
        episodeId,
        "panels",
        (panel as any).id || `panel_${idx}`
      );
      batch.set(panelRef, {
        ...panel,
        savedAt: timestamp,
      });
    });

    await batch.commit();
    console.log("[Firebase] Panel results saved:", projectId, episodeId, panels.length);
  } catch (error) {
    console.error("[Firebase] savePanelResults error:", error);
    throw error;
  }
}

// ─── 전체 스토리 분석 결과 저장/불러오기 ────────────────────────
// Firestore 경로: webtoon_projects/{projectId}/analysis/full_story_bible
// episodeTexts(원문 텍스트)는 저장하지 않음 (용량 절약)

/**
 * 전체 스토리 분석 결과를 Firestore에 저장합니다.
 * 크기 최적화: episodeTexts(원문 텍스트) 제외, 나머지 구조 데이터만 저장
 */
export async function saveFullStoryBible(
  projectId: string,
  result: {
    total_episodes: number;
    character_bible: unknown[];
    outfit_library: unknown[];
    location_library: unknown[];
    storyboard_overview: unknown;
    episodes: unknown[];
  }
): Promise<void> {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const analysisRef = doc(collection(projectRef, "analysis"), "full_story_bible");

    // episodeTexts 는 저장하지 않음 (원문 텍스트 — 매우 클 수 있음)
    const dataToSave = {
      total_episodes: result.total_episodes,
      character_bible: result.character_bible,
      outfit_library: result.outfit_library,
      location_library: result.location_library,
      storyboard_overview: result.storyboard_overview,
      episodes: result.episodes,
      savedAt: Date.now(),
    };

    await setDoc(analysisRef, dataToSave);
    console.log("[Firebase] Full story bible saved:", projectId, `(${result.total_episodes}화)`);
  } catch (error) {
    console.error("[Firebase] saveFullStoryBible error:", error);
    throw error;
  }
}

/**
 * 저장된 전체 스토리 분석 결과를 Firestore에서 불러옵니다.
 * 없으면 null 반환.
 */
export async function loadFullStoryBible(
  projectId: string
): Promise<{
  total_episodes: number;
  character_bible: unknown[];
  outfit_library: unknown[];
  location_library: unknown[];
  storyboard_overview: unknown;
  episodes: unknown[];
  savedAt?: number;
} | null> {
  try {
    const { collection, doc, getDoc } = await import("firebase/firestore");
    const db = getDb();

    const projectRef = doc(collection(db, "webtoon_projects"), projectId);
    const analysisRef = doc(collection(projectRef, "analysis"), "full_story_bible");

    const snap = await getDoc(analysisRef);
    if (!snap.exists()) {
      console.log("[Firebase] No full story bible found for project:", projectId);
      return null;
    }

    const data = snap.data() as {
      total_episodes: number;
      character_bible: unknown[];
      outfit_library: unknown[];
      location_library: unknown[];
      storyboard_overview: unknown;
      episodes: unknown[];
      savedAt?: number;
    };
    console.log("[Firebase] Full story bible loaded:", projectId, `(${data.total_episodes}화)`);
    return data;
  } catch (error) {
    console.error("[Firebase] loadFullStoryBible error:", error);
    return null;
  }
}

// ─── 내보내기 ────────────────────────────────────────────────

export const firebaseService = {
  // 초기화 & 설정 (v1 호환)
  initFirebase,
  getFirebaseConfig,
  saveFirebaseConfig,
  autoLoadServerConfig,
  // API 키 관리
  saveApiKeys,
  waitForApiKeySync,
  getVertexConfig,
  fetchFreshToken,
  hasGeminiKey,
  hasXaiKey,
  getXaiKey,
  hasStabilityKey,
  getStabilityKey,
  getKieKey,
  getSirayKey,
  // Context Chain CRUD
  saveContextChain,
  loadContextChain,
  // 프로젝트 CRUD
  fetchProjects,
  saveProject,
  deleteProject,
  // 에피소드 CRUD
  fetchEpisodes,
  saveEpisode,
  deleteEpisode,
  // 파이프라인 데이터
  savePipelineSnapshot,
  loadPipelineSnapshot,
  // 전체 스토리 분석 바이블
  saveFullStoryBible,
  loadFullStoryBible,
  // 레퍼런스 CRUD
  fetchCharacters,
  saveCharacter,
  deleteCharacter,
  fetchLocations,
  saveLocation,
  deleteLocation,
  // Storage
  uploadImage,
  deleteImage,
  // Figma 연동
  fetchFigmaExport,
  saveFigmaExport,
  savePanelResults,
};
