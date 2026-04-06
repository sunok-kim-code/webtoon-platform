// ============================================================
// ProjectListPage — 프로젝트 목록 & 생성 (v2.1)
// 마이그레이션 대상: index.html의 프로젝트 관리 UI 부분
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@/stores";
import { firebaseService, getFirebaseConfig, ensureFirebaseReady } from "@/services";
import type { Project } from "@webtoon/shared";

// ── localStorage fallback helpers ───────────────────────────
const LOCAL_PROJECTS_KEY = "webtoon_projects_local";

function loadLocalProjects(): Project[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: Project[]) {
  localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
}

function isFirebaseReady(): boolean {
  return !!getFirebaseConfig();
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const { projects, loading, setProjects, setLoading, setError } = useProjectStore();
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    title: "",
    description: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      try {
        if (isFirebaseReady()) {
          await ensureFirebaseReady();
          const userId = "demo-user";
          const data = await firebaseService.fetchProjects(userId);
          setProjects(data);
        } else {
          // Firebase 미설정 → localStorage에서 로드
          setProjects(loadLocalProjects());
        }
      } catch (err) {
        // Firebase 실패 시 localStorage fallback
        console.warn("[ProjectList] Firebase failed, using local:", err);
        setProjects(loadLocalProjects());
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, [setProjects, setLoading, setError]);

  const handleCreateProject = async () => {
    if (!newProjectData.title.trim()) {
      alert("프로젝트 이름을 입력하세요");
      return;
    }

    const newProject: Project = {
      id: `proj_${Date.now()}`,
      title: newProjectData.title,
      description: newProjectData.description,
      status: "draft",
      settings: {
        stripWidth: 800,
        defaultFont: "Arial",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const updated = [...projects, newProject];

      if (isFirebaseReady()) {
        await ensureFirebaseReady();
        await firebaseService.saveProject(newProject);
      }

      // 항상 localStorage에도 저장 (오프라인 백업)
      saveLocalProjects(updated);
      setProjects(updated);
      setShowNewProjectForm(false);
      setNewProjectData({ title: "", description: "" });
    } catch (err) {
      // Firebase 실패해도 로컬에는 저장
      const updated = [...projects, newProject];
      saveLocalProjects(updated);
      setProjects(updated);
      setShowNewProjectForm(false);
      setNewProjectData({ title: "", description: "" });
      console.warn("[ProjectList] Firebase save failed, saved locally:", err);
    }
  };

  const handleProjectClick = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (isFirebaseReady()) {
        await ensureFirebaseReady();
        await firebaseService.deleteProject(deleteTarget.id);
      }
      const updated = projects.filter(p => p.id !== deleteTarget.id);
      saveLocalProjects(updated);
      setProjects(updated);
      console.log(`[ProjectList] 프로젝트 삭제 완료: ${deleteTarget.title} (${deleteTarget.id})`);
    } catch (err) {
      console.error("[ProjectList] 프로젝트 삭제 실패:", err);
      // Firebase 실패해도 로컬에서는 삭제
      const updated = projects.filter(p => p.id !== deleteTarget.id);
      saveLocalProjects(updated);
      setProjects(updated);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>내 웹툰 프로젝트</h1>
        <button
          onClick={() => setShowNewProjectForm(true)}
          style={styles.newProjectBtn}
        >
          + 새 프로젝트
        </button>
      </div>

      {loading ? (
        <p style={styles.loadingText}>로딩 중...</p>
      ) : projects.length === 0 ? (
        <div style={styles.emptyState}>
          <p>아직 프로젝트가 없습니다</p>
          <button
            onClick={() => setShowNewProjectForm(true)}
            style={styles.createBtnAlt}
          >
            첫 프로젝트 시작하기
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={styles.card}
              onClick={() => handleProjectClick(p.id)}
            >
              {p.thumbnail && (
                <img
                  src={p.thumbnail}
                  alt={p.title}
                  style={styles.thumbnail}
                />
              )}
              <div style={styles.cardContent}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>{p.title}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                    style={styles.deleteBtn}
                    title="프로젝트 삭제"
                  >
                    &times;
                  </button>
                </div>
                {p.description && (
                  <p style={styles.cardDescription}>{p.description}</p>
                )}
                <span style={styles.statusBadge(p.status)}>
                  {p.status === "draft" && "작업 중"}
                  {p.status === "active" && "활성"}
                  {p.status === "archived" && "보관됨"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <div style={styles.modalOverlay} onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...styles.modalTitle, color: "#d32f2f" }}>프로젝트 삭제</h2>
            <p style={{ fontSize: "14px", color: "#333", lineHeight: "1.6", margin: "0 0 8px 0" }}>
              <strong>"{deleteTarget.title}"</strong> 프로젝트를 삭제하시겠습니까?
            </p>
            <p style={{ fontSize: "13px", color: "#999", margin: "0 0 24px 0" }}>
              프로젝트에 포함된 모든 에피소드, 캐릭터, 배경, 레퍼런스 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={styles.cancelBtn}
                disabled={isDeleting}
              >
                취소
              </button>
              <button
                onClick={handleDeleteProject}
                style={styles.deleteBtnConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewProjectForm && (
        <div style={styles.modalOverlay} onClick={() => setShowNewProjectForm(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>새 프로젝트 만들기</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>프로젝트 이름 *</label>
              <input
                type="text"
                placeholder="예: 마이웹툰"
                value={newProjectData.title}
                onChange={(e) =>
                  setNewProjectData({ ...newProjectData, title: e.target.value })
                }
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>설명</label>
              <textarea
                placeholder="프로젝트에 대한 설명을 입력하세요"
                value={newProjectData.description}
                onChange={(e) =>
                  setNewProjectData({
                    ...newProjectData,
                    description: e.target.value,
                  })
                }
                style={styles.textarea}
              />
            </div>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowNewProjectForm(false)}
                style={styles.cancelBtn}
              >
                취소
              </button>
              <button
                onClick={handleCreateProject}
                style={styles.submitBtn}
              >
                생성
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
    maxWidth: "1200px",
    margin: "0 auto",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "32px",
  } as const,
  title: {
    fontSize: "32px",
    fontWeight: "bold",
    margin: 0,
    color: "#333",
  } as const,
  newProjectBtn: {
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "20px",
  } as const,
  card: {
    backgroundColor: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "12px",
    overflow: "hidden",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  } as const,
  thumbnail: {
    width: "100%",
    height: "160px",
    objectFit: "cover" as const,
  },
  cardContent: {
    padding: "16px",
  } as const,
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "8px",
  } as const,
  cardTitle: {
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 8px 0",
    color: "#333",
    flex: 1,
  } as const,
  deleteBtn: {
    background: "none",
    border: "none",
    fontSize: "20px",
    color: "#bbb",
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: "1",
    borderRadius: "4px",
    flexShrink: 0,
    transition: "color 0.15s, background 0.15s",
  } as const,
  cardDescription: {
    fontSize: "13px",
    color: "#666",
    margin: "0 0 12px 0",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: 2,
    overflow: "hidden",
  } as const,
  statusBadge: (status: string) => ({
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "600",
    backgroundColor:
      status === "draft"
        ? "#FFF3CD"
        : status === "active"
        ? "#D4EDDA"
        : "#E2E3E5",
    color:
      status === "draft"
        ? "#856404"
        : status === "active"
        ? "#155724"
        : "#383D41",
  } as const),
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
  textarea: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    minHeight: "100px",
    fontFamily: "inherit",
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
  deleteBtnConfirm: {
    padding: "10px 24px",
    backgroundColor: "#d32f2f",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  } as const,
};
