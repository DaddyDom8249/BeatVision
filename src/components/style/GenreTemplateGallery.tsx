import { useState } from "react";
import "./genreTemplates.css";
import { GENRE_TEMPLATES } from "../../lib/style/genreTemplates";
import type { GenreTemplate } from "../../lib/style/genreTemplates";

interface Props {
  locked: boolean;
  disabled?: boolean;
  onApply: (template: GenreTemplate) => string;
}

/** Text-only genre presets. No media is shown or generated. */
export default function GenreTemplateGallery({ locked, disabled, onApply }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  if (locked) {
    return <p className="genre-templates-note">Genre templates are unavailable: the Style Bible is approved and locked.</p>;
  }
  return (
    <section className="genre-templates" aria-label="Start from a genre template">
      <div className="genre-templates-head">
        <span className="panel-label">START FROM TEMPLATE</span>
        <small>Pre-fills only empty fields below as editable text. Nothing is saved until you click Save Style Bible.</small>
      </div>
      <div className="genre-templates-grid">
        {GENRE_TEMPLATES.map((template) => (
          <button type="button" key={template.id} className="genre-template-card" disabled={disabled}
            onClick={() => setMessage(onApply(template))}>
            <strong>{template.genre}</strong>
            <span>{template.tagline}</span>
            <span className="genre-template-swatches">{template.palette.join(" · ")}</span>
          </button>
        ))}
      </div>
      {message && <p className="genre-templates-note" role="status">{message}</p>}
    </section>
  );
}
