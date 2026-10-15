import { useAppearance } from "../../theme/ThemeProvider";

export default function AppearanceSettings() {
  const { preferences, status, setTheme, setReducedMotion } = useAppearance();

  return (
    <details className="appearance-menu">
      <summary aria-label="Appearance settings">Appearance</summary>
      <section className="appearance-panel" aria-label="Appearance settings">
        <h2>Studio appearance</h2>
        <p className="appearance-help">Choose the view that works best for you.</p>
        <div className="appearance-choices" role="group" aria-label="Studio theme">
          <button type="button" aria-pressed={preferences.theme === "classic"}
            className={"appearance-choice classic-preview" + (preferences.theme === "classic" ? " chosen" : "")}
            onClick={() => setTheme("classic")}>
            <span className="appearance-swatch" aria-hidden="true"><i/><i/><i/></span>
            <strong>Classic</strong>
            <small>Original BeatVision</small>
          </button>
          <button type="button" aria-pressed={preferences.theme === "arcane"}
            className={"appearance-choice arcane-preview" + (preferences.theme === "arcane" ? " chosen" : "")}
            onClick={() => setTheme("arcane")}>
            <span className="appearance-swatch" aria-hidden="true"><i/><i/><i/></span>
            <strong>Arcane Cinema</strong>
            <small>Subtle cinematic glow</small>
          </button>
        </div>
        <label className="appearance-motion">
          <input type="checkbox" checked={preferences.reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)} />
          Reduce interface motion
        </label>
        <p className="appearance-help">Device accessibility settings are always respected.</p>
        <p className="appearance-status" role="status" aria-live="polite">
          {status === "account" ? "Saved to your account" :
            status === "saving" ? "Saving preference…" :
            status === "unsynced" ? "Saved on this device; account sync unavailable" :
            status === "failed" ? "Preference could not be saved on this device" :
            "Saved on this device"}
        </p>
      </section>
    </details>
  );
}
