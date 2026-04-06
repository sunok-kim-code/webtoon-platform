// ============================================================
// Reusable Slider Component with Label
// ============================================================

import React from "react";

interface SliderInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

const SliderInput: React.FC<SliderInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
  disabled = false,
}) => {
  const styles = {
    container: {
      marginBottom: "12px",
    },
    header: {
      display: "flex" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: "6px",
    },
    label: {
      fontSize: "11px",
      fontWeight: 600,
      color: "#999",
      textTransform: "uppercase" as const,
    },
    value: {
      fontSize: "12px",
      color: "#4fc3f7",
      fontWeight: 600,
    },
    slider: {
      width: "100%",
      height: "6px",
      borderRadius: "3px",
      background: `linear-gradient(to right, #6c5ce7 0%, #6c5ce7 ${((value - min) / (max - min)) * 100}%, #3a3a55 ${((value - min) / (max - min)) * 100}%, #3a3a55 100%)`,
      outline: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      appearance: "none" as const,
      WebkitAppearance: "none",
    },
  };

  // Handle slider styling for webkit browsers
  const sliderStyle = {
    ...styles.slider,
    // For webkit browsers (Chrome, Safari)
    WebkitSlider: {
      thumb: `
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6c5ce7, #4fc3f7);
        cursor: ${disabled ? "not-allowed" : "pointer"};
        border: 2px solid #2a2a40;
      ` as any,
      track: `
        background: #3a3a55;
        border: none;
        border-radius: 3px;
        height: 6px;
      ` as any,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <label style={styles.label}>{label}</label>
        <span style={styles.value}>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={styles.slider}
      />
    </div>
  );
};

export default SliderInput;
