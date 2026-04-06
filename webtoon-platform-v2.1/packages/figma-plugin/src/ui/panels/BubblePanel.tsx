// ============================================================
// Bubble Panel - Speech Bubble/Dialogue UI
// ============================================================

import React, { useState, useEffect } from "react";
import DropdownSelect from "../components/DropdownSelect";

interface BubblePanelProps {
  onMessage: (type: string, payload?: any) => void;
}

interface BubbleType {
  value: string;
  label: string;
}

interface Character {
  value: string;
  label: string;
}

const BUBBLE_TYPES: BubbleType[] = [
  { value: "speech", label: "기본 타원" },
  { value: "speechWide", label: "넓은 타원" },
  { value: "speechFlat", label: "원형 (우측)" },
  { value: "speechRound", label: "원형 (우측하단)" },
  { value: "shout", label: "폭발형" },
  { value: "gourd", label: "이중 말풍선" },
  { value: "thought", label: "생각" },
  { value: "cloud", label: "구름" },
  { value: "box", label: "사각형" },
  { value: "wave", label: "물결" },
  { value: "concentration", label: "집중선" },
  { value: "narration", label: "나레이션" },
  { value: "whisper", label: "속삭임" },
];

const BubblePanel: React.FC<BubblePanelProps> = ({ onMessage }) => {
  const [selectedType, setSelectedType] = useState("speech");
  const [text, setText] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [loading, setLoading] = useState(false);
  const [characterColor, setCharacterColor] = useState("#333333");

  // Request characters list on mount
  useEffect(() => {
    onMessage("GET_CHARACTERS");
  }, [onMessage]);

  // Handle incoming characters data
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === "CHARACTERS_LIST") {
        const charList = msg.payload?.characters || [];
        setCharacters(
          charList.map((c: any) => ({
            value: c.id,
            label: c.name || c.id,
          }))
        );
      }

      if (msg.type === "CHARACTER_SELECTED") {
        const color = msg.payload?.color || "#333333";
        setCharacterColor(color);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleCharacterSelect = (charId: string) => {
    setSelectedCharacter(charId);
    onMessage("SELECT_CHARACTER", { characterId: charId });
  };

  const handlePlaceBubble = () => {
    if (!text.trim()) {
      alert("텍스트를 입력해주세요.");
      return;
    }

    setLoading(true);
    onMessage("ADD_BUBBLE", {
      type: selectedType,
      text: text.trim(),
      characterId: selectedCharacter || null,
      characterColor: characterColor,
    });

    // Clear text after placing
    setTimeout(() => {
      setText("");
      setLoading(false);
    }, 500);
  };

  const styles = {
    section: {
      marginBottom: "16px",
    },
    label: {
      display: "block" as const,
      fontSize: "11px",
      fontWeight: 600,
      color: "#999",
      textTransform: "uppercase" as const,
      marginBottom: "4px",
    },
    textInput: {
      width: "100%",
      minHeight: "60px",
      padding: "8px 12px",
      backgroundColor: "#2a2a40",
      border: "1px solid #3a3a55",
      borderRadius: "4px",
      color: "#e0e0e0",
      fontSize: "12px",
      fontFamily: "'Inter', sans-serif",
      resize: "vertical" as const,
      outline: "none",
      transition: "border-color 0.2s",
    },
    typeGrid: {
      display: "grid" as const,
      gridTemplateColumns: "1fr",
      gap: "8px",
      marginBottom: "12px",
    },
    typeButton: (isSelected: boolean) => ({
      padding: "8px 10px",
      backgroundColor: isSelected ? "#3a4a6f" : "#2a2a40",
      border: isSelected ? "2px solid #4fc3f7" : "1px solid #3a3a55",
      borderRadius: "4px",
      color: isSelected ? "#4fc3f7" : "#e0e0e0",
      fontSize: "11px",
      cursor: "pointer" as const,
      transition: "all 0.2s",
      fontWeight: isSelected ? 600 : 400,
    }),
    colorPreview: {
      display: "inline-block" as const,
      width: "12px",
      height: "12px",
      borderRadius: "2px",
      marginRight: "6px",
      backgroundColor: characterColor,
      border: "1px solid #999",
      verticalAlign: "middle" as const,
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
  };

  return (
    <div>
      <div style={styles.section}>
        <label style={styles.label}>말풍선 유형</label>
        <div style={styles.typeGrid}>
          {BUBBLE_TYPES.map((bubbleType) => (
            <button
              key={bubbleType.value}
              style={styles.typeButton(selectedType === bubbleType.value)}
              onClick={() => setSelectedType(bubbleType.value)}
            >
              {bubbleType.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>텍스트</label>
        <textarea
          style={styles.textInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="말풍선에 들어갈 텍스트를 입력하세요..."
        />
      </div>

      <div style={styles.section}>
        <DropdownSelect
          label="캐릭터"
          options={characters}
          value={selectedCharacter}
          onChange={handleCharacterSelect}
          placeholder="캐릭터를 선택하세요"
        />
        {selectedCharacter && (
          <div style={{ fontSize: "10px", color: "#999", marginTop: "4px" }}>
            <span style={styles.colorPreview} />
            색상: {characterColor}
          </div>
        )}
      </div>

      <button
        style={styles.button(!text.trim() || loading)}
        onClick={handlePlaceBubble}
        disabled={!text.trim() || loading}
      >
        {loading ? "말풍선 배치 중..." : "말풍선 배치"}
      </button>
    </div>
  );
};

export default BubblePanel;
