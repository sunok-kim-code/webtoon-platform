// ============================================================
// Import Panel - Episode/Project Import UI
// ============================================================

import React, { useState, useEffect } from "react";
import DropdownSelect from "../components/DropdownSelect";

interface ImportPanelProps {
  onMessage: (type: string, payload?: any) => void;
}

interface Project {
  value: string;
  label: string;
}

interface Episode {
  value: string;
  label: string;
}

const ImportPanel: React.FC<ImportPanelProps> = ({ onMessage }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState("");
  const [loading, setLoading] = useState(false);
  const [panelCount, setPanelCount] = useState(0);

  // Request projects list on mount
  useEffect(() => {
    onMessage("GET_PROJECTS");
  }, [onMessage]);

  // Handle incoming projects data
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === "PROJECTS_LIST") {
        const projectList = msg.payload?.projects || [];
        setProjects(
          projectList.map((p: any) => ({
            value: p.id,
            label: p.name || p.id,
          }))
        );
      }

      if (msg.type === "EPISODES_LIST") {
        const episodeList = msg.payload?.episodes || [];
        setPanelCount(msg.payload?.panelCount || 0);
        setEpisodes(
          episodeList.map((e: any) => ({
            value: e.id,
            label: `EP${e.episodeNum} - ${e.title || "Untitled"}`,
          }))
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
    setSelectedEpisode("");
    setEpisodes([]);
    setLoading(true);
    onMessage("GET_EPISODES", { projectId });
    setTimeout(() => setLoading(false), 500);
  };

  const handleImport = () => {
    if (!selectedProject || !selectedEpisode) {
      alert("프로젝트와 에피소드를 선택해주세요.");
      return;
    }

    setLoading(true);
    onMessage("IMPORT_EPISODE", {
      projectId: selectedProject,
      episodeId: selectedEpisode,
    });

    setTimeout(() => setLoading(false), 1000);
  };

  const styles = {
    section: {
      marginBottom: "16px",
    },
    infoBox: {
      padding: "8px 12px",
      backgroundColor: "#2a2a40",
      borderRadius: "4px",
      fontSize: "11px",
      color: "#999",
      marginBottom: "12px",
      borderLeft: "2px solid #4fc3f7",
    },
    button: (disabled: boolean) => ({
      width: "100%" as const,
      padding: "10px 12px",
      backgroundColor: disabled
        ? "#3a3a55"
        : "linear-gradient(135deg, #6c5ce7, #4fc3f7)",
      color: disabled ? "#666" : "#fff",
      border: "none",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.2s",
      opacity: disabled ? 0.5 : 1,
    }),
    panelInfo: {
      fontSize: "10px",
      color: "#4fc3f7",
      marginTop: "6px",
      textAlign: "center" as const,
    },
  };

  return (
    <div>
      <div style={styles.section}>
        <div style={styles.infoBox}>
          Firebase에서 프로젝트 및 에피소드를 가져옵니다.
        </div>

        <DropdownSelect
          label="프로젝트"
          options={projects}
          value={selectedProject}
          onChange={handleProjectChange}
          placeholder="프로젝트를 선택하세요"
          disabled={projects.length === 0}
        />

        <DropdownSelect
          label="에피소드"
          options={episodes}
          value={selectedEpisode}
          onChange={setSelectedEpisode}
          placeholder="에피소드를 선택하세요"
          disabled={episodes.length === 0 || loading}
        />

        {panelCount > 0 && (
          <div style={styles.panelInfo}>
            총 {panelCount}개의 패널이 포함됩니다
          </div>
        )}
      </div>

      <button
        style={styles.button(
          !selectedProject || !selectedEpisode || loading
        )}
        onClick={handleImport}
        disabled={!selectedProject || !selectedEpisode || loading}
      >
        {loading ? "가져오는 중..." : "에피소드 가져오기"}
      </button>
    </div>
  );
};

export default ImportPanel;
