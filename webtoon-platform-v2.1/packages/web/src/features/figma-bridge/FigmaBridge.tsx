// ============================================================
// FigmaBridge — Figma 플러그인 연동 UI (v2.1)
// 웹앱 ↔ Figma Plugin 양방향 통신
// ============================================================

import { useState, useEffect } from "react";
import { useFigmaBridgeStore } from "@/stores";

type ConnectionStatus = "connected" | "disconnected" | "syncing" | "error";

const LAYOUT_PRESETS = [
  { id: "standard", name: "표준 웹툰 레이아웃", width: 800, height: 1200 },
  { id: "vertical", name: "수직 스크롤", width: 800, height: 2400 },
  { id: "webtoon", name: "웹툰 황금비", width: 800, height: 1600 },
];

export function FigmaBridge() {
  const { exports, syncStatus, lastError, setSyncStatus, setError } =
    useFigmaBridgeStore();

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [selectedLayoutPreset, setSelectedLayoutPreset] = useState("standard");
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  useEffect(() => {
    // TODO: Implement postMessage handshake with Figma plugin
    // This would establish the connection and listen for messages
    const checkConnection = () => {
      // Simulate connection check
      setConnectionStatus("connected");
      setLastSyncTime(Date.now());
    };

    checkConnection();
  }, []);

  const handleSendToFigma = async () => {
    if (connectionStatus !== "connected") {
      setError("Figma 플러그인이 연결되어 있지 않습니다");
      return;
    }

    setIsExporting(true);
    setSyncStatus("exporting");
    setExportProgress(0);

    try {
      // Simulate export process
      for (let i = 0; i <= 100; i += 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setExportProgress(i);
      }

      setSyncStatus("idle");
      setLastSyncTime(Date.now());
      alert("Figma로 내보내기 완료!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "내보내기 실패");
      setSyncStatus("error");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleRetryConnection = () => {
    setConnectionStatus("syncing");
    setTimeout(() => {
      setConnectionStatus("connected");
      setLastSyncTime(Date.now());
    }, 1000);
  };

  const exportEntries = Object.entries(exports);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Figma 연동</h2>

      {/* Connection Status */}
      <div style={styles.statusCard(connectionStatus)}>
        <div style={styles.statusHeader}>
          <span
            style={styles.statusIndicator(connectionStatus)}
          />
          <div style={styles.statusText}>
            <h3 style={styles.statusTitle}>
              {connectionStatus === "connected" && "Figma 플러그인 연결됨"}
              {connectionStatus === "disconnected" && "연결 끊김"}
              {connectionStatus === "syncing" && "연결 중..."}
              {connectionStatus === "error" && "연결 오류"}
            </h3>
            <p style={styles.statusSubtitle}>
              {lastSyncTime
                ? `마지막 동기화: ${new Date(lastSyncTime).toLocaleString(
                    "ko-KR"
                  )}`
                : "아직 동기화되지 않음"}
            </p>
          </div>
        </div>

        {connectionStatus === "disconnected" && (
          <button
            onClick={handleRetryConnection}
            style={styles.reconnectBtn}
          >
            재연결
          </button>
        )}

        {lastError && (
          <div style={styles.errorMessage}>
            ⚠ {lastError}
          </div>
        )}
      </div>

      {/* Export Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>에피소드 내보내기</h3>

        <div style={styles.formGroup}>
          <label style={styles.label}>레이아웃 프리셋</label>
          <select
            value={selectedLayoutPreset}
            onChange={(e) => setSelectedLayoutPreset(e.target.value)}
            style={styles.select}
            disabled={isExporting}
          >
            {LAYOUT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.width}x{preset.height}px)
              </option>
            ))}
          </select>
        </div>

        <div style={styles.presetDescription}>
          <p>선택된 프리셋이 Figma에서 페이지 크기로 사용됩니다</p>
        </div>

        <button
          onClick={handleSendToFigma}
          disabled={
            connectionStatus !== "connected" ||
            exportEntries.length === 0 ||
            isExporting
          }
          style={styles.sendBtn(
            connectionStatus === "connected" &&
              exportEntries.length > 0 &&
              !isExporting
          )}
        >
          {isExporting
            ? `Figma로 전송 중... ${exportProgress}%`
            : "→ Figma로 전송"}
        </button>

        {isExporting && (
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${exportProgress}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Export History */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>내보내기 이력</h3>
        {exportEntries.length === 0 ? (
          <p style={styles.emptyText}>
            아직 Figma로 내보낸 에피소드가 없습니다
          </p>
        ) : (
          <div style={styles.historyGrid}>
            {exportEntries.map(([episodeId, doc]) => (
              <div key={episodeId} style={styles.historyCard}>
                <div style={styles.historyHeader}>
                  <h4 style={styles.historyTitle}>
                    {doc.manifest?.episodeNumber ? `EP ${doc.manifest.episodeNumber}` : episodeId}
                  </h4>
                  <span style={styles.historyTime}>
                    {new Date(doc.exportedAt).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div style={styles.historyMeta}>
                  <span>패널: {doc.manifest?.panels?.length || 0}개</span>
                  <span>•</span>
                  <span>상태: {doc.status || "완료"}</span>
                </div>
                <div style={styles.historyActions}>
                  <button style={styles.smallBtn}>다시 전송</button>
                  <button style={styles.smallBtn}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync-back Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Figma에서 가져오기</h3>

        <div style={styles.syncBackInfo}>
          <p>
            Figma 플러그인에서 수정한 버블 위치, 말풍선 스타일 등을 웹앱에
            반영합니다
          </p>
        </div>

        <button
          onClick={() => {
            setSyncStatus("syncing");
            setTimeout(() => {
              setSyncStatus("idle");
              alert("Figma에서 가져오기 완료!");
            }, 1500);
          }}
          disabled={connectionStatus !== "connected" || syncStatus === "syncing"}
          style={styles.syncBackBtn(
            connectionStatus === "connected" && syncStatus !== "syncing"
          )}
        >
          {syncStatus === "syncing" ? "동기화 중..." : "변경사항 가져오기"}
        </button>

        <div style={styles.syncBackNote}>
          <small>
            마지막 가져오기:{" "}
            {lastSyncTime
              ? new Date(lastSyncTime).toLocaleString("ko-KR")
              : "없음"}
          </small>
        </div>
      </div>

      {/* Settings */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>설정</h3>

        <div style={styles.settingItem}>
          <label style={styles.settingLabel}>
            <input
              type="checkbox"
              defaultChecked
              style={styles.checkbox}
            />
            자동 동기화 활성화
          </label>
          <p style={styles.settingHint}>
            변경사항이 자동으로 Figma와 동기화됩니다
          </p>
        </div>

        <div style={styles.settingItem}>
          <label style={styles.settingLabel}>
            <input
              type="checkbox"
              defaultChecked
              style={styles.checkbox}
            />
            내보내기 성공 알림
          </label>
          <p style={styles.settingHint}>
            Figma 내보내기 완료 시 알림을 받습니다
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "24px",
    maxWidth: "1000px",
    margin: "0 auto",
  } as const,
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0 0 24px 0",
    color: "#333",
  } as const,
  statusCard: (status: ConnectionStatus) => ({
    backgroundColor: "white",
    border:
      status === "connected"
        ? "2px solid #10B981"
        : status === "error"
        ? "2px solid #f56565"
        : "2px solid #CBD5E0",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "24px",
  } as const),
  statusHeader: {
    display: "flex",
    gap: "12px",
    marginBottom: "12px",
  } as const,
  statusIndicator: (status: ConnectionStatus) => ({
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor:
      status === "connected"
        ? "#10B981"
        : status === "error"
        ? "#f56565"
        : "#CBD5E0",
    flexShrink: 0,
    marginTop: "4px",
  } as const),
  statusText: {
    flex: 1,
  } as const,
  statusTitle: {
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 4px 0",
    color: "#333",
  } as const,
  statusSubtitle: {
    fontSize: "13px",
    color: "#666",
    margin: 0,
  } as const,
  reconnectBtn: {
    padding: "10px 20px",
    backgroundColor: "#007AFF",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  } as const,
  errorMessage: {
    marginTop: "12px",
    padding: "12px",
    backgroundColor: "#fff5f5",
    border: "1px solid #fca5a5",
    borderRadius: "6px",
    color: "#742a2a",
    fontSize: "12px",
  } as const,
  section: {
    backgroundColor: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "16px",
  } as const,
  sectionTitle: {
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 16px 0",
    color: "#333",
  } as const,
  formGroup: {
    marginBottom: "12px",
  } as const,
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "6px",
    color: "#333",
  } as const,
  select: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "13px",
    boxSizing: "border-box" as const,
  } as const,
  presetDescription: {
    backgroundColor: "#f0f7ff",
    border: "1px solid #bfdbfe",
    borderRadius: "6px",
    padding: "10px 12px",
    marginBottom: "12px",
    fontSize: "12px",
    color: "#1e40af",
  } as const,
  sendBtn: (isEnabled: boolean) => ({
    width: "100%",
    padding: "12px",
    backgroundColor: isEnabled ? "#8B5CF6" : "#ccc",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: isEnabled ? "pointer" : "not-allowed",
    fontSize: "14px",
    fontWeight: "600",
  } as const),
  progressBar: {
    width: "100%",
    height: "6px",
    backgroundColor: "#e0e0e0",
    borderRadius: "3px",
    overflow: "hidden",
    marginTop: "12px",
  } as const,
  progressFill: {
    height: "100%",
    backgroundColor: "#8B5CF6",
    transition: "width 0.3s ease",
  } as const,
  emptyText: {
    color: "#999",
    fontSize: "13px",
    textAlign: "center" as const,
    padding: "20px 0",
    margin: 0,
  } as const,
  historyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: "12px",
  } as const,
  historyCard: {
    backgroundColor: "#f9f9f9",
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "12px",
  } as const,
  historyHeader: {
    marginBottom: "8px",
  } as const,
  historyTitle: {
    fontSize: "13px",
    fontWeight: "600",
    margin: "0 0 4px 0",
    color: "#333",
  } as const,
  historyTime: {
    fontSize: "11px",
    color: "#999",
  } as const,
  historyMeta: {
    fontSize: "11px",
    color: "#666",
    marginBottom: "8px",
    display: "flex",
    gap: "4px",
  } as const,
  historyActions: {
    display: "flex",
    gap: "4px",
  } as const,
  smallBtn: {
    flex: 1,
    padding: "4px 8px",
    backgroundColor: "white",
    border: "1px solid #ddd",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: "600",
    color: "#666",
  } as const,
  syncBackInfo: {
    backgroundColor: "#f0f7ff",
    border: "1px solid #bfdbfe",
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "12px",
    fontSize: "12px",
    color: "#1e40af",
  } as const,
  syncBackBtn: (isEnabled: boolean) => ({
    width: "100%",
    padding: "12px",
    backgroundColor: isEnabled ? "#10B981" : "#ccc",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: isEnabled ? "pointer" : "not-allowed",
    fontSize: "14px",
    fontWeight: "600",
  } as const),
  syncBackNote: {
    fontSize: "11px",
    color: "#999",
    marginTop: "8px",
    textAlign: "center" as const,
  } as const,
  settingItem: {
    paddingBottom: "12px",
    borderBottom: "1px solid #e0e0e0",
    marginBottom: "12px",
  } as const,
  settingLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: "13px",
    fontWeight: "500",
    color: "#333",
    cursor: "pointer",
  } as const,
  checkbox: {
    marginRight: "8px",
    cursor: "pointer",
  } as const,
  settingHint: {
    fontSize: "11px",
    color: "#999",
    margin: "6px 0 0 24px",
  } as const,
};
