// ============================================================
// @webtoon/figma-plugin UI - App.tsx (React Root)
// Main plugin panel with tab navigation and state management
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import TabBar from "./components/TabBar";
import ImportPanel from "./panels/ImportPanel";
import BubblePanel from "./panels/BubblePanel";
import SFXPanel from "./panels/SFXPanel";
import LayoutPanel from "./panels/LayoutPanel";
import ExportPanel from "./panels/ExportPanel";

type TabType = "import" | "bubble" | "sfx" | "layout" | "export";

interface PluginMessage {
  type: string;
  payload?: any;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("import");
  const [connected, setConnected] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);

  // ---- Message handling from plugin main thread ----
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginMessage | undefined;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case "INIT":
          setConnected(true);
          break;
        case "PROGRESS":
          setSyncProgress({
            current: msg.payload?.current || 0,
            total: msg.payload?.total || 0,
            label: msg.payload?.label || "",
          });
          break;
        case "BATCH_OK":
          setSyncProgress(null);
          break;
        case "SYNC_ERROR":
          console.error("Sync error:", msg.payload?.error);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // ---- Send message to plugin main thread ----
  const sendMessage = useCallback(
    (type: string, payload?: any) => {
      parent.postMessage(
        {
          pluginMessage: { type, payload },
        },
        "*"
      );
    },
    []
  );

  // ---- Styles ----
  const styles = {
    container: {
      display: "flex" as const,
      flexDirection: "column" as const,
      height: "100vh",
      width: "300px",
      backgroundColor: "#1a1a2e",
      color: "#e0e0e0",
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "12px",
    },
    header: {
      padding: "12px",
      borderBottom: "1px solid #2a2a40",
      display: "flex" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: "8px",
    },
    title: {
      fontSize: "14px",
      fontWeight: 600,
      background: "linear-gradient(135deg, #6c5ce7, #4fc3f7)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      margin: 0,
    },
    statusDot: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: connected ? "#00e676" : "#666",
      transition: "background 0.3s",
    },
    content: {
      flex: 1,
      overflow: "hidden" as const,
      display: "flex" as const,
      flexDirection: "column" as const,
    },
    tabContent: {
      flex: 1,
      overflow: "auto" as const,
      padding: "12px",
      display: "flex" as const,
      flexDirection: "column" as const,
    },
    footer: {
      borderTop: "1px solid #2a2a40",
      padding: "12px",
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.statusDot} />
        <h1 style={styles.title}>웹툰 스튜디오</h1>
      </div>

      {/* Tab Navigation */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <div style={styles.content}>
        <div style={styles.tabContent}>
          {activeTab === "import" && <ImportPanel onMessage={sendMessage} />}
          {activeTab === "bubble" && <BubblePanel onMessage={sendMessage} />}
          {activeTab === "sfx" && <SFXPanel onMessage={sendMessage} />}
          {activeTab === "layout" && <LayoutPanel onMessage={sendMessage} />}
        </div>

        {/* Progress Indicator */}
        {syncProgress && (
          <div style={{ padding: "8px 12px", borderTop: "1px solid #2a2a40" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <span style={{ fontSize: "10px", color: "#999" }}>
                {syncProgress.label}
              </span>
              <span style={{ fontSize: "10px", color: "#999" }}>
                {syncProgress.current}/{syncProgress.total}
              </span>
            </div>
            <div
              style={{
                height: "4px",
                backgroundColor: "#3a3a55",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, #6c5ce7, #4fc3f7)",
                  width: `${Math.round(
                    (syncProgress.current / syncProgress.total) * 100
                  )}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Export Panel Footer */}
      <ExportPanel onMessage={sendMessage} />
    </div>
  );
};

export default App;
