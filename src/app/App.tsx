import { useEffect, useState } from "react";
import DashboardPage from "../pages/DashboardPage";
import CreateProjectPage from "../pages/CreateProjectPage";
import SongPage from "../pages/SongPage";
import WorldPage from "../pages/WorldPage";
import StylePage from "../pages/StylePage";
import StudioPage from "../pages/StudioPage";

function currentPath() { return window.location.pathname; }

export default function App() {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
  }

  if (path === "/") return <DashboardPage onNavigate={navigate} />;
  if (path === "/projects/new") return <CreateProjectPage onNavigate={navigate} />;

  const studioMatch = path.match(/^\/projects\/([^/]+)\/studio\/?$/);
  if (studioMatch) return <StudioPage projectId={studioMatch[1]} />;

  const worldMatch = path.match(/^\/projects\/([^/]+)\/world\/?$/);
  if (worldMatch) return <WorldPage projectId={worldMatch[1]} />;

  const styleMatch = path.match(/^\/projects\/([^/]+)\/style\/?$/);
  if (styleMatch) return <StylePage projectId={styleMatch[1]} />;

  const songMatch = path.match(/^\/projects\/([^/]+)\/song\/?$/);
  if (songMatch) return <SongPage projectId={songMatch[1]} />;

  return <DashboardPage onNavigate={navigate} />;
}
