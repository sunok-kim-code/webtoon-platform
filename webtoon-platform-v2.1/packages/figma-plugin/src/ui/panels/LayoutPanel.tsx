// ============================================================
// Layout Panel - Panel Arrangement & Preset Configuration
// ============================================================

import React, { useState } from "react";
import DropdownSelect from "../components/DropdownSelect";
import SliderInput from "../components/SliderInput";

interface LayoutPanelProps {
  onMessage: (type: string, payload?: any) => void;
}

interface LayoutPreset {
  value: string;
  label: string;
}

const LAYOUT_PRESETS: LayoutPreset[] = [
  { value: "vertical_strip", label: "세로 스트립 (1열)" },
  { value: "two_column", label: "2열" },
  { value: "three_row", label: "3행" },
  { value: "wide_top", label: "상단 와이드" },
  { value: "cinematic", label: "시네마틱 (좌우 고정)" },
];

const LayoutPanel: React.FC<LayoutPanelProps> = ({ onMessage }) => {
  const [selectedPreset, setSelectedPreset] = useState("vertical_strip");
  const [gutter, setGutter] = useState(20);
  const [stripWidth, setStripWidth] = useState(800);
  const [loading, setLoading] = useState(false);

  const handleApplyLayout = () => {
    setLoading(true);
    onMessage("APPLY_LAYOUT", {
      preset: selectedPreset,
      gutter: gutter,
      stripWidth: stripWidth,
    });

    setTimeout(() => {
      setLoading(false);
    }, 1000);
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
    previewBox: {
      padding: "12px",
      backgroundColor: "#2a2a40",
      borderRadius: "4px",
      marginBottom: "12px",
      border: "1px solid #3a3a55",
    },
    previewTitle: {
      fontSize: "10px",
      color: "#999",
      marginBottom: "8px",
      textTransform: "uppercase" as const,
      fontWeight: 600,
    },
    preview: {
      display: "flex" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      height: "60px",
      backgroundColor: "#1a1a2e",
      borderRadius: "3px",
      fontSize: "11px",
      color: "#666",
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
    specs: {
      fontSize: "10px",
      color: "#999",
      marginTop: "8px",
      padding: "8px",
      backgroundColor: "#1a1a2e",
      borderRadius: "3px",
    },
    specItem: {
      marginBottom: "4px",
      display: "flex" as const,
      justifyContent: "space-between" as const,
    },
  };

  const getPreviewContent = () => {
    const previewMap: Record<string, string> = {
      vertical_strip: "세로 스트립 (1열)",
      two_column: "좌우 2열",
      three_row: "가로 3행",
      wide_top: "상단 와이드 + 하단",
      cinematic: "시네마틱 좌우 고정",
    };
    return previewMap[selectedPreset] || "프리셋 미리보기";
  };

  return (
    <div>
      <div style={styles.section}>
        <div style={styles.infoBox}>
          패널 배치 프리셋을 선택하고 간격을 조정합니다.
        </div>

        <DropdownSelect
          label="레이아웃 프리셋"
          options={LAYOUT_PRESETS}
          value={selectedPreset}
          onChange={setSelectedPreset}
        />

        <div style={styles.previewBox}>
          <div style={styles.previewTitle}>미리보기</div>
          <div style={styles.preview}>{getPreviewContent()}</div>
        </div>
      </div>

      <div style={styles.section}>
        <SliderInput
          label="패널 간격 (Gutter)"
          value={gutter}
          onChange={setGutter}
          min={10}
          max={100}
          step={5}
          unit="px"
        />

        <SliderInput
          label="스트립 너비"
          value={stripWidth}
          onChange={setStripWidth}
          min={400}
          max={1200}
          step={20}
          unit="px"
        />
      </div>

      <div style={styles.specs}>
        <div style={styles.specItem}>
          <span>스트립 너비:</span>
          <span style={{ color: "#4fc3f7" }}>{stripWidth}px</span>
        </div>
        <div style={styles.specItem}>
          <span>패널 간격:</span>
          <span style={{ color: "#4fc3f7" }}>{gutter}px</span>
        </div>
        <div style={styles.specItem}>
          <span>프리셋:</span>
          <span style={{ color: "#4fc3f7" }}>
            {LAYOUT_PRESETS.find((p) => p.value === selectedPreset)?.label}
          </span>
        </div>
      </div>

      <button
        style={styles.button(loading)}
        onClick={handleApplyLayout}
        disabled={loading}
      >
        {loading ? "레이아웃 적용 중..." : "레이아웃 적용"}
      </button>
    </div>
  );
};

export default LayoutPanel;
