import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CanvasSdkLab } from "./CanvasSdkLab";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Canvas lab root is missing");
}

createRoot(root).render(
  <StrictMode>
    <CanvasSdkLab />
  </StrictMode>,
);
