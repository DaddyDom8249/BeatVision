import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import AppErrorBoundary from './components/AppErrorBoundary';

createRoot(document.getElementById("root")!).render(
  <AppWrapper>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </AppWrapper>
);
