// ============================================================
// main.tsx — React 애플리케이션 진입점 (v2.1)
// ============================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found in HTML");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
