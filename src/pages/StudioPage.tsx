import { useState } from "react";

interface Props { projectId: string; }

const scenes = [
  { time: "00:00", title: "The Arrival", place: "Rain-soaked avenue", mood: "Tension", width: "14%" },
  { time: "00:24", title: "Inside the World", place: "Neon apartment", mood: "Intimacy", width: "20%" },
  { time: "00:57", title: "The Turn", place: "Elevated train", mood: "Momentum", width: "18%" },
  { time: "01:29", title: "Open Sky", place: "Rooftop at night", mood: "Release", width: "22%" },
  { time: "02:10", title: "Afterimage", place: "The same avenue", mood: "Reflection", width: "16%" },
];

export default function StudioPage({ projectId }: Props) {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [locked, setLocked] = useState(true);
  const scene = scenes[selected];

  return (
    <div className="studio-shell">
      <header className="topbar studio-topbar">
        <button className="brand" onClick={() => { window.location.href = "/"; }}>BEAT<span>VISION</span></button>
        <div className="studio-project">MIDNIGHT / <b>UNTITLED</b></div>
        <button className="export-button">Preview render</button>
      </header>

      <div className="studio-body">
        <aside className="studio-sidebar">
          <div className="studio-nav-title">DIRECTOR</div>
          {["Song", "World", "Style", "Direct", "Scenes", "Motion", "Final"].map((item, i) =>
            <div className={`studio-nav-item ${item === "Direct" ? "active" : ""}`} key={item}><span>0{i + 1}</span>{item}</div>
          )}
          <div className="world-lock"><div className="lock-icon">{locked ? "◈" : "◇"}</div><div><b>World lock</b><small>{locked ? "Continuity protected" : "Continuity editable"}</small></div><button onClick={() => setLocked(v => !v)}>{locked ? "Unlock" : "Lock"}</button></div>
        </aside>

        <main className="studio-main">
          <div className="studio-header"><div><div className="eyebrow">DIRECT / TIMELINE</div><h1>Direct the song.</h1><p>Every scene is an instruction to the production engine—not a one-shot prompt.</p></div><button className="primary-button" onClick={() => setPlaying(v => !v)}>{playing ? "Pause" : "Play vision"} <span>{playing ? "Ⅱ" : "▶"}</span></button></div>

          <section className="preview-grid">
            <div className="preview-frame">
              <div className="frame-overlay"><span>SCENE {String(selected + 1).padStart(2, "0")}</span><span>{scene.time}</span></div>
              <div className="visual-placeholder"><div className="moon" /><div className="city-line line-a" /><div className="city-line line-b" /><div className="visual-subject">WORLD PREVIEW</div></div>
              <div className="preview-caption"><strong>{scene.title}</strong><span>{scene.place}</span></div>
            </div>
            <div className="direction-panel">
              <div className="panel-label">SCENE DIRECTION</div>
              <label>What happens<textarea defaultValue="The artist walks alone through the rain. The city reacts to the rhythm: lights pulse, reflections stretch, and the street slowly empties." /></label>
              <div className="control-row"><label>Camera<select defaultValue="slow"><option value="slow">Slow push-in</option><option>Handheld</option><option>Tracking</option><option>Orbit</option></select></label><label>Movement<select defaultValue="subtle"><option value="subtle">Subtle</option><option>Fluid</option><option>Urgent</option><option>Static</option></select></label></div>
              <label>Must stay true<textarea defaultValue="Artist wardrobe, rain-soaked street, sodium-vapor lighting, 35mm anamorphic language." /></label>
              <button className="secondary-button full">Save direction</button>
            </div>
          </section>

          <section className="timeline">
            <div className="timeline-head"><span>SONG TIMELINE</span><span>2:42</span></div>
            <div className="waveform">{Array.from({length: 92}, (_, i) => <i key={i} style={{height: `${18 + ((i * 17) % 67)}%`}} />)}</div>
            <div className="scene-track">{scenes.map((s, i) => <button key={s.time} className={`scene-segment ${i === selected ? "selected" : ""}`} style={{width:s.width}} onClick={() => setSelected(i)}><span>{s.time}</span><b>{s.title}</b></button>)}</div>
          </section>

          <section className="world-strip">
            <div><div className="panel-label">WORLD CONSTANTS</div><h3>These rules travel with every scene.</h3></div>
            <div className="chips"><span>35mm anamorphic</span><span>Night / rain</span><span>Sodium vapor</span><span>Deep shadows</span><span>Artist continuity locked</span></div>
          </section>
        </main>
      </div>
    </div>
  );
}
