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

const shellStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "32px 20px 56px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  marginTop: 24,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(127,127,127,.25)",
  borderRadius: 16,
  padding: 20,
  background: "rgba(127,127,127,.06)",
  minWidth: 0,
};

const wideCardStyle: React.CSSProperties = {
  ...cardStyle,
  gridColumn: "1 / -1",
};

function pretty(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function labelKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ValueView({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ opacity: 0.55 }}>Not specified</span>;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <div style={{ lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
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
                border: "1px solid rgba(127,127,127,.3)",
                borderRadius: 999,
                padding: "6px 10px",
                lineHeight: 1.2,
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
              borderLeft: "2px solid rgba(127,127,127,.35)",
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
      <div style={{ display: "grid", gap: 14 }}>
        {Object.entries(value as Record<string, unknown>).map(([key, child]) => (
          <div key={key}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                opacity: 0.6,
                marginBottom: 5,
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
}: {
  report: WorldReportType;
  onConfirm: () => void;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
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
      await onSave(changes);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const completed = report.status === "completed";
  const confirmed = Boolean(report.confirmed_at);

  return (
    <article style={shellStyle}>
      <header>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          BeatVision / World
        </div>
        <h1 style={{ marginBottom: 8 }}>Visual World Report</h1>
        <p style={{ maxWidth: 760, lineHeight: 1.6, opacity: 0.75 }}>
          The visual continuity foundation for your scenes. Review the world as structured creative direction before locking it.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <span style={{ border: "1px solid rgba(127,127,127,.3)", borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>
            {confirmed ? "LOCKED" : completed ? "READY FOR REVIEW" : report.status.toUpperCase()}
          </span>
          {report.provider && (
            <span style={{ border: "1px solid rgba(127,127,127,.3)", borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>
              {report.provider}
            </span>
          )}
        </div>
      </header>

      <div style={gridStyle}>
        {FIELDS.map(([key, title], index) => {
          const wide = index === 1 || index === 2 || index === 9 || index === 10;
          return (
            <section key={key} style={wide ? wideCardStyle : cardStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
                <span style={{ fontSize: 11, opacity: 0.45 }}>{String(index + 1).padStart(2, "0")}</span>
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
                    borderRadius: 10,
                    border: "1px solid rgba(127,127,127,.35)",
                    padding: 12,
                    background: "transparent",
                    font: "inherit",
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

      <footer style={{ marginTop: 24 }}>
        {confirmed ? (
          <p role="status" style={{ margin: 0, padding: 16, borderRadius: 12, border: "1px solid rgba(127,127,127,.25)" }}>
            World confirmed. Changes now require an explicit revision.
          </p>
        ) : completed ? (
          editing ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button disabled={saving} onClick={() => void saveEdits()}>
                {saving ? "Saving…" : "Save World Changes"}
              </button>
              <button disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button onClick={() => setEditing(true)}>Edit World</button>
              <button onClick={onConfirm}>Yes, that's my world.</button>
            </div>
          )
        ) : null}
      </footer>
    </article>
  );
}
