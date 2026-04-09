// ============================================================
// Firebase Sync Panel — Firestore queue 리스너
// video-prompt-engine 플러그인의 ui.html 패턴을 React 컴포넌트로 포팅
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";

declare const firebase: any; // Firebase compat SDK (index.html에서 CDN 로드)

interface FirebaseSyncPanelProps {
  onMessage: (type: string, payload?: any) => void;
  onConnectionChange: (connected: boolean) => void;
}

const FirebaseSyncPanel: React.FC<FirebaseSyncPanelProps> = ({ onMessage, onConnectionChange }) => {
  const [fbConfig, setFbConfig] = useState("");
  const [projectId, setProjectId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<Array<{ text: string; type: string; time: string }>>([]);

  const dbRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAtRef = useRef<number>(0);
  const lastMsgIdRef = useRef<string | null>(null);

  const addLog = useCallback((text: string, type = "info") => {
    const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    setLogs(prev => [...prev.slice(-50), { text, type, time }]);
  }, []);

  // 이전 설정 복원
  useEffect(() => {
    onMessage("RESTORE_CONFIG");

    const handleRestore = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg || msg.type !== "RESTORED_CONFIG") return;
      if (msg.config) setFbConfig(msg.config);
      if (msg.projectId) setProjectId(msg.projectId);
    };

    window.addEventListener("message", handleRestore);
    return () => window.removeEventListener("message", handleRestore);
  }, [onMessage]);

  // 연결 해제
  const disconnect = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    setIsConnected(false);
    onConnectionChange(false);
    addLog("연결 해제됨", "warn");
  }, [onConnectionChange, addLog]);

  // Heartbeat 전송
  const sendHeartbeat = useCallback(async () => {
    if (!dbRef.current || !projectId) return;
    try {
      await dbRef.current
        .collection("webtoon_projects").doc(projectId)
        .collection("figma_sync").doc("status")
        .set({
          connected: true,
          lastSyncAt: Date.now(),
          lastHeartbeat: firebase.firestore.FieldValue.serverTimestamp(),
          pluginActive: true,
        }, { merge: true });
    } catch { /* quiet */ }
  }, [projectId]);

  // Firebase 연결
  const connect = useCallback(() => {
    if (isConnected) { disconnect(); return; }

    try {
      const configStr = fbConfig.trim();
      const pid = projectId.trim();
      if (!configStr || !pid) {
        addLog("Firebase 설정과 프로젝트 ID를 입력하세요.", "err");
        return;
      }

      const config = JSON.parse(configStr);
      if (!firebase.apps.length) firebase.initializeApp(config);
      const db = firebase.firestore();
      dbRef.current = db;

      // clientStorage에 설정 저장
      onMessage("SAVE_CONFIG", undefined);
      parent.postMessage({
        pluginMessage: { type: "SAVE_CONFIG", config: configStr, projectId: pid },
      }, "*");

      // Firestore queue 리스너 시작
      connectedAtRef.current = Date.now();
      const queueRef = db.collection("webtoon_projects").doc(pid).collection("figma_sync").doc("queue");

      unsubRef.current = queueRef.onSnapshot((snap: any) => {
        if (!snap.exists) return;
        const msg = snap.data();
        if (!msg || !msg.type) return;

        // 오래된 메시지 무시 (연결 10초 전)
        let sentAtMs = 0;
        if (msg.sentAt && msg.sentAt.toMillis) sentAtMs = msg.sentAt.toMillis();
        else if (msg.sentAt && typeof msg.sentAt === "number") sentAtMs = msg.sentAt;
        else if (msg.createdAt && typeof msg.createdAt === "number") sentAtMs = msg.createdAt;

        if (sentAtMs > 0 && sentAtMs < connectedAtRef.current - 10000) {
          if (lastMsgIdRef.current !== msg.messageId) {
            lastMsgIdRef.current = msg.messageId || null;
            addLog(`오래된 메시지 건너뜀 (${Math.round((connectedAtRef.current - sentAtMs) / 1000)}초 전)`, "info");
          }
          return;
        }

        // 중복 방지
        const msgId = msg.messageId || `${msg.type}_${msg.createdAt}`;
        if (msgId === lastMsgIdRef.current) return;
        lastMsgIdRef.current = msgId;

        addLog(`수신: ${msg.type}`, "ok");

        // Figma plugin sandbox로 전달
        parent.postMessage({ pluginMessage: { type: msg.type, payload: msg.payload } }, "*");
      }, (err: any) => {
        addLog(`Firestore 리스너 오류: ${err.message}`, "err");
      });

      setIsConnected(true);
      onConnectionChange(true);
      addLog("Firestore 연결 성공 — queue 감시 시작", "ok");

      // Heartbeat 시작 (10초마다)
      sendHeartbeat();
      heartbeatRef.current = setInterval(sendHeartbeat, 10000);
    } catch (e: any) {
      addLog(`연결 실패: ${e.message}`, "err");
    }
  }, [fbConfig, projectId, isConnected, disconnect, onMessage, onConnectionChange, addLog, sendHeartbeat]);

  // 플러그인 sandbox 응답 처리 → Firestore status에 쓰기
  useEffect(() => {
    const handlePluginMsg = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg || !dbRef.current || !projectId) return;

      const writeStatus = async (data: any) => {
        try {
          await dbRef.current
            .collection("webtoon_projects").doc(projectId)
            .collection("figma_sync").doc("status")
            .set({ ...data, lastHeartbeat: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch { /* quiet */ }
      };

      switch (msg.type) {
        case "SYNC_OK":
          addLog(`동기화 완료: ${msg.id}`, "ok");
          await writeStatus({ syncResult: "ok", message: `동기화 완료: ${msg.id}` });
          break;
        case "IMPORT_OK":
          addLog(`에피소드 임포트 완료: ${msg.panelCount}패널`, "ok");
          await writeStatus({ syncResult: "ok", message: `✅ 임포트 완료: ${msg.panelCount}패널` });
          break;
        case "BATCH_OK":
          addLog(`일괄 동기화 완료: ${msg.count}페이지`, "ok");
          await writeStatus({ syncResult: "ok", message: `✅ 동기화 완료: ${msg.count}페이지` });
          break;
        case "SYNC_ERROR":
          addLog(`오류: ${msg.error}`, "err");
          await writeStatus({ syncResult: "error", message: `오류: ${msg.error}` });
          break;
        case "PROGRESS":
          await writeStatus({ progress: { current: msg.current, total: msg.total, label: msg.label } });
          break;
      }
    };

    window.addEventListener("message", handlePluginMsg);
    return () => window.removeEventListener("message", handlePluginMsg);
  }, [projectId, addLog]);

  // 클린업
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  const S = {
    section: { background: "#2a2a40", borderRadius: "8px", padding: "12px", marginBottom: "8px" } as const,
    sectionTitle: { fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" } as const,
    field: { marginBottom: "8px" } as const,
    label: { display: "block" as const, fontSize: "11px", color: "#999", marginBottom: "4px" } as const,
    input: { width: "100%", padding: "6px 8px", background: "#1a1a2e", border: "1px solid #3a3a55", borderRadius: "4px", color: "#e0e0e0", fontSize: "11px", outline: "none", fontFamily: "'SF Mono', monospace" } as const,
    textarea: { width: "100%", padding: "6px 8px", background: "#1a1a2e", border: "1px solid #3a3a55", borderRadius: "4px", color: "#e0e0e0", fontSize: "11px", outline: "none", fontFamily: "'SF Mono', monospace", resize: "vertical" as const } as const,
    btn: (disabled: boolean) => ({
      width: "100%", padding: "8px 12px", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: disabled ? 0.5 : 1,
      background: isConnected ? "#ff5252" : "linear-gradient(135deg, #6c5ce7, #4fc3f7)", color: "white",
    }),
    logArea: {
      maxHeight: "120px", overflowY: "auto" as const, fontFamily: "'SF Mono', monospace", fontSize: "10px",
      padding: "6px", background: "#111122", borderRadius: "4px", lineHeight: "1.6",
    } as const,
    logEntry: (type: string) => ({
      padding: "1px 0",
      color: type === "ok" ? "#00e676" : type === "err" ? "#ff5252" : type === "warn" ? "#ffc107" : "#4fc3f7",
    }),
  };

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Firebase 연결 {isConnected ? "✅" : ""}</div>
        {!isConnected && (
          <>
            <div style={S.field}>
              <label style={S.label}>Firebase Config (JSON)</label>
              <textarea
                style={S.textarea}
                rows={3}
                value={fbConfig}
                onChange={e => setFbConfig(e.target.value)}
                placeholder='{"apiKey":"...","projectId":"..."}'
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>프로젝트 ID (Firestore 문서 ID)</label>
              <input
                style={S.input}
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                placeholder="webtoon_project_abc123"
              />
            </div>
          </>
        )}
        {isConnected && (
          <div style={{ fontSize: "11px", color: "#00e676", marginBottom: "8px" }}>
            🔗 Firestore 연결됨 — 웹앱에서 "Figma로 내보내기" 가능
          </div>
        )}
        <button style={S.btn(false)} onClick={connect}>
          {isConnected ? "연결 해제" : "연결"}
        </button>
      </div>

      {logs.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>동기화 로그</div>
          <div style={S.logArea}>
            {logs.map((log, i) => (
              <div key={i} style={S.logEntry(log.type)}>
                [{log.time}] {log.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FirebaseSyncPanel;
