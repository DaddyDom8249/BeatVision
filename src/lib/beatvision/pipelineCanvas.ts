// Pure model for the pipeline canvas: song sections → scenes → assets.
// No I/O here so it can be unit tested without Supabase.

export type StageStatus = "approved" | "pending" | "missing";

export type AssetKind = "character" | "environment" | "reference" | "storyboard" | "motion" | "final";

export interface CanvasInput {
  sections: Array<{ index: number; start_time: number; end_time: number }>;
  scenes: Array<{
    id: string; scene_number: number; section_index: number | null; start_time: number; end_time: number;
    title: string; status: string; location?: string | null; visual_direction?: string | null; continuity_notes?: string | null;
  }>;
  characters: Array<{ id: string; name: string; status: string }>;
  environments: Array<{ id: string; name: string; status: string }>;
  references: Array<{ id?: string; label?: string | null; status?: string | null }>;
  referencesApproved: boolean;
  sceneImages: Array<{ id: string; scene_id: string; status: string; approved: boolean }>;
  motionClips: Array<{ id: string; scene_id: string; status: string; approved: boolean }>;
  finalVideo: { id: string; render_status: string | null; video_url: string | null } | null;
}

export interface CanvasAsset { kind: AssetKind; id: string; label: string; status: StageStatus }

export interface CanvasScene {
  id: string; label: string; status: StageStatus; start_time: number; end_time: number;
  assets: CanvasAsset[];
}

export interface CanvasSection { index: number; label: string; start_time: number; end_time: number; scenes: CanvasScene[] }

export interface PipelineGraph {
  sections: CanvasSection[];
  unassigned: CanvasScene[];
  shared: CanvasAsset[];
  final: CanvasAsset;
  summary: Record<StageStatus, number>;
}

const PENDING_JOB = ["queued", "submitted", "processing", "pending", "rendering", "draft", "generated", "generating"];

export function statusOf(rows: Array<{ status?: string | null; approved?: boolean }>): StageStatus {
  if (!rows.length) return "missing";
  if (rows.some((row) => row.approved === true || (row.approved === undefined && row.status === "approved"))) return "approved";
  // Failed attempts with nothing else still count as missing work.
  if (rows.every((row) => row.status === "failed")) return "missing";
  return "pending";
}

function mentions(text: string, name: string) {
  const needle = name.trim().toLowerCase();
  return needle.length > 1 && text.toLowerCase().includes(needle);
}

export function finalStatus(video: CanvasInput["finalVideo"]): StageStatus {
  if (!video) return "missing";
  if (video.video_url && ["completed", "complete", "ready", "approved", null].includes(video.render_status as string)) return "approved";
  if (video.render_status === "failed") return "missing";
  return PENDING_JOB.includes(video.render_status ?? "") || !video.video_url ? "pending" : "approved";
}

export function buildPipelineGraph(input: CanvasInput): PipelineGraph {
  const summary: Record<StageStatus, number> = { approved: 0, pending: 0, missing: 0 };
  const count = (asset: CanvasAsset) => { summary[asset.status] += 1; return asset; };

  const shared: CanvasAsset[] = [
    ...input.characters.map((c) => count({ kind: "character" as const, id: c.id, label: c.name, status: statusOf([c]) })),
    ...input.environments.map((e) => count({ kind: "environment" as const, id: e.id, label: e.name, status: statusOf([e]) })),
    ...input.references.map((r, i) => count({
      kind: "reference" as const, id: r.id ?? `reference-${i}`, label: r.label || `Reference ${i + 1}`,
      status: input.referencesApproved ? "approved" : "pending",
    })),
  ];

  const toScene = (scene: CanvasInput["scenes"][number]): CanvasScene => {
    const text = [scene.location, scene.visual_direction, scene.continuity_notes].filter(Boolean).join(" \n ");
    const linked = shared.filter((asset) =>
      (asset.kind === "character" || asset.kind === "environment") && mentions(text, asset.label));
    const images = input.sceneImages.filter((row) => row.scene_id === scene.id);
    const clips = input.motionClips.filter((row) => row.scene_id === scene.id);
    const storyboard = count({ kind: "storyboard", id: `${scene.id}:storyboard`, label: "Storyboard frame", status: statusOf(images) });
    const motion = count({ kind: "motion", id: `${scene.id}:motion`, label: "Motion clip", status: statusOf(clips) });
    return {
      id: scene.id,
      label: `Scene ${scene.scene_number}: ${scene.title}`,
      status: scene.status === "approved" ? "approved" : "pending",
      start_time: scene.start_time, end_time: scene.end_time,
      assets: [...linked, storyboard, motion],
    };
  };

  const ordered = [...input.scenes].sort((a, b) => a.scene_number - b.scene_number);
  const sections: CanvasSection[] = [...input.sections].sort((a, b) => a.index - b.index).map((section) => ({
    index: section.index,
    label: `Section ${section.index + 1}`,
    start_time: section.start_time,
    end_time: section.end_time,
    scenes: [],
  }));
  const byIndex = new Map(sections.map((s) => [s.index, s]));
  const unassigned: CanvasScene[] = [];
  for (const scene of ordered) {
    const node = toScene(scene);
    const section = scene.section_index == null ? undefined : byIndex.get(scene.section_index);
    if (section) section.scenes.push(node); else unassigned.push(node);
  }
  const final = count({ kind: "final", id: input.finalVideo?.id ?? "final-video", label: "Final video", status: finalStatus(input.finalVideo) });
  return { sections, unassigned, shared, final, summary };
}
