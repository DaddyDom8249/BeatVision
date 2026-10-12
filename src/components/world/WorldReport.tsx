import { useEffect, useState } from "react";
import type { WorldReport as WorldReportType } from "../../types/world";

const FIELDS = [
  ["mood", "Mood"],
  ["emotional_arc", "Emotional Arc"],
  ["visual_language", "Visual Language"],
  ["cinematography", "Cinematography"],
  ["environments", "Environments"],
  ["color_lighting", "Color / Lighting"],
  ["motifs", "Motifs"],
  ["atmosphere", "Atmosphere"],
  ["movement", "Movement"],
  ["continuity_rules", "Continuity Rules"],
  ["immutable_continuity", "Things That Must Not Change"],
] as const;

function pretty(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function labelKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ValueView({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ opacity: 0.5, fontStyle: "italic", fontSize: "13px" }}>Not specified</span>;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <div style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px" }}>
        {String(value)}
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {value.map((item, index) => (
            <span
              key={index}
              style={{
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-surface-0)",
                color: "var(--text-main)",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "12px",
                lineHeight: 1.3,
                overflowWrap: "anywhere",
              }}
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: 10 }}>
        {value.map((item, index) => (
          <div
            key={index}
            style={{
              borderLeft: "2px solid var(--accent-gold)",
              paddingLeft: 12,
            }}
          >
            <ValueView value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {Object.entries(value as Record<string, unknown>).map(([key, child]) => (
          <div key={key}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--accent-gold)",
                marginBottom: 4,
              }}
            >
              {labelKey(key)}
            </div>
            <ValueView value={child} />
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

export default function WorldReport({
  report,
  onConfirm,
  onSave,
  onCreateRevision,
  onContinue,
}: {
  report: WorldReportType;
  onConfirm: () => void;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
  onCreateRevision: (changes: Record<string, unknown>) => Promise<void>;
  onContinue: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [key] of FIELDS) next[key] = pretty(report[key]);
    setDrafts(next);
  }, [report]);

  async function saveEdits() {
    setSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      for (const [key] of FIELDS) {
        const raw = drafts[key] ?? "";
        try {
          changes[key] = JSON.parse(raw);
        } catch {
          changes[key] = raw;
        }
      }
      if (confirmed) {
        await onCreateRevision(changes);
      } else {
        await onSave(changes);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const completed = report.status === "completed";
  const confirmed = Boolean(report.confirmed_at);

  return (
    <article className="world-report-card">
      <div className="world-report-header">
        <div>
          <div className="eyebrow">02 / VISUAL WORLD REPORT</div>
          <h1 style={{ fontSize: "32px", color: "#ffffff", margin: "4px 0 8px" }}>Visual Continuity Foundation</h1>
          <p style={{ maxWidth: 760, lineHeight: 1.6, color: "var(--text-muted)", fontSize: "14px" }}>
            The visual continuity foundation for your scenes. Review the world as structured creative direction before locking it.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-badge ${confirmed ? "status-approved" : "status-draft"}`}>
            {confirmed ? "WORLD LOCKED" : completed ? "READY FOR REVIEW" : report.status.toUpperCase()}
          </span>
          {report.provider && (
            <span className="status-badge" style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              {report.provider}
            </span>
          )}
        </div>
      </div>

      <div className="world-field-grid">
        {FIELDS.map(([key, title], index) => {
          return (
            <section key={key} className="world-field-box">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <strong>{title}</strong>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              {editing ? (
                <textarea
                  value={drafts[key] ?? ""}
                  onChange={(e) => setDrafts((current) => ({ ...current, [key]: e.target.value }))}
                  rows={Math.min(18, Math.max(4, (drafts[key] ?? "").split("\n").length + 1))}
                  aria-label={title}
                  style={{
                    width: "100%",
                    minHeight: 120,
                    boxSizing: "border-box",
                    resize: "vertical",
                    borderRadius: 6,
                    border: "1px solid var(--border-medium)",
                    padding: 12,
                    background: "var(--bg-surface-1)",
                    color: "var(--text-main)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    lineHeight: 1.5,
                  }}
                />
              ) : (
                <ValueView value={report[key]} />
              )}
            </section>
          );
        })}
      </div>

      <footer style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
        {confirmed ? (
          editing ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button className="primary-button" disabled={saving} onClick={() => void saveEdits()}>
                {saving ? "Saving New Revision…" : "Save as New Revision →"}
              </button>
              <button className="secondary-button" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
              <div
                style={{
                  background: "var(--bg-surface-0)",
                  border: "1px solid var(--border-subtle)",
                  padding: "12px 18px",
                  borderRadius: "8px",
                  flex: "1 1 320px",
                  fontSize: "13px",
                  color: "var(--color-success)",
                }}
              >
                ✓ World confirmed. Revision {report.revision_number} is locked and immutable.
              </div>
              <button className="secondary-button" onClick={() => setEditing(true)}>
                Create Revision
              </button>
              <button className="primary-button" onClick={onContinue}>
                Continue to Style Studio →
              </button>
            </div>
          )
        ) : completed ? (
          editing ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button className="primary-button" disabled={saving} onClick={() => void saveEdits()}>
                {saving ? "Saving Edits…" : "Save World Changes →"}
              </button>
              <button className="secondary-button" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <button className="secondary-button" onClick={() => setEditing(true)}>
                Edit World Directions
              </button>
              <button className="primary-button large" onClick={onConfirm}>
                Yes, that's my world ✓
              </button>
            </div>
          )
        ) : null}
      </footer>
    </article>
  );
}
