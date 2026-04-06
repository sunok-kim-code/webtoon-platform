// ============================================================
// App.tsx — 메인 앱 셸 (v2.1)
// 라우팅 + 전역 레이아웃 + 헤더 + 사이드바
// ============================================================

import React from "react";
import { HashRouter, Routes, Route, useLocation, Link } from "react-router-dom";

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
}

function Sidebar({ links, currentPath }: { links: NavLink[]; currentPath: string }) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {links.map((link) => {
          const isActive = currentPath === link.path || currentPath.startsWith(link.path + "/");
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
  // 현재 프로젝트 경로 추출 (있을 경우)
  const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
  const currentProjectPath = projectMatch ? `/project/${projectMatch[1]}` : null;

  const sidebarLinks: NavLink[] = [
    { label: "프로젝트", path: "/", icon: "📚" },
    ...(currentProjectPath
      ? [
          { label: "에피소드", path: currentProjectPath, icon: "📖" },
          { label: "전체분석", path: `${currentProjectPath}/full-analysis`, icon: "🚀" },
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
        <Sidebar links={sidebarLinks} currentPath={location.pathname} />
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
