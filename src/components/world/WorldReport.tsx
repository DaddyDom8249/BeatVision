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
        try { changes[key] = JSON.parse(raw); } catch { changes[key] = raw; }
      }
      await onSave(changes);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article>
      <h1>Visual World Report</h1>
      <p>Review the world before it becomes the continuity foundation for your scenes.</p>

      {FIELDS.map(([key, title]) => (
        <section key={key}>
          <h3>{title}</h3>
          {editing ? (
            <textarea
              value={drafts[key] ?? ""}
              onChange={(e) => setDrafts((current) => ({ ...current, [key]: e.target.value }))}
              rows={Math.min(18, Math.max(4, (drafts[key] ?? "").split("\n").length + 1))}
              aria-label={title}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace" }}
            />
          ) : (
            <pre>{pretty(report[key])}</pre>
          )}
        </section>
      ))}

      {report.confirmed_at ? (
        <p role="status">World confirmed. Changes now require an explicit revision.</p>
      ) : report.status === "completed" ? (
        <div>
          {editing ? (
            <>
              <button disabled={saving} onClick={() => void saveEdits()}>{saving ? "Saving…" : "Save World Changes"}</button>
              <button disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}>Edit World</button>
              <button onClick={onConfirm}>Yes, that's my world.</button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}