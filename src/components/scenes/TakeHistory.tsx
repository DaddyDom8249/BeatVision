import type { NumberedTake, KeyframeSelection } from "../../lib/beatvision/scenes/takes";
import { frameRole } from "../../lib/beatvision/scenes/takes";

type Props = {
  label: string;
  takes: NumberedTake[];
  viewingId: string | null;
  disabled: boolean;
  keyframes?: KeyframeSelection;
  onView: (id: string) => void;
  onSetFrame?: (role: "first" | "last", id: string) => void;
};

export default function TakeHistory({ label, takes, viewingId, disabled, keyframes, onView, onSetFrame }: Props) {
  if (!takes.length) return null;
  return (
    <div className="take-history" aria-label={label + " take history"}>
      <span className="panel-label">{label.toUpperCase()} TAKES ({takes.length})</span>
      <ul>
        {takes.map(take => {
          const role = keyframes ? frameRole(keyframes, take.id) : null;
          return (
            <li key={take.id} data-take-id={take.id}>
              <button className="secondary-button" disabled={disabled} aria-pressed={viewingId === take.id} onClick={() => onView(take.id)}>{"Take " + take.take_number}</button>
              <span>{take.approved && take.status === "approved" ? "Approved" : take.status === "generated" ? "Candidate" : take.status}</span>
              {role && <span className="style-lock-badge">{role === "first" ? "FIRST FRAME" : "LAST FRAME"}</span>}
              {onSetFrame && take.image_url ? <>
                <button className="secondary-button" disabled={disabled || role === "first"} onClick={() => onSetFrame("first", take.id)}>{"Use Take " + take.take_number + " as First Frame"}</button>
                <button className="secondary-button" disabled={disabled || role === "last"} onClick={() => onSetFrame("last", take.id)}>{"Use Take " + take.take_number + " as Last Frame"}</button>
              </> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
