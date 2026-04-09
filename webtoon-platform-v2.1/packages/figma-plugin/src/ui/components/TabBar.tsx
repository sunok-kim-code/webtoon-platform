// ============================================================
// Tab Navigation Component
// ============================================================

import React from "react";

type TabType = "sync" | "import" | "bubble" | "sfx" | "layout" | "export";

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TAB_CONFIG = [
  { id: "sync" as TabType, label: "연결", icon: "🔗" },
  { id: "import" as TabType, label: "가져오기", icon: "📥" },
  { id: "bubble" as TabType, label: "말풍선", icon: "💬" },
  { id: "sfx" as TabType, label: "효과음", icon: "🔊" },
  { id: "layout" as TabType, label: "레이아웃", icon: "📐" },
] as const;

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  const styles = {
    container: {
      display: "flex" as const,
      borderBottom: "1px solid #2a2a40",
      backgroundColor: "#161626",
      overflow: "auto" as const,
    },
    tab: (isActive: boolean) => ({
      flex: 1,
      padding: "8px 12px",
      textAlign: "center" as const,
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer" as const,
      borderBottom: isActive ? "2px solid #4fc3f7" : "2px solid transparent",
      color: isActive ? "#4fc3f7" : "#999",
      transition: "all 0.2s",
      backgroundColor: isActive ? "#1a1a2e" : "transparent",
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      gap: "4px",
      minWidth: "60px",
      whiteSpace: "nowrap" as const,
    }),
    icon: {
      fontSize: "14px",
    },
  };

  return (
    <div style={styles.container}>
      {TAB_CONFIG.map((tab) => (
        <button
          key={tab.id}
          style={{
            ...styles.tab(activeTab === tab.id),
            border: "none",
            background: "transparent",
          }}
          onClick={() => onTabChange(tab.id)}
        >
          <span style={styles.icon}>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default TabBar;
