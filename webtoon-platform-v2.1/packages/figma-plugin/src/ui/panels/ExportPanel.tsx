// ============================================================
// Export Panel - Export & Sync to Platform
// ============================================================

import React, { useState } from "react";

interface ExportPanelProps {
  onMessage: (type: string, payload?: any) => void;
}

const ExportPanel: React.FC<ExportPanelProps> = ({ onMessage }) => {
  const [loading, setLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "exporting" | "syncing" | "success" | "error"
  >("idle");

  // Handle export status updates
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === "EXPORT_START") {
        setExportStatus("exporting");
      } else if (msg.type === "EXPORT_OK") {
        setExportStatus("success");
        setTimeout(() => {
          setExportStatus("idle");
          setLoading(false);
        }, 2000);
      } else if (msg.type === "EXPORT_ERROR") {
        setExportStatus("error");
        setTimeout(() => {
          setExportStatus("idle");
          setLoading(false);
        }, 3000);
      } else if (msg.type === "SYNC_OK") {
        setExportStatus("success");
        setTimeout(() => {
          setExportStatus("idle");
          setLoading(false);
        }, 2000);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleExportAndSync = () => {
    setLoading(true);
    setExportStatus("exporting");
    onMessage("EXPORT_SYNC", {
      timestamp: Date.now(),
    });
  };

  const getStatusMessage = () => {
    switch (exportStatus) {
      case "exporting":
        return "내보내는 중...";
      case "syncing":
        return "플랫폼 동기화 중...";
      case "success":
        return "완료!";
      case "error":
        return "오류 발생";
      default:
        return "내보내기 & 동기화";
    }
  };

  const getStatusColor = () => {
    switch (exportStatus) {
      case "success":
        return "#00e676";
      case "error":
        return "#ff5252";
      case "exporting":
      case "syncing":
        return "#ffc107";
      default:
        return "#4fc3f7";
    }
  };

  const styles = {
    container: {
      padding: "12px",
      borderTop: "1px solid #2a2a40",
      backgroundColor: "#161626",
    },
    button: {
      width: "100%" as const,
      padding: "12px 16px",
      background: loading
        ? `linear-gradient(135deg, rgba(107, 92, 231, 0.5), rgba(79, 195, 247, 0.5))`
        : "linear-gradient(135deg, #6c5ce7, #4fc3f7)",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      fontSize: "13px",
      fontWeight: 700,
      cursor: loading ? "not-allowed" : "pointer",
      transition: "all 0.3s",
      opacity: loading ? 0.7 : 1,
      display: "flex" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: "8px",
    },
    icon: {
      fontSize: "16px",
    },
    statusIndicator: {
      display: "inline-block" as const,
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      backgroundColor: getStatusColor(),
      marginRight: "6px",
      animation:
        exportStatus === "exporting" || exportStatus === "syncing"
          ? "pulse 1s infinite"
          : "none",
    },
    statusText: {
      fontSize: "10px",
      color: "#999",
      marginTop: "8px",
      textAlign: "center" as const,
    },
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <button
        style={{
          ...styles.button,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
        onClick={handleExportAndSync}
        disabled={loading}
      >
        <span style={styles.icon}>📤</span>
        <span>{getStatusMessage()}</span>
      </button>

      <div style={styles.statusText}>
        <span style={styles.statusIndicator} />
        {exportStatus === "idle" &&
          "Figma 변경 사항을 웹툰 플랫폼으로 내보냅니다"}
        {exportStatus === "exporting" && "Figma에서 데이터 추출 중..."}
        {exportStatus === "syncing" &&
          "웹툰 플랫폼으로 동기화 중..."}
        {exportStatus === "success" && "성공적으로 동기화되었습니다!"}
        {exportStatus === "error" && "동기화 중 오류가 발생했습니다"}
      </div>
    </div>
  );
};

export default ExportPanel;
