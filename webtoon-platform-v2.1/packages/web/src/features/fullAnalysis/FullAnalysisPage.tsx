// ============================================================
// FullAnalysisPage.tsx — 전체 스토리 일괄 분석 페이지
// 1화~N화 텍스트 파일을 업로드하면 AI가 전체를 분석하고
// 캐릭터/장소/에피소드를 자동으로 생성합니다.
// ============================================================

import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  analyzeFullStory,
  createEpisodesFromAnalysis,
  type FullStoryAnalysisResult,
  type AnalysisProgress,
  type UpsertStats,
} from "@/services/fullStoryAnalysisService";
import {
  GEMINI_MODELS,
  getCurrentModelId,
  setGeminiModel,
  getGeminiAuthMode,
  type GeminiModelId,
} from "@/services/geminiService";
import { useReferenceStore } from "@/stores/referenceStore";
import { useEpisodeStore } from "@/stores/episodeStore";
import type { Episode } from "@webtoon/shared/types";

// ─── 진행 단계 레이블 ────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  idle: "대기 중",
  uploading: "파일 읽는 중...",
  splitting: "화별 분리 중...",
  phase1_bible: "Phase 1: 캐릭터/의상/장소 바이블 추출 중...",
  phase2_scenes: "Phase 2: 화별 씬 정밀 분석 중...",
  parsing: "결과 정리 중...",
  creating_references: "레퍼런스 생성 중...",
  creating_episodes: "에피소드 생성 중...",
  done: "완료!",
  error: "오류 발생",
};

const NARRATIVE_MODE_LABELS: Record<string, string> = {
  normal: "일반",
  flashback: "회상",
  imagination: "상상",
  dream_sequence: "꿈",
  other: "기타",
};

const NARRATIVE_MODE_COLORS: Record<string, string> = {
  normal: "#6B7280",
  flashback: "#92400E",
  imagination: "#7C3AED",
  dream_sequence: "#1D4ED8",
  other: "#374151",
};

// ─── 컴포넌트 ────────────────────────────────────────────────

export function FullAnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [storyText, setStoryText] = useState<string>("");
  const [charCount, setCharCount] = useState(0);

  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(() => getCurrentModelId());
  const [progress, setProgress] = useState<AnalysisProgress>({ step: "idle", message: "", progress: 0 });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<FullStoryAnalysisResult | null>(null);
  const [createdEpisodes, setCreatedEpisodes] = useState<Episode[]>([]);
  const [upsertStats, setUpsertStats] = useState<UpsertStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setCharacters, setLocations } = useReferenceStore();
  const { setEpisodes } = useEpisodeStore();

  // ─── 파일 읽기 ─────────────────────────────────────────────

  const readFile = (file: File) => {
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
      setError("텍스트 파일(.txt, .md)만 지원합니다.");
      return;
    }
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      setStoryText(text);
      setCharCount(text.length);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  // ─── 모델 선택 ─────────────────────────────────────────────

  const handleModelSelect = (modelId: GeminiModelId) => {
    setSelectedModel(modelId);
    setGeminiModel(modelId);
  };

  // ─── 분석 실행 ─────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!storyText.trim()) {
      setError("스토리 파일을 먼저 업로드해주세요.");
      return;
    }
    if (!projectId) {
      setError("프로젝트를 선택해주세요.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setCreatedEpisodes([]);
    setUpsertStats(null);

    try {
      // 1. AI 분석
      const result = await analyzeFullStory(storyText, setProgress);
      setAnalysisResult(result);

      // 2. Firebase에 에피소드/레퍼런스 생성
      const { createdEpisodes: eps, characters, locations, upsertStats: stats } = await createEpisodesFromAnalysis(
        projectId,
        result,
        setProgress
      );

      setCreatedEpisodes(eps);
      setUpsertStats(stats);

      // 3. Store 업데이트
      setCharacters(characters);
      setLocations(locations);
      setEpisodes(eps);

    } catch (e: any) {
      setError(e.message || "알 수 없는 오류가 발생했습니다.");
      setProgress({ step: "error", message: e.message, progress: 0, error: e.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── 렌더 ───────────────────────────────────────────────────

  const aiLabel = getGeminiAuthMode();
  const isDone = progress.step === "done";
  const isError = progress.step === "error";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 0" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", margin: "0 0 8px" }}>
          전체 스토리 일괄 분석
        </h1>
        <p style={{ color: "#6B7280", margin: 0, fontSize: 14 }}>
          1화~N화가 포함된 텍스트 파일을 업로드하면 AI가 전체를 분석하여 캐릭터, 장소, 에피소드, 스토리보드를 자동 생성합니다.
        </p>
      </div>

      {/* AI 상태 표시 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        background: "#F0FDF4",
        borderRadius: 8,
        border: "1px solid #BBF7D0",
        marginBottom: 20,
        fontSize: 13,
        color: "#166534",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
        {aiLabel} 연결됨 — 전체 스토리 분석 가능
      </div>

      {/* 모델 선택 */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>분석 모델 선택</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {GEMINI_MODELS.map((model) => {
            const isSelected = selectedModel === model.id;
            return (
              <button
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                  padding: "10px 14px",
                  border: isSelected ? "2px solid #7C3AED" : "1.5px solid #E5E7EB",
                  borderRadius: 10,
                  background: isSelected ? "#F5F3FF" : "#fff",
                  cursor: "pointer",
                  minWidth: 160,
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#7C3AED" : "#111" }}>
                  {model.provider === "kie" ? "🤖" : model.provider === "anthropic" ? "🔵" : "✨"}{" "}
                  {model.name}
                </span>
                <span style={{ fontSize: 11, color: "#6B7280" }}>{model.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 파일 업로드 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "#7C3AED" : fileName ? "#22C55E" : "#D1D5DB"}`,
          borderRadius: 12,
          padding: "40px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragging ? "#F5F3FF" : fileName ? "#F0FDF4" : "#FAFAFA",
          transition: "all 0.2s",
          marginBottom: 20,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {fileName ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, color: "#166534", fontSize: 15 }}>{fileName}</div>
            <div style={{ color: "#6B7280", fontSize: 13, marginTop: 4 }}>
              {charCount.toLocaleString()}자 로드됨 · 클릭하여 다시 선택
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
            <div style={{ fontWeight: 600, color: "#374151", fontSize: 15 }}>
              스토리 파일을 드래그하거나 클릭하여 업로드
            </div>
            <div style={{ color: "#9CA3AF", fontSize: 13, marginTop: 6 }}>
              .txt 또는 .md 파일 · 1화~N화 전체 포함
            </div>
          </>
        )}
      </div>

      {/* 직접 입력 옵션 */}
      {!fileName && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", margin: "0 0 8px" }}>— 또는 직접 입력 —</p>
          <textarea
            placeholder="1화~N화 스토리 전문을 여기에 붙여넣기..."
            value={storyText}
            onChange={(e) => {
              setStoryText(e.target.value);
              setCharCount(e.target.value.length);
            }}
            style={{
              width: "100%",
              height: 200,
              padding: 12,
              borderRadius: 10,
              border: "1.5px solid #E5E7EB",
              fontSize: 13,
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <div style={{ textAlign: "right", fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
            {charCount.toLocaleString()}자
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {error && (
        <div style={{
          padding: "12px 16px",
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: 8,
          color: "#DC2626",
          fontSize: 13,
          marginBottom: 16,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* 진행 상황 */}
      {isAnalyzing && (
        <div style={{
          padding: "16px 20px",
          background: "#F5F3FF",
          border: "1px solid #DDD6FE",
          borderRadius: 10,
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED" }}>
              {STEP_LABELS[progress.step] || progress.step}
            </span>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{progress.progress}%</span>
          </div>
          <div style={{ height: 6, background: "#EDE9FE", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%",
              background: "#7C3AED",
              borderRadius: 3,
              width: `${progress.progress}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
          {/* Phase 2: 화별 진행 표시 */}
          {progress.step === "phase2_scenes" && progress.totalEpisodes && (
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {Array.from({ length: progress.totalEpisodes }, (_, i) => {
                const epNum = i + 1;
                const isDone = (progress.currentEpisode || 0) > epNum;
                const isCurrent = progress.currentEpisode === epNum;
                return (
                  <div key={epNum} style={{
                    padding: "3px 8px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    background: isDone ? "#7C3AED" : isCurrent ? "#DDD6FE" : "#F3F4F6",
                    color: isDone ? "white" : isCurrent ? "#7C3AED" : "#9CA3AF",
                    border: isCurrent ? "1.5px solid #7C3AED" : "1.5px solid transparent",
                    transition: "all 0.2s",
                  }}>
                    {epNum}화 {isDone ? "✓" : isCurrent ? "⏳" : ""}
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>{progress.message}</p>
        </div>
      )}

      {/* 분석 버튼 */}
      {!isDone && (
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !storyText.trim()}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: isAnalyzing || !storyText.trim() ? "#C4B5FD" : "#7C3AED",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: isAnalyzing || !storyText.trim() ? "not-allowed" : "pointer",
            transition: "background 0.2s",
            marginBottom: 32,
          }}
        >
          {isAnalyzing ? "⏳ AI 분석 중..." : "🚀 전체 스토리 분석 시작"}
        </button>
      )}

      {/* 결과 표시 */}
      {isDone && analysisResult && (
        <div>
          {/* 요약 카드 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}>
            {[
              { icon: "📺", label: "총 화수", value: `${analysisResult.total_episodes}화` },
              { icon: "👤", label: "등장인물", value: `${analysisResult.character_bible.length}명` },
              { icon: "📍", label: "장소", value: `${analysisResult.location_library.length}개` },
              { icon: "👗", label: "의상", value: `${analysisResult.outfit_library.length}개` },
              { icon: "🎬", label: "총 패널", value: `${analysisResult.storyboard_overview.total_estimated_panels}개` },
            ].map((item) => (
              <div key={item.label} style={{
                padding: "16px 18px",
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{item.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED" }}>{item.value}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Upsert 결과 배지 */}
          {upsertStats && (
            <div style={{
              display: "flex",
              gap: 10,
              marginBottom: 20,
              flexWrap: "wrap",
            }}>
              {upsertStats.created > 0 && (
                <span style={{ padding: "4px 12px", background: "#D1FAE5", color: "#065F46", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                  ✨ {upsertStats.created}개 새로 생성됨
                </span>
              )}
              {upsertStats.updated > 0 && (
                <span style={{ padding: "4px 12px", background: "#DBEAFE", color: "#1E40AF", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                  🔄 {upsertStats.updated}개 업데이트됨
                </span>
              )}
              {upsertStats.skipped > 0 && (
                <span style={{ padding: "4px 12px", background: "#F3F4F6", color: "#6B7280", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                  ⏭ {upsertStats.skipped}개 변경 없음
                </span>
              )}
            </div>
          )}

          {/* 레퍼런스 갤러리 이동 안내 */}
          {projectId && (
            <div style={{
              background: "#F5F3FF",
              border: "1px solid #DDD6FE",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 700, color: "#5B21B6", fontSize: 15, marginBottom: 4 }}>
                  🖼️ 레퍼런스 이미지 생성
                </div>
                <div style={{ fontSize: 13, color: "#6B7280" }}>
                  캐릭터 {analysisResult.character_bible.length}명 · 장소 {analysisResult.location_library.length}개 · 의상 {analysisResult.outfit_library.length}개가 분석됐습니다.
                  레퍼런스 이미지는 <strong>레퍼런스 갤러리</strong>에서 생성할 수 있습니다.
                </div>
              </div>
              <Link
                to={`/project/${projectId}/references`}
                style={{
                  padding: "10px 20px",
                  background: "#7C3AED",
                  color: "white",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  flexShrink: 0,
                }}
              >
                🎨 레퍼런스 갤러리로 이동
              </Link>
            </div>
          )}

          {/* 캐릭터 바이블 */}
          {analysisResult.character_bible.length > 0 && (
            <Section title="캐릭터 바이블" icon="👤">
              {analysisResult.character_bible.map((c) => (
                <div key={c.name} style={cardStyle}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#111", marginBottom: 4 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{c.appearance_core}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                      {c.first_appear_episode}화 첫 등장 · 총 {c.total_appear_count}회 등장
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* 장소 라이브러리 */}
          {analysisResult.location_library.length > 0 && (
            <Section title="장소 라이브러리" icon="📍">
              {analysisResult.location_library.map((l, i) => (
                <div key={i} style={cardStyle}>
                  <div style={{ fontWeight: 600, color: "#111", marginBottom: 4 }}>{l.sub_category}</div>
                  <div style={{ fontSize: 11, color: "#7C3AED", marginBottom: 4 }}>
                    [{l.canonical_category}]
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{l.description}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{l.appear_count}회 등장</div>
                </div>
              ))}
            </Section>
          )}

          {/* 에피소드 목록 */}
          <Section title="생성된 에피소드" icon="📺">
            {analysisResult.episodes.map((ep) => (
              <div key={ep.episode_number} style={{
                ...cardStyle,
                cursor: projectId ? "pointer" : "default",
              }}
                onClick={() => {
                  if (!projectId) return;
                  const created = createdEpisodes.find(c => c.number === ep.episode_number);
                  if (created) navigate(`/project/${projectId}/episode/${created.id}/pipeline`);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#111", marginBottom: 2 }}>
                      {ep.episode_number}화 · {ep.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                      씬 {ep.total_scenes}개 · 패널 약 {
                        analysisResult.storyboard_overview.per_episode_panel_count[ep.episode_number - 1] || 0
                      }개
                    </div>
                    {/* 씬 내러티브 모드 뱃지 */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {Array.from(new Set(ep.scenes.map(s => s.narrative_mode))).map(mode => (
                        <span key={mode} style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: 11,
                          background: `${NARRATIVE_MODE_COLORS[mode]}20`,
                          color: NARRATIVE_MODE_COLORS[mode],
                          fontWeight: 600,
                        }}>
                          {NARRATIVE_MODE_LABELS[mode] || mode}
                        </span>
                      ))}
                    </div>
                  </div>
                  {projectId && (
                    <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 600, flexShrink: 0 }}>
                      바로가기 →
                    </span>
                  )}
                </div>

                {/* 주요 사건 */}
                {ep.key_events.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F3F4F6" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 }}>주요 사건</div>
                    {ep.key_events.slice(0, 3).map((ev, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#6B7280", marginBottom: 2 }}>• {ev}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>

          {/* 에피소드 페이지로 이동 버튼 */}
          {projectId && (
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <Link
                to={`/project/${projectId}`}
                style={{
                  flex: 1,
                  padding: "13px 20px",
                  background: "#7C3AED",
                  color: "white",
                  borderRadius: 10,
                  textAlign: "center",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                📖 에피소드 목록으로 이동
              </Link>
              <button
                onClick={() => {
                  setAnalysisResult(null);
                  setCreatedEpisodes([]);
                  setFileName(null);
                  setStoryText("");
                  setCharCount(0);
                  setProgress({ step: "idle", message: "", progress: 0 });
                }}
                style={{
                  padding: "13px 20px",
                  background: "#F3F4F6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                새 파일 분석
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 헬퍼 컴포넌트 ──────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  fontSize: 13,
  transition: "border-color 0.15s, box-shadow 0.15s",
};
