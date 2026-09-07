import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceController } from "../src/app/controller";
import { WEB_TRANSLATION } from "../src/adapters/webScriptureProvider";
import { App } from "../src/ui/App";
import { createWebAdapters } from "../src/web/runtime";
import { webHost, webScheduler } from "../src/web/host";
import "../src/ui/styles.css";
import "../src/web/web.css";

const controller = new WorkspaceController({ runtime: createWebAdapters(), fallback: WEB_TRANSLATION, host: webHost, scheduler: webScheduler });
controller.start();
createRoot(document.getElementById("root")!).render(<StrictMode><App controller={controller} /></StrictMode>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      const observe = () => {
        if (registration.active) controller.send({ type: "web.offlineState", status: "ready" });
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "activated") controller.send({ type: "web.offlineState", status: "ready" });
          else if (installing.state === "redundant" && !registration.active) controller.send({ type: "web.offlineState", status: "unavailable" });
        });
      };
      observe();
      registration.addEventListener("updatefound", observe);
    })
    .catch(() => controller.send({ type: "web.offlineState", status: "unavailable" }));
} else {
  controller.send({ type: "web.offlineState", status: "unavailable" });
}
