// ============================================================
// React App Entry Point (rendered in iframe/html)
// ============================================================

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Ensure root element exists
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found in index.html");
}

// Create React root and render
const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
