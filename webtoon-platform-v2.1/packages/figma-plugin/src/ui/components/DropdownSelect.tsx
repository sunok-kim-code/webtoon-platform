// ============================================================
// Reusable Dropdown Select Component
// ============================================================

import React, { useState, useRef, useEffect } from "react";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownSelectProps {
  label?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const DropdownSelect: React.FC<DropdownSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = "선택하세요",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const styles = {
    container: {
      position: "relative" as const,
      marginBottom: "8px",
    },
    label: {
      display: "block" as const,
      fontSize: "11px",
      color: "#999",
      marginBottom: "4px",
      fontWeight: 600,
      textTransform: "uppercase" as const,
    },
    button: {
      width: "100%",
      padding: "8px 12px",
      backgroundColor: "#2a2a40",
      border: "1px solid #3a3a55",
      borderRadius: "4px",
      color: disabled ? "#666" : "#e0e0e0",
      fontSize: "12px",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      transition: "all 0.2s",
      opacity: disabled ? 0.5 : 1,
    },
    buttonHover: {
      borderColor: "#4fc3f7",
      backgroundColor: "#333355",
    },
    dropdown: {
      position: "absolute" as const,
      top: "100%",
      left: 0,
      right: 0,
      marginTop: "4px",
      backgroundColor: "#2a2a40",
      border: "1px solid #3a3a55",
      borderRadius: "4px",
      maxHeight: "200px",
      overflow: "auto" as const,
      zIndex: 1000,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    },
    option: (isSelected: boolean) => ({
      padding: "8px 12px",
      fontSize: "12px",
      cursor: "pointer" as const,
      backgroundColor: isSelected ? "#3a4a5f" : "transparent",
      color: isSelected ? "#4fc3f7" : "#e0e0e0",
      borderBottom: "1px solid #1a1a2e",
      transition: "all 0.15s",
      ":hover": {
        backgroundColor: "#333355",
      },
    }),
    arrow: {
      fontSize: "10px",
      transition: "transform 0.2s",
      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}
      <button
        style={{
          ...styles.button,
          ...(isOpen && styles.buttonHover),
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>{selectedOption?.label || placeholder}</span>
        <span style={styles.arrow}>▼</span>
      </button>

      {isOpen && !disabled && (
        <div style={styles.dropdown}>
          {options.length === 0 ? (
            <div style={{ padding: "8px 12px", color: "#666" }}>
              옵션 없음
            </div>
          ) : (
            options.map((option) => (
              <div
                key={option.value}
                style={styles.option(value === option.value)}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "#333355";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    value === option.value ? "#3a4a5f" : "transparent";
                }}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DropdownSelect;
