import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";

// Vite can retain an older HTML document while hashed chunks from a newer
// deployment are no longer available. Recover once instead of leaving the
// user on a dead lazy-loaded route.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "beatvision-vite-preload-recovery";
  if (sessionStorage.getItem(key) !== "1") {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(
  <AppWrapper>
    <App />
  </AppWrapper>
);
