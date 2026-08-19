import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { WorkspaceProvider } from "./hooks/useWorkspace.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </React.StrictMode>,
);
