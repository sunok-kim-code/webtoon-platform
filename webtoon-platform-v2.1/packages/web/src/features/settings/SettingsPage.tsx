// ============================================================
// SettingsPage — Firebase 및 API 키 설정 (v2.1)
// ============================================================

import { useState, useEffect } from "react";
import { getFirebaseConfig, saveFirebaseConfig, saveApiKeys, GEMINI_MODELS, getCurrentModelId, setGeminiModel, getGeminiAuthMode, testGeminiConnection } from "@/services";
import type { GeminiModelId } from "@/services";
import { KIE_IMAGE_MODELS, getSelectedImageModel, setSelectedImageModel, isKieImageConfigured, type KieImageCategory } from "@/services/kieImageService";

const FIREBASE_FIELDS = [
  { key: "apiKey", label: "API Key", placeholder: "AIza..." },
  { key: "authDomain", label: "Auth Domain", placeholder: "your-project.firebaseapp.com" },
  { key: "projectId", label: "Project ID", placeholder: "your-project-id" },
  { key: "storageBucket", label: "Storage Bucket", placeholder: "your-project.appspot.com" },
  { key: "messagingSenderId", label: "Messaging Sender ID", placeholder: "123456789" },
  { key: "appId", label: "App ID", placeholder: "1:123456789:web:abc123" },
];

const API_KEY_FIELDS = [
  { key: "ANTHROPIC_API_KEY", label: "✨ Anthropic API Key (Claude Sonnet 4.6 — 최신)", placeholder: "sk-ant-..." },
  { key: "GEMINI_API_KEY", label: "⭐ Gemini API Key (Google AI Studio — 권장)", placeholder: "AIzaSy..." },
  { key: "VERTEX_PROJECT_ID", label: "Vertex AI Project ID (대체용)", placeholder: "rhivclass" },
  { key: "VERTEX_LOCATION", label: "Vertex AI Location", placeholder: "us-central1" },
  { key: "VERTEX_ACCESS_TOKEN", label: "Vertex AI Access Token (1시간 만료)", placeholder: "ya29.a0..." },
  { key: "KIE_API_KEY", label: "Kie API Key (Seedream 4.0)", placeholder: "0afd..." },
  { key: "XAI_API_KEY", label: "xAI (Grok) API Key" },
  { key: "NINJACHAT_API_KEY", label: "NinjaChat API Key" },
  { key: "STABILITY_API_KEY", label: "Stability AI API Key" },
  { key: "SIRAY_API_KEY", label: "Siray API Key" },
];

export function SettingsPage() {
  const [firebaseConfig, setFirebaseConfig] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [jsonInput, setJsonInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "json">("form");
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(getCurrentModelId());
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [selectedImageModel, setSelectedImageModelState] = useState(getSelectedImageModel());
  const [imageCategory, setImageCategory] = useState<KieImageCategory | "all">("all");

  // Load existing config
  useEffect(() => {
    const cfg = getFirebaseConfig();
    if (cfg) setFirebaseConfig(cfg);

    // Load API keys
    const keys: Record<string, string> = {};
    API_KEY_FIELDS.forEach(({ key }) => {
      const val = localStorage.getItem(key);
      if (val) keys[key] = val;
    });
    setApiKeys(keys);
  }, []);

  const handleFirebaseChange = (key: string, value: string) => {
    setFirebaseConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleApiKeyChange = (key: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageModelChange = (modelId: string) => {
    setSelectedImageModelState(modelId);
    // 설정 페이지에서는 localStorage에 저장하지 않음
    // Pipeline 페이지의 드롭다운에서 선택한 값만 실제 생성에 영향을 미침
  };

  const handleModelChange = (modelId: GeminiModelId) => {
    setSelectedModel(modelId);
    setGeminiModel(modelId);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testGeminiConnection();
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = () => {
    // Save Firebase config
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
      saveFirebaseConfig(firebaseConfig);
    }

    // Save API keys to localStorage + Firebase
    const keysToSave: Record<string, string> = {};
    Object.entries(apiKeys).forEach(([key, value]) => {
      if (value) {
        localStorage.setItem(key, value);
        keysToSave[key] = value;
      }
    });
    // Firebase에도 저장 (다른 기기에서 동기화용)
    if (Object.keys(keysToSave).length > 0) {
      saveApiKeys(keysToSave).catch(err => console.warn("[Settings] Firebase API key save failed:", err));
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);

      // Support various JSON formats
      if (parsed.firebase) {
        setFirebaseConfig(parsed.firebase);
      } else if (parsed.apiKey && parsed.projectId) {
        setFirebaseConfig(parsed);
      }

      if (parsed.apiKeys) {
        setApiKeys((prev) => ({ ...prev, ...parsed.apiKeys }));
      }

      setActiveTab("form");
    } catch {
      alert("JSON 형식이 올바르지 않습니다.");
    }
  };

  const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>설정</h1>

      {/* Status Banner */}
      <div style={isConfigured ? styles.statusOk : styles.statusWarn}>
        {isConfigured
          ? `✅ Firebase 연결됨 — ${firebaseConfig.projectId}`
          : "⚠️ Firebase가 설정되지 않았습니다. 아래에서 설정해주세요."}
      </div>

      {saved && (
        <div style={styles.savedBanner}>저장 완료!</div>
      )}

      {/* Tab Switcher */}
      <div style={styles.tabRow}>
        <button
          onClick={() => setActiveTab("form")}
          style={activeTab === "form" ? styles.tabActive : styles.tab}
        >
          개별 입력
        </button>
        <button
          onClick={() => setActiveTab("json")}
          style={activeTab === "json" ? styles.tabActive : styles.tab}
        >
          JSON 붙여넣기
        </button>
      </div>

      {activeTab === "json" ? (
        <div style={styles.section}>
          <p style={styles.hint}>
            Firebase Console에서 복사한 config JSON을 붙여넣으세요.
            <br />
            형식: {`{ "apiKey": "...", "projectId": "...", ... }`} 또는{" "}
            {`{ "firebase": {...}, "apiKeys": {...} }`}
          </p>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={`{\n  "apiKey": "AIza...",\n  "authDomain": "my-project.firebaseapp.com",\n  "projectId": "my-project-id",\n  "storageBucket": "my-project.appspot.com",\n  "messagingSenderId": "123456789",\n  "appId": "1:123:web:abc"\n}`}
            style={styles.jsonTextarea}
          />
          <button onClick={handleJsonImport} style={styles.importBtn}>
            JSON 가져오기
          </button>
        </div>
      ) : (
        <>
          {/* Firebase Config */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Firebase 설정</h2>
            <div style={styles.grid}>
              {FIREBASE_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} style={styles.field}>
                  <label style={styles.label}>{label}</label>
                  <input
                    type="text"
                    value={firebaseConfig[key] || ""}
                    onChange={(e) => handleFirebaseChange(key, e.target.value)}
                    placeholder={placeholder || ""}
                    style={styles.input}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Gemini Model Selection */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Gemini 씬 분석 모델</h2>
            <p style={styles.hint}>
              씬 분석에 사용할 Gemini 모델을 선택하세요. 현재: <strong>{getGeminiAuthMode()}</strong>
            </p>
            <div style={styles.modelGrid}>
              {GEMINI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelChange(model.id)}
                  style={selectedModel === model.id ? styles.modelCardActive : styles.modelCard}
                >
                  <div style={styles.modelName}>
                    {model.name}
                    {model.provider === "kie" && <span style={styles.kieBadge}>Kie.ai</span>}
                    {model.provider === "google" && <span style={styles.googleBadge}>Google</span>}
                  </div>
                  <div style={styles.modelDesc}>{model.description}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                style={styles.testBtn}
              >
                {testing ? "테스트 중..." : "연결 테스트"}
              </button>
              {testResult && (
                <span style={{ fontSize: "13px", color: testResult.success ? "#28a745" : "#dc3545" }}>
                  {testResult.success ? "✅" : "❌"} {testResult.message}
                </span>
              )}
            </div>
          </div>

          {/* Image Model Selection */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>이미지 생성 모델 (Kie.ai)</h2>
            <p style={styles.hint}>
              패널 이미지 생성에 사용할 모델을 선택하세요.
              현재: <strong>{KIE_IMAGE_MODELS.find(m => m.id === selectedImageModel)?.name || selectedImageModel}</strong>
              {!isKieImageConfigured() && <span style={{ color: "#e67e22", marginLeft: "8px" }}>⚠️ KIE_API_KEY 필요</span>}
            </p>
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
              {(["all", "google", "seedream", "flux", "grok", "gpt", "ideogram", "qwen", "other"] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setImageCategory(cat)}
                  style={{
                    padding: "4px 10px",
                    border: imageCategory === cat ? "2px solid #667eea" : "1px solid #ddd",
                    borderRadius: "14px",
                    background: imageCategory === cat ? "#f0f0ff" : "#fafafa",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: imageCategory === cat ? "600" : "400",
                    color: imageCategory === cat ? "#667eea" : "#666",
                  }}
                >
                  {cat === "all" ? "전체" : cat === "google" ? "Google" : cat === "seedream" ? "Seedream" : cat === "flux" ? "Flux" : cat === "grok" ? "Grok" : cat === "gpt" ? "GPT" : cat === "ideogram" ? "Ideogram" : cat === "qwen" ? "Qwen" : "기타"}
                </button>
              ))}
            </div>
            <div style={styles.modelGrid}>
              {KIE_IMAGE_MODELS
                .filter(m => imageCategory === "all" || m.category === imageCategory)
                .map(model => (
                <button
                  key={model.id}
                  onClick={() => handleImageModelChange(model.id)}
                  style={selectedImageModel === model.id ? styles.modelCardActive : styles.modelCard}
                >
                  <div style={styles.modelName}>
                    {model.name}
                    <span style={{
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      backgroundColor: model.category === "google" ? "#4285f4" : model.category === "seedream" ? "#ff6b35" : model.category === "flux" ? "#7c3aed" : model.category === "grok" ? "#1da1f2" : model.category === "gpt" ? "#10a37f" : model.category === "ideogram" ? "#e91e63" : model.category === "qwen" ? "#ff9800" : "#888",
                      color: "white",
                      fontWeight: "500",
                    }}>
                      {model.category === "google" ? "Google" : model.category === "seedream" ? "Seedream" : model.category === "flux" ? "Flux" : model.category === "grok" ? "Grok" : model.category === "gpt" ? "GPT" : model.category === "ideogram" ? "Ideogram" : model.category === "qwen" ? "Qwen" : model.category}
                    </span>
                  </div>
                  <div style={styles.modelDesc}>{model.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>AI API 키</h2>
            <div style={styles.grid}>
              {API_KEY_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} style={styles.field}>
                  <label style={styles.label}>{label}</label>
                  <input
                    type="password"
                    value={apiKeys[key] || ""}
                    onChange={(e) => handleApiKeyChange(key, e.target.value)}
                    placeholder={placeholder || "입력하세요"}
                    style={styles.input}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Save Button */}
      <div style={styles.actions}>
        <button onClick={handleSave} style={styles.saveBtn}>
          설정 저장
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "24px",
    maxWidth: "900px",
    margin: "0 auto",
  } as const,
  title: {
    fontSize: "28px",
    fontWeight: "bold" as const,
    margin: "0 0 20px 0",
    color: "#333",
  },
  statusOk: {
    padding: "12px 16px",
    backgroundColor: "#d4edda",
    color: "#155724",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "14px",
    fontWeight: "500" as const,
  },
  statusWarn: {
    padding: "12px 16px",
    backgroundColor: "#fff3cd",
    color: "#856404",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "14px",
    fontWeight: "500" as const,
  },
  savedBanner: {
    padding: "12px 16px",
    backgroundColor: "#667eea",
    color: "white",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "14px",
    fontWeight: "600" as const,
    textAlign: "center" as const,
  },
  tabRow: {
    display: "flex",
    gap: "0",
    marginBottom: "24px",
    borderBottom: "2px solid #e0e0e0",
  } as const,
  tab: {
    padding: "10px 20px",
    border: "none",
    background: "transparent",
    color: "#666",
    fontSize: "14px",
    fontWeight: "500" as const,
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    marginBottom: "-2px",
  },
  tabActive: {
    padding: "10px 20px",
    border: "none",
    background: "transparent",
    color: "#667eea",
    fontSize: "14px",
    fontWeight: "600" as const,
    cursor: "pointer",
    borderBottom: "2px solid #667eea",
    marginBottom: "-2px",
  },
  section: {
    marginBottom: "32px",
  } as const,
  sectionTitle: {
    fontSize: "18px",
    fontWeight: "600" as const,
    color: "#333",
    margin: "0 0 16px 0",
  },
  hint: {
    fontSize: "13px",
    color: "#666",
    marginBottom: "12px",
    lineHeight: "1.5",
  } as const,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
    gap: "16px",
  } as const,
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600" as const,
    color: "#555",
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    fontFamily: "monospace",
    boxSizing: "border-box" as const,
    width: "100%",
  },
  jsonTextarea: {
    width: "100%",
    minHeight: "200px",
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "13px",
    fontFamily: "monospace",
    boxSizing: "border-box" as const,
    resize: "vertical" as const,
    lineHeight: "1.5",
  },
  importBtn: {
    marginTop: "12px",
    padding: "10px 20px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600" as const,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: "20px",
    borderTop: "1px solid #e0e0e0",
  } as const,
  saveBtn: {
    padding: "12px 32px",
    backgroundColor: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600" as const,
  },
  modelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "12px",
  } as const,
  modelCard: {
    padding: "14px 16px",
    border: "2px solid #e0e0e0",
    borderRadius: "10px",
    background: "#fafafa",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s",
  },
  modelCardActive: {
    padding: "14px 16px",
    border: "2px solid #667eea",
    borderRadius: "10px",
    background: "#f0f0ff",
    cursor: "pointer",
    textAlign: "left" as const,
    boxShadow: "0 0 0 3px rgba(102,126,234,0.15)",
  },
  modelName: {
    fontSize: "14px",
    fontWeight: "600" as const,
    color: "#333",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  modelDesc: {
    fontSize: "12px",
    color: "#888",
  },
  kieBadge: {
    fontSize: "10px",
    padding: "1px 6px",
    borderRadius: "4px",
    backgroundColor: "#ff6b35",
    color: "white",
    fontWeight: "500" as const,
  },
  googleBadge: {
    fontSize: "10px",
    padding: "1px 6px",
    borderRadius: "4px",
    backgroundColor: "#4285f4",
    color: "white",
    fontWeight: "500" as const,
  },
  testBtn: {
    padding: "8px 16px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600" as const,
  },
};
