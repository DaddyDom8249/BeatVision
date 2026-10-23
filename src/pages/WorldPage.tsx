import WorldReport from "../components/world/WorldReport";
import { useWorld } from "../hooks/useWorld";
import { useSong } from "../hooks/useSong";
import StudioHeader from "../components/navigation/StudioHeader";

export default function WorldPage({ projectId, onNavigate }: { projectId: string; onNavigate: (next: string) => void }) {
  const { report, loading, generating, error, revealWorld, saveWorld, createRevision, confirmWorld } = useWorld(projectId);
  const { song, loading: songLoading, error: songError } = useSong(projectId);

  if (loading || songLoading) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard"><p>Loading visual world report…</p></main>
      </div>
    );
  }

  if (songError) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <h1>World Unavailable</h1>
          <p className="form-error" role="alert">{songError}</p>
          <p style={{ marginTop: "16px" }}>Reload the Song page and retry after the project data is available.</p>
        </main>
      </div>
    );
  }

  if (!song?.audio_path) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <h1>Reveal World</h1>
          <p>Save an audio track on the Song page before revealing the visual world.</p>
          <button className="secondary-button" style={{ marginTop: "16px" }} onClick={() => onNavigate(`/projects/${projectId}/song`)}>
            ← Return to Song Intake
          </button>
        </main>
      </div>
    );
  }

  if (song.analysis_status !== "completed") {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <h1>Analyze the Song First</h1>
          <p>BeatVision requires completed musical signal analysis before World Reveal. Return to Song and click Analyze Music.</p>
          <button className="primary-button" style={{ marginTop: "16px" }} onClick={() => onNavigate(`/projects/${projectId}/song`)}>
            ← Return to Song & Run Analysis
          </button>
        </main>
      </div>
    );
  }

  // Legacy completed Worlds remain readable even when their original records
  // predate interpretation lineage. Only a new World Reveal is gated here;
  // the server independently enforces lineage for every new generation.
  if ((!song.current_interpretation_id || !song.interpretation_confirmed_at) && report?.status !== "completed") {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <h1>Confirm the Song Interpretation First</h1>
          <p>World Reveal is locked until the artist reviews and explicitly confirms an evidence-grounded interpretation in Song Intake Notes.</p>
          <button className="primary-button" style={{ marginTop: "16px" }} onClick={() => onNavigate(`/projects/${projectId}/song`)}>
            ← Return to Song Intake Notes
          </button>
        </main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard" style={{ maxWidth: "800px" }}>
          <section className="create-card">
            <div className="eyebrow">02 / WORLD REVEAL</div>
            <h1>Reveal Visual World</h1>
            <p>
              BeatVision will synthesize your musical analysis, lyrics, and creative direction into a persistent, structured visual world.
            </p>
            <button className="primary-button large" disabled={generating} onClick={() => void revealWorld()}>
              {generating ? "Revealing Visual World…" : "Reveal World →"}
            </button>
            {error && <p className="form-error" role="alert" style={{ marginTop: "16px" }}>{error}</p>}
          </section>
        </main>
      </div>
    );
  }

  // A new approved song interpretation must not inherit a completed World
  // from a different creative revision. Preserve its history; offer a new one.
  if (report.status === "completed" && song.current_interpretation_id &&
      report.interpretation_id !== song.current_interpretation_id) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <section className="create-card">
            <h1>Reveal a World for the New Interpretation</h1>
            <p>Your existing approved World remains preserved. Generate a new, separately reviewable World based on the artist-confirmed song interpretation.</p>
            <button className="primary-button" disabled={generating} type="button" onClick={() => void revealWorld(true)}>
              {generating ? "Generating Revised World…" : "Generate a Revised World"}
            </button>
            {error && <p role="alert" className="form-error">{error}</p>}
          </section>
        </main>
      </div>
    );
  }

  if (report.status === "unavailable") {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <h1>World Generation Unavailable</h1>
          <p className="form-error" role="alert">{report.error_message ?? "The world-generation provider is unavailable."}</p>
          <p style={{ marginTop: "16px" }}>No fake report was created. Downstream stages remain locked.</p>
        </main>
      </div>
    );
  }

  if (report.status === "failed") {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="world" />
        <main className="dashboard">
          <h1>World Reveal Failed</h1>
          <p className="form-error" role="alert">{report.error_message ?? "The world report could not be generated."}</p>
          <button className="primary-button" disabled={generating} style={{ marginTop: "16px" }} onClick={() => void revealWorld()}>
            {generating ? "Retrying Reveal…" : "Retry World Reveal"}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <StudioHeader
        projectId={projectId}
        activeStage="world"
        statusBadge={report.confirmed_at ? "WORLD LOCKED" : "REVIEW"}
        onNavigate={onNavigate}
      />
      <main className="dashboard">
        {error && <p className="form-error" role="alert" style={{ marginBottom: "20px" }}>{error}</p>}
        <WorldReport
          report={report}
          onSave={saveWorld}
          onCreateRevision={createRevision}
          onConfirm={() => void confirmWorld()}
          onContinue={() => onNavigate(`/projects/${projectId}/style`)}
        />
      </main>
    </div>
  );
}
