import { useEffect, useState } from "react";
import DashboardPage from "../pages/DashboardPage";
import AuthPage from "../pages/AuthPage";
import CreateProjectPage from "../pages/CreateProjectPage";
import SongPage from "../pages/SongPage";
import WorldPage from "../pages/WorldPage";
import StylePage from "../pages/StylePage";
import VisualPlanPage from "../pages/VisualPlanPage";
import SceneProductionPage from "../pages/SceneProductionPage";
import ProductionWorkspacePage from "../pages/ProductionWorkspacePage";
import { capturePageview, identifyUser, initAnalytics } from "../lib/analytics";
import { supabase } from "../lib/supabase/client";

function currentPath() { return window.location.pathname; }

export default function App() {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    capturePageview(path);
  }, [path]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) identifyUser(data.user?.id);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      identifyUser(session?.user?.id);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(next: string) {
    window.history.pushState({}, "", next);
    // Route state contains only the pathname; preserve ?next= in the browser URL.
    setPath(currentPath());
  }

  if (path === "/") return <DashboardPage onNavigate={navigate} />;
  if (path === "/auth") return <AuthPage onNavigate={navigate} />;
  if (path === "/projects/new") return <CreateProjectPage onNavigate={navigate} />;

  const worldMatch = path.match(/^\/projects\/([^/]+)\/world\/?$/);
  if (worldMatch) return <WorldPage key={worldMatch[1]} projectId={worldMatch[1]} onNavigate={navigate} />;

  const visualPlanMatch = path.match(/^\/projects\/([^/]+)\/visual-plan\/?$/);
  if (visualPlanMatch) return <VisualPlanPage key={visualPlanMatch[1]} projectId={visualPlanMatch[1]} />;

  const sceneProductionMatch = path.match(/^\/projects\/([^/]+)\/scenes\/?$/);
  if (sceneProductionMatch) return <SceneProductionPage key={sceneProductionMatch[1]} projectId={sceneProductionMatch[1]} />;

  const productionMatch = path.match(/^\/projects\/([^/]+)\/production\/?$/);
  if (productionMatch) return <ProductionWorkspacePage key={productionMatch[1]} projectId={productionMatch[1]} />;

  const styleMatch = path.match(/^\/projects\/([^/]+)\/style\/?$/);
  if (styleMatch) return <StylePage key={styleMatch[1]} projectId={styleMatch[1]} />;

  const songMatch = path.match(/^\/projects\/([^/]+)\/song\/?$/);
  if (songMatch) return <SongPage key={songMatch[1]} projectId={songMatch[1]} />;

  return <DashboardPage onNavigate={navigate} />;
}
