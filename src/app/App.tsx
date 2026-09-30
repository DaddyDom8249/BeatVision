import { useEffect, useState } from "react";
import CreateProjectPage from "../pages/CreateProjectPage";
import SongPage from "../pages/SongPage";
import WorldPage from "../pages/WorldPage";

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

  if (path === "/projects/new") return <CreateProjectPage onNavigate={navigate} />;

  const worldMatch = path.match(/^\/projects\/([^/]+)\/world\/?$/);
  if (worldMatch) return <WorldPage projectId={worldMatch[1]} />;

  const match = path.match(/^\/projects\/([^/]+)\/song\/?$/);
  if (match) return <SongPage projectId={match[1]} />;

  return <main>
    <h1>BeatVision</h1>
    <p>Every Song Has a World. BeatVision Reveals It.</p>
    <a href="/projects/new" onClick={e => { e.preventDefault(); navigate("/projects/new"); }}>
      Create Project
    </a>
  </main>;
}
