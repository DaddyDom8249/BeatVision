import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { applyAppearance, readLocalAppearance } from "./theme/appearance";
import "./styles.css";
import "./theme/arcane.css";

// Restore the saved appearance before React mounts.
applyAppearance(readLocalAppearance());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider><App /></ThemeProvider>
  </React.StrictMode>
);
