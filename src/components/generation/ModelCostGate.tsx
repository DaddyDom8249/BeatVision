import { estimateCost, findModel, formatEstimate, modelsFor, requiresApproval } from "../../lib/generation/models";
import type { AvailabilityState, GenerationJobType, ModelEntry } from "../../lib/generation/models";

const JOB_LABEL: Record<GenerationJobType, string> = {
  scene_image: "scene image",
  scene_motion: "motion clip",
  assembly: "final video assembly",
};

export function availabilityOf(model: ModelEntry, state: AvailabilityState) {
  if (state.status !== "loaded") return { known: false, available: false, reason: state.status === "error" ? state.message : "Checking provider availability…" };
  const entry = state.byId[model.id];
  if (!entry) return { known: true, available: false, reason: "This model is not offered by the server." };
  return { known: true, available: entry.available, reason: entry.unavailable_reason };
}

export function ModelPicker({ jobType, value, onChange, availability, disabled }: {
  jobType: GenerationJobType;
  value: string;
  onChange: (id: string) => void;
  availability: AvailabilityState;
  disabled?: boolean;
}) {
  const models = modelsFor(jobType);
  const selected = findModel(value);
  const state = selected ? availabilityOf(selected, availability) : null;
  return (
    <label className="model-picker">
      <span className="panel-label">MODEL ({JOB_LABEL[jobType].toUpperCase()})</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={`Model for ${JOB_LABEL[jobType]}`}>
        {models.map((model) => {
          const a = availabilityOf(model, availability);
          return <option key={model.id} value={model.id} disabled={a.known && !a.available}>{model.label} · {formatEstimate(estimateCost(model))}{a.known && !a.available ? " · unavailable" : ""}</option>;
        })}
      </select>
      {state && state.known && !state.available && <span role="status" className="model-unavailable">Unavailable: {state.reason}</span>}
    </label>
  );
}

export function CostApprovalDialog({ jobType, modelId, availability, onApprove, onCancel }: {
  jobType: GenerationJobType;
  modelId: string;
  availability: AvailabilityState;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const model = findModel(modelId);
  if (!model) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Render approval" className="cost-approval-dialog">
        <p role="alert">The selected model is not in the catalog. Choose another model.</p>
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
      </div>
    );
  }
  const estimate = estimateCost(model);
  const state = availabilityOf(model, availability);
  const blocked = state.known && !state.available;
  return (
    <div role="dialog" aria-modal="true" aria-label="Render approval" className="cost-approval-dialog">
      <span className="panel-label">APPROVE RENDER</span>
      <h3>Render a {JOB_LABEL[jobType]} with {model.label}?</h3>
      <p><strong>Estimated cost: {formatEstimate(estimate)}</strong>{estimate.kind === "unknown" ? " — this render may be billed; the amount cannot be verified." : ""}</p>
      <p>{estimate.basis}</p>
      {requiresApproval(model) && <p>This model is not verifiably free, so your approval is recorded and checked by the server before the provider is called. It expires after 15 minutes and covers one render.</p>}
      <details>
        <summary>Pricing sources</summary>
        <ul>{estimate.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a> (read {source.readOn}): {source.note}</li>)}</ul>
      </details>
      {blocked && <p role="alert">Unavailable: {state.reason}</p>}
      {!state.known && <p role="status">{state.reason} The server will still refuse the render if the provider is not configured.</p>}
      <div className="production-actions">
        <button className="primary-button" disabled={blocked} onClick={onApprove}>Approve and render</button>
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
