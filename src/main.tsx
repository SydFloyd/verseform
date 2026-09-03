import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRuntimeWorkspaceController } from "./adapters/runtime";
import { App } from "./ui/App";
import "./ui/styles.css";

const controller = createRuntimeWorkspaceController();
controller.start();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
);
