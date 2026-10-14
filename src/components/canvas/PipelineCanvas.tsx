import type { CanvasAsset, CanvasScene, PipelineGraph, StageStatus } from "../../lib/beatvision/pipelineCanvas";

const kindLabel: Record<CanvasAsset["kind"], string> = {
  character: "Character", environment: "Environment", reference: "Reference",
  storyboard: "Storyboard", motion: "Motion", final: "Final video",
};

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Badge({ status }: { status: StageStatus }) {
  return <span className={`pc-badge pc-${status}`} data-status={status}>{status.toUpperCase()}</span>;
}

function AssetNode({ asset }: { asset: CanvasAsset }) {
  return (
    <li className={`pc-asset pc-${asset.status}`} data-kind={asset.kind} data-testid="pc-asset">
      <span className="pc-kind">{kindLabel[asset.kind]}</span> <span>{asset.label}</span> <Badge status={asset.status} />
    </li>
  );
}

function SceneNode({ scene }: { scene: CanvasScene }) {
  return (
    <div className={`pc-scene pc-${scene.status}`} data-testid="pc-scene">
      <header><strong>{scene.label}</strong> <small>{clock(scene.start_time)}–{clock(scene.end_time)}</small> <Badge status={scene.status} /></header>
      <ul className="pc-assets">{scene.assets.map((asset) => <AssetNode key={asset.kind + asset.id} asset={asset} />)}</ul>
    </div>
  );
}

/** Read-only visual map of the whole pipeline. Pure presentational component. */
export default function PipelineCanvas({ graph }: { graph: PipelineGraph }) {
  const rows = [
    ...graph.sections.map((s) => ({ key: `s${s.index}`, label: s.label, range: `${clock(s.start_time)}–${clock(s.end_time)}`, scenes: s.scenes })),
    ...(graph.unassigned.length ? [{ key: "unassigned", label: "Unmapped scenes", range: "", scenes: graph.unassigned }] : []),
  ];
  return (
    <div className="pipeline-canvas" role="region" aria-label="Pipeline canvas">
      <div className="pc-summary" aria-label="Stage summary">
        <Badge status="approved" /> {graph.summary.approved} <Badge status="pending" /> {graph.summary.pending} <Badge status="missing" /> {graph.summary.missing}
      </div>
      <section className="pc-shared" aria-label="Shared world assets">
        <h3>World & references</h3>
        {graph.shared.length ? <ul className="pc-assets">{graph.shared.map((a) => <AssetNode key={a.kind + a.id} asset={a} />)}</ul>
          : <p className="pc-empty">No characters, environments or references yet.</p>}
      </section>
      <div className="pc-flow">
        {rows.length === 0 && <p className="pc-empty">No song sections or scenes yet.</p>}
        {rows.map((row) => (
          <div className="pc-row" key={row.key} data-testid="pc-section">
            <div className="pc-section"><strong>{row.label}</strong><small>{row.range}</small></div>
            <div className="pc-edge" aria-hidden="true">→</div>
            <div className="pc-scenes">
              {row.scenes.length ? row.scenes.map((scene) => <SceneNode key={scene.id} scene={scene} />)
                : <div className="pc-scene pc-missing"><Badge status="missing" /> No scene mapped</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="pc-final"><span className="pc-edge" aria-hidden="true">⇒</span><ul className="pc-assets"><AssetNode asset={graph.final} /></ul></div>
    </div>
  );
}
