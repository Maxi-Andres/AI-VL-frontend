import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { applyTheme, savedTheme } from "./lib/theme";

// Before the first paint, so a dark-theme user never sees a light flash.
applyTheme(savedTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
