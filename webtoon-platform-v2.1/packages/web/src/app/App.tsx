// ============================================================
// App.tsx — 메인 앱 셸 (v2.1)
// 라우팅 + 전역 레이아웃 + 헤더 + 사이드바
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { HashRouter, Routes, Route, useLocation, Link, useNavigate } from "react-router-dom";
import type { Episode } from "@webtoon/shared";

// Feature pages (lazy loaded)
import { ProjectListPage } from "@/features/project/ProjectListPage";
import { EpisodePage } from "@/features/episode/EpisodePage";
import { PipelinePage } from "@/features/pipeline/PipelinePage";
import { ReferenceGallery } from "@/features/reference/ReferenceGallery";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { FullAnalysisPage } from "@/features/fullAnalysis/FullAnalysisPage";

// ─── AppHeader 컴포넌트 ──────────────────────────────────────

interface BreadcrumbItem {
  label: string;
  path: string;
  active?: boolean;
}

function AppHeader({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  return (
    <header className="app-header">
      <div className="header-content">
        {/* 로고 */}
        <Link to="/" className="logo">
          <span className="logo-icon">웹</span>
          <span className="logo-text">Webtoon Studio</span>
        </Link>

        {/* 네비게이션 브레드크럼 */}
        <nav className="breadcrumbs">
          {breadcrumbs.map((item, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="separator">/</span>}
              {item.active ? (
                <span className="breadcrumb-item active">{item.label}</span>
              ) : (
                <Link to={item.path} className="breadcrumb-item">
                  {item.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      <style>{`
        .app-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 0 20px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 30px;
          height: 60px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: white;
          font-weight: bold;
          font-size: 18px;
          flex-shrink: 0;
          transition: opacity 0.2s;
        }

        .logo:hover {
          opacity: 0.8;
        }

        .logo-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          font-size: 18px;
          font-weight: 900;
        }

        .logo-text {
          display: none;
        }

        @media (min-width: 768px) {
          .logo-text {
            display: inline;
          }
        }

        .breadcrumbs {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          overflow-x: auto;
          font-size: 13px;
        }

        .separator {
          color: rgba(255, 255, 255, 0.5);
          margin: 0 4px;
        }

        .breadcrumb-item {
          color: rgba(255, 255, 255, 0.9);
          text-decoration: none;
          transition: color 0.2s;
          white-space: nowrap;
        }

        .breadcrumb-item:hover {
          color: white;
        }

        .breadcrumb-item.active {
          color: white;
          font-weight: 600;
        }
      `}</style>
    </header>
  );
}

// ─── Sidebar 컴포넌트 ────────────────────────────────────────

interface NavLink {
  label: string;
  path: string;
  icon?: string;
  hasEpisodeList?: boolean;
}

interface SidebarProps {
  links: NavLink[];
  currentPath: string;
  projectId: string | null;
  episodes: Episode[];
}

function Sidebar({ links, currentPath, projectId, episodes }: SidebarProps) {
  const [episodeListOpen, setEpisodeListOpen] = useState(false);
  const navigate = useNavigate();

  // 에피소드 경로에 있으면 자동으로 목록 열기
  useEffect(() => {
    if (currentPath.includes("/episode/")) {
      setEpisodeListOpen(true);
    }
  }, [currentPath]);

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {links.map((link) => {
          const isActive = link.hasEpisodeList
            ? currentPath === link.path
            : currentPath === link.path || currentPath.startsWith(link.path + "/");

          if (link.hasEpisodeList && projectId) {
            // 에피소드 메뉴: 클릭 시 에피소드 페이지로 이동 + 토글
            const isEpisodeSection = currentPath.startsWith(link.path);
            return (
              <React.Fragment key={link.label}>
                <div
                  className={`nav-link episode-toggle ${isEpisodeSection ? "active" : ""}`}
                  onClick={() => {
                    setEpisodeListOpen(!episodeListOpen);
                    navigate(link.path);
                  }}
                  title={link.label}
                >
                  {link.icon && <span className="nav-icon">{link.icon}</span>}
                  <span className="nav-label">{link.label}</span>
                  <span className={`nav-arrow ${episodeListOpen ? "open" : ""}`}>
                    ▸
                  </span>
                </div>
                {episodeListOpen && episodes.length > 0 && (
                  <div className="episode-sublist">
                    {episodes
                      .sort((a, b) => a.number - b.number)
                      .map((ep) => {
                        const epPath = `/project/${projectId}/episode/${ep.id}/pipeline`;
                        const isEpActive = currentPath.includes(`/episode/${ep.id}`);
                        return (
                          <Link
                            key={ep.id}
                            to={epPath}
                            className={`nav-link sub-link ${isEpActive ? "active" : ""}`}
                            title={`${ep.number}화: ${ep.title}`}
                          >
                            <span className="ep-number">{ep.number}화</span>
                            <span className="nav-label ep-title">{ep.title}</span>
                          </Link>
                        );
                      })}
                  </div>
                )}
              </React.Fragment>
            );
          }

          return (
            <Link
              key={link.label}
              to={link.path}
              className={`nav-link ${isActive ? "active" : ""}`}
              title={link.label}
            >
              {link.icon && <span className="nav-icon">{link.icon}</span>}
              <span className="nav-label">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <style>{`
        .sidebar {
          width: 220px;
          background: #f5f6fa;
          border-right: 1px solid #e0e0e0;
          overflow-y: auto;
          flex-shrink: 0;
          max-height: calc(100vh - 60px);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 12px 0;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          text-decoration: none;
          color: #333;
          border-left: 3px solid transparent;
          transition: all 0.2s;
          font-size: 14px;
        }

        .nav-link:hover {
          background-color: rgba(102, 126, 234, 0.08);
          color: #667eea;
        }

        .nav-link.active {
          background-color: rgba(102, 126, 234, 0.15);
          border-left-color: #667eea;
          color: #667eea;
          font-weight: 600;
        }

        .nav-link.episode-toggle {
          cursor: pointer;
          user-select: none;
        }

        .nav-arrow {
          font-size: 11px;
          transition: transform 0.2s;
          color: #999;
          margin-left: auto;
        }

        .nav-arrow.open {
          transform: rotate(90deg);
        }

        .episode-sublist {
          background: rgba(0, 0, 0, 0.02);
        }

        .nav-link.sub-link {
          padding: 8px 16px 8px 28px;
          font-size: 13px;
          gap: 8px;
          border-left: 3px solid transparent;
        }

        .nav-link.sub-link:hover {
          background-color: rgba(102, 126, 234, 0.06);
        }

        .nav-link.sub-link.active {
          background-color: rgba(102, 126, 234, 0.12);
          border-left-color: #667eea;
          color: #667eea;
          font-weight: 600;
        }

        .ep-number {
          font-size: 12px;
          color: #888;
          white-space: nowrap;
          min-width: 28px;
        }

        .nav-link.sub-link.active .ep-number {
          color: #667eea;
        }

        .ep-title {
          font-size: 12px;
        }

        .nav-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          font-size: 16px;
          flex-shrink: 0;
        }

        .nav-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media (max-width: 768px) {
          .sidebar {
            width: 180px;
          }

          .nav-label {
            display: none;
          }
        }
      `}</style>
    </aside>
  );
}

// ─── AppContent 래퍼 (라우팅 및 네비게이션 상태) ──────────────

function AppContent() {
  const location = useLocation();

  // 현재 경로에 따른 브레드크럼 생성
  const getBreadcrumbs = (): BreadcrumbItem[] => {
    if (location.pathname === "/") {
      return [{ label: "프로젝트", path: "/", active: true }];
    }
    if (location.pathname.includes("/project/")) {
      return [
        { label: "프로젝트", path: "/" },
        { label: "에피소드", path: location.pathname.split("/episode/")[0] || "/", active: true },
      ];
    }
    return [{ label: "홈", path: "/", active: true }];
  };

  // 사이드바 네비게이션 링크
  // 현재 프로젝트 경로 추출 (있을 경우) — 설정/레퍼런스 등 비프로젝트 경로에서도 유지
  const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
  const urlProjectId = projectMatch ? projectMatch[1] : null;

  // 마지막 선택 프로젝트 기억 (설정 등 비프로젝트 페이지에서도 사이드바 유지)
  const [rememberedProjectId, setRememberedProjectId] = useState<string | null>(() => {
    return localStorage.getItem("webtoon_last_project_id");
  });

  useEffect(() => {
    if (urlProjectId) {
      setRememberedProjectId(urlProjectId);
      localStorage.setItem("webtoon_last_project_id", urlProjectId);
    }
  }, [urlProjectId]);

  // 프로젝트 목록 페이지("/")에서는 프로젝트 메뉴 숨기기, 그 외에서는 유지
  const currentProjectId = urlProjectId || (location.pathname !== "/" ? rememberedProjectId : null);
  const currentProjectPath = currentProjectId ? `/project/${currentProjectId}` : null;

  // 에피소드 목록 로드 (localStorage)
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const loadEpisodes = useCallback(() => {
    if (!currentProjectId) { setEpisodes([]); return; }
    try {
      const raw = localStorage.getItem(`webtoon_episodes_${currentProjectId}`);
      setEpisodes(raw ? JSON.parse(raw) : []);
    } catch { setEpisodes([]); }
  }, [currentProjectId]);

  useEffect(() => {
    loadEpisodes();
    // localStorage 변경 감지 (다른 탭/컴포넌트에서 저장 시)
    const onStorage = (e: StorageEvent) => {
      if (e.key === `webtoon_episodes_${currentProjectId}`) loadEpisodes();
    };
    window.addEventListener("storage", onStorage);
    // 같은 탭 내 변경 감지를 위해 주기적으로 체크 (에피소드 추가/삭제 시)
    const interval = setInterval(loadEpisodes, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, [currentProjectId, loadEpisodes]);

  // 순서: 프로젝트, 전체분석, 에피소드(드롭다운), 레퍼런스, 설정
  const sidebarLinks: NavLink[] = [
    { label: "프로젝트", path: "/", icon: "📚" },
    ...(currentProjectPath
      ? [
          { label: "전체분석", path: `${currentProjectPath}/full-analysis`, icon: "🚀" },
          { label: "에피소드", path: currentProjectPath, icon: "📖", hasEpisodeList: true },
          { label: "레퍼런스", path: `${currentProjectPath}/references`, icon: "🎨" },
        ]
      : [
          { label: "레퍼런스", path: "/references", icon: "🎨" },
        ]),
    { label: "설정", path: "/settings", icon: "⚙️" },
  ];

  return (
    <div className="app-layout">
      <AppHeader breadcrumbs={getBreadcrumbs()} />
      <div className="app-container">
        <Sidebar links={sidebarLinks} currentPath={location.pathname} projectId={currentProjectId} episodes={episodes} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<ProjectListPage />} />
            <Route path="/project/:projectId" element={<EpisodePage />} />
            <Route path="/project/:projectId/episode/:episodeId" element={<PipelinePage />} />
            <Route path="/project/:projectId/episode/:episodeId/pipeline" element={<PipelinePage />} />
            <Route path="/project/:projectId/references" element={<ReferenceGallery />} />
            <Route path="/project/:projectId/full-analysis" element={<FullAnalysisPage />} />
            <Route path="/references" element={<ReferenceGallery />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

      <style>{`
        .app-layout {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100vh;
          overflow: hidden;
        }

        .app-container {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .main-content {
          flex: 1;
          overflow-y: auto;
          background: #fafbfc;
          padding: 20px;
        }

        @media (max-width: 768px) {
          .main-content {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
}

// ─── 메인 App 컴포넌트 ────────────────────────────────────────

export function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
