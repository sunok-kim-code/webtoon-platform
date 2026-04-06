// ============================================================
// EpisodePage — 에피소드 목록 & 관리 (v2.1)
// 마이그레이션 대상: index.html의 에피소드 관리 UI
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEpisodeStore } from "@/stores";
import { firebaseService, getFirebaseConfig, ensureFirebaseReady } from "@/services";
import type { Episode } from "@webtoon/shared";

/* ── localStorage fallback for episodes ── */
function localEpisodesKey(projectId: string) {
  return `webtoon_episodes_${projectId}`;
}
function loadLocalEpisodes(projectId: string): Episode[] {
  try {
    const raw = localStorage.getItem(localEpisodesKey(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveLocalEpisodes(projectId: string, episodes: Episode[]) {
  try { localStorage.setItem(localEpisodesKey(projectId), JSON.stringify(episodes)); } catch {}
}
function isFirebaseReady(): boolean {
  return !!getFirebaseConfig();
}

const STATUS_LABELS = {
  draft: { label: "초안", color: "#6B7280" },
  references_ready: { label: "레퍼런스 준비", color: "#3B82F6" },
  storyboard_ready: { label: "스토리보드 완성", color: "#F59E0B" },
  panels_generated: { label: "패널 생성됨", color: "#10B981" },
  in_figma: { label: "Figma 작업중", color: "#8B5CF6" },
  completed: { label: "완료", color: "#059669" },
};

export function EpisodePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    episodes,
    loading,
    setEpisodes,
    setActiveEpisode,
    setLoading,
  } = useEpisodeStore();
  const [showNewEpisodeForm, setShowNewEpisodeForm] = useState(false);
  const [newEpisodeData, setNewEpisodeData] = useState({
    title: "",
    number: episodes.length + 1,
  });
  const [deleteTarget, setDeleteTarget] = useState<Episode | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const loadEpisodes = async () => {
      setLoading(true);
      try {
        if (isFirebaseReady()) {
          await ensureFirebaseReady();
          const data = await firebaseService.fetchEpisodes(projectId);
          setEpisodes(data);
          saveLocalEpisodes(projectId, data); // backup locally
        } else {
          setEpisodes(loadLocalEpisodes(projectId));
        }
      } catch (err) {
        console.error("Failed to load episodes", err);
        // fallback to local
        setEpisodes(loadLocalEpisodes(projectId));
      } finally {
        setLoading(false);
      }
    };
    loadEpisodes();
  }, [projectId, setEpisodes, setLoading]);

  const handleCreateEpisode = async () => {
    if (!newEpisodeData.title.trim()) {
      alert("에피소드 제목을 입력하세요");
      return;
    }
    if (!projectId) return;

    const newEpisode: Episode = {
      id: `ep_${Date.now()}`,
      projectId,
      number: newEpisodeData.number,
      title: newEpisodeData.title,
      status: "draft",
      completedSteps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      if (isFirebaseReady()) {
        await ensureFirebaseReady();
        await firebaseService.saveEpisode(projectId, newEpisode);
      }
      const updated = [...episodes, newEpisode];
      setEpisodes(updated);
      saveLocalEpisodes(projectId, updated); // always save locally
      setShowNewEpisodeForm(false);
      setNewEpisodeData({
        title: "",
        number: updated.length + 1,
      });
    } catch (err) {
      console.error("Failed to create episode", err);
      alert("에피소드 생성에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleEpisodeClick = (episode: Episode) => {
    setActiveEpisode(episode);
    navigate(`/project/${projectId}/episode/${episode.id}/pipeline`);
  };

  const handleDeleteEpisode = async () => {
    if (!deleteTarget || !projectId) return;
    try {
      if (isFirebaseReady()) {
        await ensureFirebaseReady();
        await firebaseService.deleteEpisode(projectId, deleteTarget.id);
      }
      const updated = episodes.filter(ep => ep.id !== deleteTarget.id);
      setEpisodes(updated);
      saveLocalEpisodes(projectId, updated);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete episode", err);
      alert("에피소드 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const sortedEpisodes = [...episodes].sort((a, b) => a.number - b.number);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>에피소드 관리</h1>
        <button
          onClick={() => setShowNewEpisodeForm(true)}
          style={styles.newEpisodeBtn}
        >
          + 새 에피소드
        </button>
      </div>

      {loading ? (
        <p style={styles.loadingText}>로딩 중...</p>
      ) : sortedEpisodes.length === 0 ? (
        <div style={styles.emptyState}>
          <p>아직 에피소드가 없습니다</p>
          <button
            onClick={() => setShowNewEpisodeForm(true)}
            style={styles.createBtnAlt}
          >
            첫 에피소드 만들기
          </button>
        </div>
      ) : (
        <div style={styles.episodeList}>
          {sortedEpisodes.map((episode) => {
            const statusInfo = STATUS_LABELS[episode.status as keyof typeof STATUS_LABELS] || { label: episode.status || "알 수 없음", color: "#9CA3AF" };
            return (
              <div
                key={episode.id}
                style={styles.episodeCard}
                onClick={() => handleEpisodeClick(episode)}
              >
                <div style={styles.episodeNumber}>
                  <span style={styles.numberText}>EP {episode.number}</span>
                </div>
                <div style={styles.episodeInfo}>
                  <h3 style={styles.episodeTitle}>{episode.title}</h3>
                  <p style={styles.episodeDate}>
                    {new Date(episode.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div style={styles.statusBadge(statusInfo.color)}>
                  {statusInfo.label}
                </div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${(episode.completedSteps.length / 5) * 100}%`,
                    }}
                  />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(episode); }}
                  style={styles.deleteBtn}
                  title="에피소드 삭제"
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showNewEpisodeForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowNewEpisodeForm(false)}
        >
          <div
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={styles.modalTitle}>새 에피소드 만들기</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>에피소드 번호</label>
              <input
                type="number"
                min="1"
                value={newEpisodeData.number}
                onChange={(e) =>
                  setNewEpisodeData({
                    ...newEpisodeData,
                    number: parseInt(e.target.value, 10),
                  })
                }
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>제목 *</label>
              <input
                type="text"
                placeholder="예: 첫 만남"
                value={newEpisodeData.title}
                onChange={(e) =>
                  setNewEpisodeData({
                    ...newEpisodeData,
                    title: e.target.value,
                  })
                }
                style={styles.input}
              />
            </div>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowNewEpisodeForm(false)}
                style={styles.cancelBtn}
              >
                취소
              </button>
              <button
                onClick={handleCreateEpisode}
                style={styles.submitBtn}
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div
          style={styles.modalOverlay}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={styles.deleteModalTitle}>에피소드 삭제</h2>
            <p style={styles.deleteModalDesc}>
              <strong>EP {deleteTarget.number} — {deleteTarget.title}</strong>을(를) 삭제하시겠습니까?
            </p>
            <p style={styles.deleteModalWarn}>
              이 작업은 되돌릴 수 없으며, 해당 에피소드의 모든 데이터가 삭제됩니다.
            </p>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={styles.cancelBtn}
              >
                취소
              </button>
              <button
                onClick={handleDeleteEpisode}
                style={styles.deleteBtnConfirm}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "24px",
    maxWidth: "1000px",
    margin: "0 auto",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "32px",
  } as const,
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    margin: 0,
    color: "#333",
  } as const,
  newEpisodeBtn: {
    backgroundColor: "#007AFF",
    color: "white",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  } as const,
  loadingText: {
    textAlign: "center" as const,
    fontSize: "16px",
    color: "#666",
    margin: "40px 0",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "60px 20px",
    backgroundColor: "#f5f5f5",
    borderRadius: "12px",
  } as const,
  createBtnAlt: {
    marginTop: "20px",
    padding: "12px 24px",
    backgroundColor: "#007AFF",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  } as const,
  episodeList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  episodeCard: {
    display: "grid",
    gridTemplateColumns: "80px 1fr 150px 100px 60px",
    alignItems: "center",
    gap: "16px",
    padding: "16px",
    backgroundColor: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  } as const,
  episodeNumber: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: "6px",
    height: "60px",
  } as const,
  numberText: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#007AFF",
  } as const,
  episodeInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  } as const,
  episodeTitle: {
    fontSize: "16px",
    fontWeight: "600",
    margin: 0,
    color: "#333",
  } as const,
  episodeDate: {
    fontSize: "12px",
    color: "#999",
    margin: 0,
  } as const,
  statusBadge: (color: string) => ({
    padding: "6px 12px",
    borderRadius: "6px",
    backgroundColor: color + "20",
    color: color,
    fontSize: "12px",
    fontWeight: "600",
    textAlign: "center" as const,
  } as const),
  progressBar: {
    width: "100px",
    height: "4px",
    backgroundColor: "#e0e0e0",
    borderRadius: "2px",
    overflow: "hidden",
  } as const,
  progressFill: {
    height: "100%",
    backgroundColor: "#10B981",
    transition: "width 0.3s ease",
  } as const,
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "32px",
    maxWidth: "500px",
    width: "90%",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
  } as const,
  modalTitle: {
    fontSize: "20px",
    fontWeight: "600",
    marginBottom: "24px",
    color: "#333",
    margin: "0 0 24px 0",
  } as const,
  formGroup: {
    marginBottom: "20px",
  } as const,
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    marginBottom: "8px",
    color: "#333",
  } as const,
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    boxSizing: "border-box" as const,
  } as const,
  modalButtons: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
    marginTop: "24px",
  } as const,
  cancelBtn: {
    padding: "10px 24px",
    border: "1px solid #ddd",
    backgroundColor: "white",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    color: "#333",
  } as const,
  submitBtn: {
    padding: "10px 24px",
    backgroundColor: "#007AFF",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  } as const,
  deleteBtn: {
    padding: "6px 12px",
    backgroundColor: "white",
    color: "#dc2626",
    border: "1px solid #fca5a5",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
    transition: "all 0.2s",
  } as const,
  deleteModalTitle: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#dc2626",
    margin: "0 0 16px 0",
  } as const,
  deleteModalDesc: {
    fontSize: "15px",
    color: "#333",
    margin: "0 0 8px 0",
    lineHeight: "1.5",
  } as const,
  deleteModalWarn: {
    fontSize: "13px",
    color: "#991b1b",
    margin: "0 0 8px 0",
    padding: "10px 14px",
    backgroundColor: "#fef2f2",
    borderRadius: "6px",
    border: "1px solid #fecaca",
    lineHeight: "1.5",
  } as const,
  deleteBtnConfirm: {
    padding: "10px 24px",
    backgroundColor: "#dc2626",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  } as const,
};
