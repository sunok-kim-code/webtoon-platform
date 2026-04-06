// ============================================================
// PromptBuilder — AI 프롬프트 자동 구성 (v2.1 신규)
// 레퍼런스 + 씬 컨텍스트 → 최적 프롬프트 생성
// ============================================================

import { useState } from "react";
import { ART_STYLES, ART_STYLE_KEYS } from "./artStyles";
import type { ArtStyleKey } from "./artStyles";

const PANEL_TYPE_TEMPLATES = {
  dialogue: "두 캐릭터가 대화하고 있다",
  action: "액션 장면, 동적인 움직임",
  emotion: "감정적인 표정과 순간",
  transition: "장면 전환, 새로운 장소로 이동",
};

export function PromptBuilder() {
  const [panelType, setPanelType] = useState<
    "dialogue" | "action" | "emotion" | "transition"
  >("dialogue");
  const [artStyle, setArtStyle] = useState<ArtStyleKey>("naverWebtoon");
  const [basePrompt, setBasePrompt] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showManualEdit, setShowManualEdit] = useState(false);

  const handleGeneratePrompt = () => {
    const styleInfo = ART_STYLES[artStyle];
    const template = PANEL_TYPE_TEMPLATES[panelType];

    const fullPrompt = `${styleInfo.prefix}${template}. ${basePrompt}${styleInfo.charSuffix}`;

    setGeneratedPrompt(fullPrompt);
    setManualPrompt(fullPrompt);
  };

  const handleCopyPrompt = () => {
    const promptToCopy = showManualEdit ? manualPrompt : generatedPrompt;
    navigator.clipboard.writeText(promptToCopy);
    alert("프롬프트가 복사되었습니다");
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>프롬프트 빌더</h3>

      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>기본 설정</h4>

        <div style={styles.formGroup}>
          <label style={styles.label}>패널 유형</label>
          <select
            value={panelType}
            onChange={(e) =>
              setPanelType(
                e.target.value as
                  | "dialogue"
                  | "action"
                  | "emotion"
                  | "transition"
              )
            }
            style={styles.select}
          >
            <option value="dialogue">대화 장면</option>
            <option value="action">액션 장면</option>
            <option value="emotion">감정 표현</option>
            <option value="transition">장면 전환</option>
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>아트 스타일</label>
          <select
            value={artStyle}
            onChange={(e) => setArtStyle(e.target.value as ArtStyleKey)}
            style={styles.select}
          >
            {ART_STYLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {ART_STYLES[key].name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>추가 설명</label>
          <textarea
            placeholder="이 패널을 더 설명해주세요. 예: 실외, 해질녘, 밝은 분위기"
            value={basePrompt}
            onChange={(e) => setBasePrompt(e.target.value)}
            style={styles.textarea}
          />
        </div>

        <button
          onClick={handleGeneratePrompt}
          style={styles.generateBtn}
        >
          프롬프트 생성
        </button>
      </div>

      {generatedPrompt && (
        <>
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>자동 생성된 프롬프트</h4>
            <div style={styles.promptPreview}>
              <p style={styles.promptText}>{generatedPrompt}</p>
            </div>
            <div style={styles.promptActions}>
              <button onClick={handleCopyPrompt} style={styles.copyBtn}>
                복사
              </button>
              <button
                onClick={() => setShowManualEdit(!showManualEdit)}
                style={styles.editBtn}
              >
                {showManualEdit ? "미리보기" : "편집"}
              </button>
            </div>
          </div>

          {showManualEdit && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>프롬프트 수동 편집</h4>
              <textarea
                value={manualPrompt}
                onChange={(e) => setManualPrompt(e.target.value)}
                style={styles.editTextarea}
              />
            </div>
          )}

          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>네거티브 프롬프트</h4>
            <textarea
              placeholder="피하고 싶은 요소들을 입력하세요. 예: 블러, 낮은 품질, 부자연스러운 구도"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              style={styles.textarea}
            />
            <div style={styles.defaultNegatives}>
              <p style={styles.defaultNegativesLabel}>기본 제외 항목:</p>
              <div style={styles.tagList}>
                {[
                  "blurry",
                  "low quality",
                  "distorted",
                  "oversaturated",
                  "unnatural",
                ].map((tag) => (
                  <span key={tag} style={styles.defaultTag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>프로바이더별 최적화 팁</h4>
            <div style={styles.providerTips}>
              <div style={styles.tipItem}>
                <strong>Gemini:</strong>
                <p>
                  상세한 설명 선호, 캐릭터 일관성이 중요한 경우 사용
                </p>
              </div>
              <div style={styles.tipItem}>
                <strong>Stability:</strong>
                <p>배경과 환경 표현에 강함, "landscape", "environment" 강조</p>
              </div>
              <div style={styles.tipItem}>
                <strong>Seedream:</strong>
                <p>
                  캐릭터 스타일 유지에 탁월함, 스타일 지정 필수
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "16px 0",
  } as const,
  title: {
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 16px 0",
    color: "#333",
  } as const,
  section: {
    backgroundColor: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  } as const,
  sectionTitle: {
    fontSize: "13px",
    fontWeight: "600",
    margin: "0 0 12px 0",
    color: "#333",
  } as const,
  formGroup: {
    marginBottom: "12px",
  } as const,
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: "600",
    marginBottom: "6px",
    color: "#333",
  } as const,
  select: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "13px",
    boxSizing: "border-box" as const,
  } as const,
  textarea: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "13px",
    minHeight: "60px",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  } as const,
  generateBtn: {
    width: "100%",
    padding: "10px",
    backgroundColor: "#007AFF",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  } as const,
  promptPreview: {
    backgroundColor: "#f9f9f9",
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "12px",
  } as const,
  promptText: {
    fontSize: "12px",
    lineHeight: "1.6",
    margin: 0,
    color: "#333",
    wordBreak: "break-word" as const,
  } as const,
  promptActions: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
  } as const,
  copyBtn: {
    flex: 1,
    padding: "8px",
    backgroundColor: "#10B981",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
  } as const,
  editBtn: {
    flex: 1,
    padding: "8px",
    backgroundColor: "#F59E0B",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
  } as const,
  editTextarea: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "13px",
    minHeight: "80px",
    fontFamily: "monospace",
    boxSizing: "border-box" as const,
  } as const,
  defaultNegatives: {
    backgroundColor: "#f5f5f5",
    padding: "12px",
    borderRadius: "6px",
    marginTop: "8px",
  } as const,
  defaultNegativesLabel: {
    fontSize: "12px",
    fontWeight: "600",
    margin: "0 0 8px 0",
    color: "#666",
  } as const,
  tagList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "6px",
  } as const,
  defaultTag: {
    display: "inline-block",
    padding: "4px 8px",
    backgroundColor: "#e0e0e0",
    color: "#666",
    fontSize: "11px",
    borderRadius: "4px",
  } as const,
  providerTips: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "12px",
  } as const,
  tipItem: {
    backgroundColor: "#f9f9f9",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #e0e0e0",
  } as const,
};
