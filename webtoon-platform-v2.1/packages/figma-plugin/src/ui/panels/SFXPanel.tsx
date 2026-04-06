// ============================================================
// SFX Panel - Sound Effects Library UI
// ============================================================

import React, { useState } from "react";

interface SFXPanelProps {
  onMessage: (type: string, payload?: any) => void;
}

interface SFXCategory {
  name: string;
  examples: string[];
}

const SFX_LIBRARY: Record<string, SFXCategory> = {
  impact: {
    name: "타격",
    examples: ["쾅!", "퍽!", "빠직!", "와장창!", "탁!", "쿵!"],
  },
  water: {
    name: "물/바람",
    examples: ["콸콸", "솨아", "휘이잉", "쏴아", "파닥"],
  },
  electric: {
    name: "전기/빛",
    examples: ["찌직!", "번쩍!", "파지직!", "치지직", "스파크!"],
  },
  speed: {
    name: "이동/속도",
    examples: ["슈우웅", "휙!", "부릉!", "비이잉", "쓩!"],
  },
  rumble: {
    name: "진동/울림",
    examples: ["우우웅", "드르르", "와르르", "덜덜덜", "부르르", "쿵"],
  },
  emotion: {
    name: "감정/심리",
    examples: ["두근두근", "울컥", "심쿵", "으으", "후유"],
  },
  silence: {
    name: "정적/분위기",
    examples: ["...", "쉬잇", "조용", "싸늘", "서늘"],
  },
  comic: {
    name: "코믹",
    examples: ["뿅!", "뽕!", "삐용", "뿌우", "헉!"],
  },
  nature: {
    name: "자연/환경",
    examples: ["우르르", "번개!", "추적추적", "사각사각", "바스락"],
  },
};

const SFXPanel: React.FC<SFXPanelProps> = ({ onMessage }) => {
  const [searchText, setSearchText] = useState("");
  const [selectedSFX, setSelectedSFX] = useState("");
  const [loading, setLoading] = useState(false);

  // Filter SFX based on search
  const filteredLibrary = Object.entries(SFX_LIBRARY).reduce(
    (acc, [key, category]) => {
      if (
        category.name.toLowerCase().includes(searchText.toLowerCase()) ||
        category.examples.some((ex) =>
          ex.toLowerCase().includes(searchText.toLowerCase())
        )
      ) {
        acc[key] = category;
      }
      return acc;
    },
    {} as Record<string, SFXCategory>
  );

  const handlePlaceSFX = (sfx: string) => {
    setLoading(true);
    setSelectedSFX(sfx);
    onMessage("ADD_SFX", {
      text: sfx,
      timestamp: Date.now(),
    });

    setTimeout(() => {
      setLoading(false);
      setSelectedSFX("");
    }, 500);
  };

  const styles = {
    container: {
      display: "flex" as const,
      flexDirection: "column" as const,
      gap: "12px",
    },
    searchBox: {
      marginBottom: "8px",
    },
    searchInput: {
      width: "100%",
      padding: "8px 12px",
      backgroundColor: "#2a2a40",
      border: "1px solid #3a3a55",
      borderRadius: "4px",
      color: "#e0e0e0",
      fontSize: "12px",
      outline: "none",
      transition: "border-color 0.2s",
    },
    category: {
      marginBottom: "12px",
    },
    categoryTitle: {
      fontSize: "11px",
      fontWeight: 600,
      color: "#4fc3f7",
      marginBottom: "6px",
      textTransform: "uppercase" as const,
      borderBottom: "1px solid #2a2a40",
      paddingBottom: "4px",
    },
    sfxGrid: {
      display: "grid" as const,
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
    },
    sfxButton: (isSelected: boolean, isLoading: boolean) => ({
      padding: "8px 10px",
      backgroundColor:
        isSelected || isLoading ? "#3a4a6f" : "#2a2a40",
      border:
        isSelected || isLoading ? "2px solid #4fc3f7" : "1px solid #3a3a55",
      borderRadius: "4px",
      color: isSelected ? "#4fc3f7" : "#e0e0e0",
      fontSize: "11px",
      fontWeight: isSelected ? 600 : 400,
      cursor: "pointer" as const,
      transition: "all 0.15s",
      textAlign: "center" as const,
      whiteSpace: "nowrap" as const,
      overflow: "hidden" as const,
      textOverflow: "ellipsis" as const,
    }),
    infoBox: {
      padding: "8px 12px",
      backgroundColor: "#2a2a40",
      borderRadius: "4px",
      fontSize: "11px",
      color: "#999",
      borderLeft: "2px solid #4fc3f7",
      marginBottom: "8px",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.infoBox}>
        이펙트음을 클릭하여 캔버스에 배치합니다.
      </div>

      <div style={styles.searchBox}>
        <input
          type="text"
          style={styles.searchInput}
          placeholder="효과음 검색..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto" as const,
        }}
      >
        {Object.entries(filteredLibrary).length === 0 ? (
          <div style={{ color: "#666", fontSize: "12px", textAlign: "center" as const, paddingTop: "20px" }}>
            검색 결과가 없습니다.
          </div>
        ) : (
          Object.entries(filteredLibrary).map(([key, category]) => (
            <div key={key} style={styles.category}>
              <div style={styles.categoryTitle}>{category.name}</div>
              <div style={styles.sfxGrid}>
                {category.examples.map((sfx, idx) => (
                  <button
                    key={`${key}-${idx}`}
                    style={{
                      ...styles.sfxButton(
                        selectedSFX === sfx,
                        loading && selectedSFX === sfx
                      ),
                    }}
                    onClick={() => handlePlaceSFX(sfx)}
                    disabled={loading && selectedSFX !== sfx}
                  >
                    {sfx}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SFXPanel;
