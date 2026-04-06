// ============================================================
// AiOrchestrator — AI 프로바이더 통합 관리 UI (v2.1 신규)
// 7+ 프로바이더 선택, 성능 비교, 자동 라우팅
// ============================================================

import { useState } from "react";
import { useAiStore } from "@/stores";
import type { ProviderId } from "@webtoon/shared";

const PROVIDER_INFO: Record<ProviderId, {
  name: string;
  bestFor: string;
  supportsMultiRef: boolean;
}> = {
  "vertex-gemini-flash": {
    name: "Vertex AI Gemini 2.5 Flash",
    bestFor: "빠른 생성, 캐릭터 일관성",
    supportsMultiRef: true,
  },
  "vertex-gemini-pro": {
    name: "Vertex AI Gemini 3 Pro",
    bestFor: "고품질 이미지",
    supportsMultiRef: true,
  },
  "vertex-imagen": {
    name: "Vertex AI Imagen 4.0",
    bestFor: "프로페셔널 이미지",
    supportsMultiRef: true,
  },
  "xai-grok": {
    name: "xAI Grok",
    bestFor: "빠른 생성",
    supportsMultiRef: false,
  },
  "stability-sd35": {
    name: "Stability AI SD3.5",
    bestFor: "배경 및 환경",
    supportsMultiRef: true,
  },
  "seedream-kie": {
    name: "Seedream 4.0 (Kie)",
    bestFor: "캐릭터 일관성",
    supportsMultiRef: true,
  },
  "seedream-higgsfield": {
    name: "Seedream 4.0 (Higgsfield)",
    bestFor: "캐릭터 일관성",
    supportsMultiRef: true,
  },
  "a2e": {
    name: "A2E (Image-to-Video)",
    bestFor: "영상 생성",
    supportsMultiRef: true,
  },
};

export function AiOrchestrator() {
  const {
    activeProvider,
    apiKeys,
    setActiveProvider,
    setApiKey,
    recentResults,
  } = useAiStore();

  const [apiKeyInputs, setApiKeyInputs] = useState<Partial<Record<ProviderId, string>>>(apiKeys);
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const handleApiKeyChange = (provider: ProviderId, key: string) => {
    setApiKeyInputs({ ...apiKeyInputs, [provider]: key });
    setApiKey(provider, key);
  };

  const handleGenerateWithProvider = async (provider: ProviderId) => {
    setActiveProvider(provider);
    setIsGenerating(true);

    // Simulate generation
    setTimeout(() => {
      setIsGenerating(false);
    }, 2000);
  };

  const providerIds = Object.keys(PROVIDER_INFO) as ProviderId[];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>AI 이미지 생성 오케스트레이터</h2>
        {isGenerating && (
          <div style={styles.statusIndicator}>
            <span style={styles.pulse} />
            생성 중...
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>프로바이더 선택 및 설정</h3>
        <div style={styles.providerGrid}>
          {providerIds.map((provider) => {
            const info = PROVIDER_INFO[provider];
            const hasApiKey = !!apiKeyInputs[provider];

            return (
              <div
                key={provider}
                style={styles.providerCard(activeProvider === provider)}
              >
                <div
                  style={styles.providerHeader}
                  onClick={() =>
                    setExpandedProvider(
                      expandedProvider === provider ? null : provider
                    )
                  }
                >
                  <div>
                    <h4 style={styles.providerName}>{info.name}</h4>
                    <p style={styles.providerBestFor}>{info.bestFor}</p>
                  </div>
                  <div style={styles.apiKeyStatus(hasApiKey)}>
                    {hasApiKey ? "✓ 설정됨" : "⚠ 미설정"}
                  </div>
                </div>

                {expandedProvider === provider && (
                  <div style={styles.providerForm}>
                    <label style={styles.label}>API Key</label>
                    <input
                      type="password"
                      placeholder={`${provider} API 키 입력`}
                      value={apiKeyInputs[provider] || ""}
                      onChange={(e) =>
                        handleApiKeyChange(provider, e.target.value)
                      }
                      style={styles.input}
                    />
                    <div style={styles.providerFeatures}>
                      <span>
                        다중 레퍼런스:{" "}
                        {info.supportsMultiRef ? "○" : "✗"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleGenerateWithProvider(provider)}
                      disabled={!hasApiKey || isGenerating}
                      style={styles.selectBtn(hasApiKey && !isGenerating)}
                    >
                      {activeProvider === provider
                        ? "✓ 선택됨"
                        : "이 프로바이더로 생성"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>생성 큐 및 최근 결과</h3>
        {recentResults.length === 0 ? (
          <p style={styles.emptyText}>생성된 이미지가 없습니다</p>
        ) : (
          <div style={styles.resultsGrid}>
            {recentResults.slice(0, 6).map((result, idx) => (
              <div key={idx} style={styles.resultCard}>
                <img
                  src={result.imageUrl}
                  alt="Generated"
                  style={styles.resultImage}
                />
                <div style={styles.resultMeta}>
                  <small style={styles.resultProvider}>
                    {result.providerId}
                  </small>
                  <small style={styles.resultTime}>
                    {result.duration}ms
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>프로바이더 비교</h3>
        <div style={styles.comparisonTable}>
          <div style={styles.tableHeader}>
            <div style={styles.tableCell}>프로바이더</div>
            <div style={styles.tableCell}>최고 품질</div>
            <div style={styles.tableCell}>속도</div>
            <div style={styles.tableCell}>비용</div>
            <div style={styles.tableCell}>캐릭터 일관성</div>
          </div>
          {providerIds.map((provider) => (
            <div key={provider} style={styles.tableRow}>
              <div style={styles.tableCell}>{PROVIDER_INFO[provider].name}</div>
              <div style={styles.tableCell}>★★★★☆</div>
              <div style={styles.tableCell}>빠름</div>
              <div style={styles.tableCell}>중간</div>
              <div style={styles.tableCell}>높음</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "16px 0",
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  } as const,
  title: {
    fontSize: "18px",
    fontWeight: "600",
    margin: 0,
    color: "#333",
  } as const,
  statusIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    color: "#10B981",
    fontWeight: "600",
  } as const,
  pulse: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#10B981",
    animation: "pulse 1.5s infinite",
  } as const,
  section: {
    backgroundColor: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  } as const,
  sectionTitle: {
    fontSize: "14px",
    fontWeight: "600",
    margin: "0 0 12px 0",
    color: "#333",
  } as const,
  providerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "12px",
  } as const,
  providerCard: (isActive: boolean) => ({
    border: isActive ? "2px solid #007AFF" : "1px solid #e0e0e0",
    borderRadius: "6px",
    overflow: "hidden",
    backgroundColor: isActive ? "#f0f7ff" : "white",
  } as const),
  providerHeader: {
    padding: "12px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as const,
  providerName: {
    fontSize: "13px",
    fontWeight: "600",
    margin: "0 0 4px 0",
    color: "#333",
  } as const,
  providerBestFor: {
    fontSize: "12px",
    color: "#666",
    margin: 0,
  } as const,
  apiKeyStatus: (hasKey: boolean) => ({
    padding: "4px 8px",
    borderRadius: "4px",
    backgroundColor: hasKey ? "#d4edda" : "#fff3cd",
    color: hasKey ? "#155724" : "#856404",
    fontSize: "11px",
    fontWeight: "600",
  } as const),
  providerForm: {
    padding: "12px",
    backgroundColor: "#f9f9f9",
    borderTop: "1px solid #e0e0e0",
  } as const,
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: "600",
    marginBottom: "4px",
    color: "#333",
  } as const,
  input: {
    width: "100%",
    padding: "6px 8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "12px",
    marginBottom: "8px",
    boxSizing: "border-box" as const,
  } as const,
  providerFeatures: {
    fontSize: "11px",
    color: "#666",
    marginBottom: "8px",
  } as const,
  selectBtn: (isEnabled: boolean) => ({
    width: "100%",
    padding: "6px",
    backgroundColor: isEnabled ? "#007AFF" : "#ccc",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: isEnabled ? "pointer" : "not-allowed",
    fontSize: "12px",
    fontWeight: "600",
  } as const),
  emptyText: {
    color: "#999",
    fontSize: "13px",
    textAlign: "center" as const,
    padding: "20px 0",
    margin: 0,
  } as const,
  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "12px",
  } as const,
  resultCard: {
    borderRadius: "6px",
    overflow: "hidden",
    backgroundColor: "#f5f5f5",
  } as const,
  resultImage: {
    width: "100%",
    aspectRatio: "1",
    objectFit: "cover" as const,
  },
  resultMeta: {
    padding: "6px",
    fontSize: "11px",
    backgroundColor: "white",
    borderTop: "1px solid #e0e0e0",
  } as const,
  resultProvider: {
    display: "block",
    fontWeight: "600",
    color: "#333",
  } as const,
  resultTime: {
    display: "block",
    color: "#999",
  } as const,
  comparisonTable: {
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid #e0e0e0",
  } as const,
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr",
    backgroundColor: "#f5f5f5",
    borderBottom: "1px solid #e0e0e0",
  } as const,
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr",
    borderBottom: "1px solid #e0e0e0",
  } as const,
  tableCell: {
    padding: "12px",
    fontSize: "12px",
    color: "#333",
  } as const,
};
