import { useState, useCallback } from 'react';
import type {
  Project, VisualWorldReport, StoryboardScene, CharacterEnvironment,
  WorldStyleBible, CharacterSheet, EnvironmentSheet,
  SceneVisualPrompt, SceneImage, SceneVideo, ProjectChangeLog,
  MotionClip, FinalVideo,
} from '@/types/types';
import {
  X, Copy, Download, Check, Clock, AlertCircle, ChevronDown, ChevronUp,
  FileText, Film, ImageIcon, Package, Sparkles, Play,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  project: Project;
  worldReport: VisualWorldReport | null;
  scenes: StoryboardScene[];
  charEnv: CharacterEnvironment | null;
  styleBible: WorldStyleBible | null;
  characterSheet: CharacterSheet | null;
  envSheet: EnvironmentSheet | null;
  scenePrompts: SceneVisualPrompt[];
  sceneImages: SceneImage[];
  sceneVideos: SceneVideo[];
  changeLogs: ProjectChangeLog[];
  motionClips?: MotionClip[];
  finalVideo?: FinalVideo | null;
  onClose: () => void;
}

type ExportStatus = 'idle' | 'in_progress' | 'complete' | 'failed';

// ── Download helpers ──────────────────────────────────────────────────────────

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Content builders ──────────────────────────────────────────────────────────

function buildWorldReportText(project: Project, report: VisualWorldReport): string {
  return [
    `BEATVISION — VISUAL WORLD REPORT`,
    `Project: ${project.title}`,
    `Song: ${project.song_file_name ?? 'N/A'}`,
    `Style: ${project.selected_style}`,
    `---`,
    report.song_summary ? `Song Summary:\n${report.song_summary}` : '',
    report.emotional_core ? `Emotional Core:\n${report.emotional_core}` : '',
    report.main_visual_world ? `Main Visual World:\n${report.main_visual_world}` : '',
    report.color_palette ? `Color Palette:\n${report.color_palette}` : '',
    report.lighting_style ? `Lighting Style:\n${report.lighting_style}` : '',
    report.main_characters ? `Main Characters:\n${report.main_characters}` : '',
    report.symbolic_objects ? `Symbolic Objects:\n${report.symbolic_objects}` : '',
    report.key_locations ? `Key Locations:\n${report.key_locations}` : '',
    report.story_direction ? `Story Direction:\n${report.story_direction}` : '',
    `Creative Match Score: ${report.creative_match_score}/10`,
  ].filter(Boolean).join('\n\n');
}

function buildStoryboardText(project: Project, scenes: StoryboardScene[]): string {
  const header = [
    `BEATVISION — STORYBOARD`,
    `Project: ${project.title}`,
    `Song: ${project.song_file_name ?? 'N/A'}`,
    `Total Scenes: ${scenes.length}`,
    `---`,
  ].join('\n');

  const sceneBlocks = scenes.map((s) => [
    `SCENE ${String(s.scene_number).padStart(2, '0')}${s.timestamp_range ? ` · ${s.timestamp_range}` : ''}`,
    `Title: ${s.scene_title ?? 'Untitled'}`,
    s.visual_description ? `Visual Description:\n${s.visual_description}` : '',
    s.camera_direction ? `Camera: ${s.camera_direction}` : '',
    s.mood ? `Mood: ${s.mood}` : '',
    s.location ? `Location: ${s.location}` : '',
    s.lyric_moment ? `Lyric Moment: ${s.lyric_moment}` : '',
    s.transition_style ? `Transition: ${s.transition_style}` : '',
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');

  return `${header}\n\n${sceneBlocks}`;
}

function buildStyleBibleText(project: Project, sb: WorldStyleBible): string {
  return [
    `BEATVISION — STYLE BIBLE`,
    `Project: ${project.title}`,
    `---`,
    sb.overall_visual_style ? `Overall Visual Style:\n${sb.overall_visual_style}` : '',
    sb.color_rules ? `Color Rules:\n${sb.color_rules}` : '',
    sb.lighting_rules ? `Lighting Rules:\n${sb.lighting_rules}` : '',
    sb.camera_rules ? `Camera Rules:\n${sb.camera_rules}` : '',
    sb.character_consistency_rules ? `Character Consistency:\n${sb.character_consistency_rules}` : '',
    sb.environment_rules ? `Environment Rules:\n${sb.environment_rules}` : '',
    sb.symbolic_motifs ? `Symbolic Motifs:\n${sb.symbolic_motifs}` : '',
    sb.things_to_avoid ? `Things to Avoid:\n${sb.things_to_avoid}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildCharacterSheetText(project: Project, cs: CharacterSheet): string {
  return [
    `BEATVISION — CHARACTER SHEET`,
    `Project: ${project.title}`,
    `---`,
    cs.character_role ? `Role: ${cs.character_role}` : '',
    cs.appearance ? `Appearance:\n${cs.appearance}` : '',
    cs.wardrobe ? `Wardrobe:\n${cs.wardrobe}` : '',
    cs.body_language ? `Body Language:\n${cs.body_language}` : '',
    cs.facial_expression ? `Facial Expression:\n${cs.facial_expression}` : '',
    cs.personality_energy ? `Personality Energy:\n${cs.personality_energy}` : '',
    cs.recurring_visual_traits ? `Recurring Visual Traits:\n${cs.recurring_visual_traits}` : '',
    cs.consistency_notes ? `Consistency Notes:\n${cs.consistency_notes}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildEnvSheetText(project: Project, es: EnvironmentSheet): string {
  return [
    `BEATVISION — ENVIRONMENT SHEET`,
    `Project: ${project.title}`,
    `---`,
    es.main_world_description ? `Main World:\n${es.main_world_description}` : '',
    es.key_locations ? `Key Locations:\n${es.key_locations}` : '',
    es.weather_atmosphere ? `Weather & Atmosphere:\n${es.weather_atmosphere}` : '',
    es.textures_materials ? `Textures & Materials:\n${es.textures_materials}` : '',
    es.background_details ? `Background Details:\n${es.background_details}` : '',
    es.lighting_conditions ? `Lighting Conditions:\n${es.lighting_conditions}` : '',
    es.recurring_objects ? `Recurring Objects:\n${es.recurring_objects}` : '',
    es.world_consistency_rules ? `Consistency Rules:\n${es.world_consistency_rules}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildPromptsText(project: Project, prompts: SceneVisualPrompt[]): string {
  const header = [
    `BEATVISION — SCENE VISUAL PROMPT PACK`,
    `Project: ${project.title}`,
    `Total Prompts: ${prompts.length}`,
    `---`,
  ].join('\n');

  const blocks = prompts.map((p) => [
    `SCENE ${String(p.scene_number).padStart(2, '0')}${p.scene_title ? ` — ${p.scene_title}` : ''}`,
    p.main_image_prompt ? `Prompt:\n${p.main_image_prompt}` : '',
    p.camera_framing ? `Camera Framing: ${p.camera_framing}` : '',
    p.lighting_direction ? `Lighting: ${p.lighting_direction}` : '',
    p.mood ? `Mood: ${p.mood}` : '',
    p.negative_prompt ? `Negative Prompt:\n${p.negative_prompt}` : '',
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');

  return `${header}\n\n${blocks}`;
}

function buildFullProjectData(
  project: Project,
  worldReport: VisualWorldReport | null,
  scenes: StoryboardScene[],
  charEnv: CharacterEnvironment | null,
  styleBible: WorldStyleBible | null,
  characterSheet: CharacterSheet | null,
  envSheet: EnvironmentSheet | null,
  scenePrompts: SceneVisualPrompt[],
  sceneImages: SceneImage[],
  sceneVideos: SceneVideo[],
  changeLogs: ProjectChangeLog[],
): object {
  return {
    exported_at: new Date().toISOString(),
    source: 'BeatVision',
    project: {
      title: project.title,
      song_file: project.song_file_name,
      selected_style: project.selected_style,
      optional_notes: project.optional_notes,
      status: project.status,
      created_at: project.created_at,
      approval_state: {
        world_approved: project.world_approved,
        storyboard_approved: project.storyboard_approved,
        characters_approved: project.characters_approved,
        style_bible_approved: project.style_bible_approved,
        character_sheet_approved: project.character_sheet_approved,
        environment_sheet_approved: project.environment_sheet_approved,
        scene_prompts_approved: project.scene_prompts_approved,
        images_approved: project.images_approved,
        motion_approved: project.motion_approved,
      },
    },
    visual_world_report: worldReport,
    storyboard: scenes,
    characters_and_environment: charEnv,
    style_bible: styleBible,
    character_sheet: characterSheet,
    environment_sheet: envSheet,
    scene_visual_prompts: scenePrompts,
    scene_images: sceneImages.map((i) => ({
      scene_number: i.scene_number,
      scene_title: i.scene_title,
      image_url: i.image_url,
      approved: i.approved,
      prompt_used: i.prompt_used,
    })),
    scene_videos: sceneVideos.map((v) => ({
      scene_number: v.scene_number,
      scene_title: v.scene_title,
      video_url: v.video_url,
      approved: v.approved,
      duration: v.duration,
    })),
    change_log: changeLogs,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExportProjectPanel({
  project, worldReport, scenes, charEnv, styleBible, characterSheet,
  envSheet, scenePrompts, sceneImages, sceneVideos, changeLogs,
  motionClips = [], finalVideo = null, onClose,
}: Props) {
  const [statuses, setStatuses] = useState<Record<string, ExportStatus>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const setStatus = (key: string, s: ExportStatus) =>
    setStatuses((prev) => ({ ...prev, [key]: s }));

  const markCopied = (key: string) => {
    setCopied((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 2000);
  };

  const handleCopy = useCallback(async (key: string, text: string) => {
    try {
      await copyText(text);
      markCopied(key);
      toast.success('Copied to clipboard!');
    } catch {
      toast.error('Could not copy. Please try manually.');
    }
  }, []);

  const handleDownload = useCallback(
    async (key: string, fn: () => void) => {
      setStatus(key, 'in_progress');
      try {
        fn();
        setStatus(key, 'complete');
        toast.success('Downloaded!');
        setTimeout(() => setStatus(key, 'idle'), 3000);
      } catch {
        setStatus(key, 'failed');
        toast.error('Download failed. Please try again.');
      }
    },
    []
  );

  // ── Phase-based availability ───────────────────────────────────────────────
  const hasWorldReport = !!worldReport;
  const hasStoryboard = scenes.length > 0;
  const hasWorldAssets = !!(styleBible || characterSheet || envSheet);
  const hasPrompts = scenePrompts.length > 0;
  const hasImages = sceneImages.some((i) => i.image_url);
  const hasMotion = sceneVideos.some((v) => v.approved && v.video_url);
  const hasApprovedClips = motionClips.some((c) => c.approved);
  const hasPreviewVideo = !!(finalVideo?.preview_video_url);
  const hasFinalVideo = !!(finalVideo?.video_url);
  const finalVideoDownloadable = !!finalVideo?.downloadable;
  const isBrowserRendered = finalVideo?.render_status === 'Browser Rendered';
  const hasRenderManifest = !!(finalVideo?.render_manifest_url);
  const hasSegmentsInManifest = (finalVideo?.segment_count ?? 0) > 0;

  const p = slug(project.title);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full md:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #0e0e1a 0%, #111120 100%)',
          border: '1px solid rgba(99,102,241,0.20)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.30)' }}
            >
              <Download className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Export Project</h2>
              <p className="text-[11px] text-muted-foreground/60">{project.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Phase readiness badges */}
        <div className="px-5 pt-4 pb-2 flex flex-wrap gap-2">
          {hasWorldReport && hasStoryboard && (
            <ReadinessBadge label="World Report Ready" color="emerald" />
          )}
          {hasWorldAssets && (
            <ReadinessBadge label="World Assets Ready" color="blue" />
          )}
          {hasPrompts && (
            <ReadinessBadge label="Prompt Pack Ready" color="violet" />
          )}
          {hasImages && (
            <ReadinessBadge label="Scene Images Ready" color="amber" />
          )}
          {hasMotion && (
            <ReadinessBadge label="Motion Preview Ready" color="emerald" />
          )}
          {hasApprovedClips && (
            <ReadinessBadge label="Motion Clips Ready" color="violet" />
          )}
          {hasFinalVideo && (
            <ReadinessBadge label="Final Video Ready" color="emerald" />
          )}
        </div>

        {/* Export options */}
        <div className="px-5 pb-6 space-y-3 mt-2">

          {/* Visual World Report */}
          <ExportRow
            icon={<FileText className="w-4 h-4" />}
            label="Visual World Report"
            description="Your song's visual identity, world description, and creative analysis"
            available={hasWorldReport}
            status={statuses['world_report']}
            copied={copied['world_report']}
            onCopy={() => hasWorldReport && worldReport && handleCopy('world_report', buildWorldReportText(project, worldReport))}
            onDownload={() => hasWorldReport && worldReport && handleDownload('world_report', () =>
              downloadText(`${p}-world-report.txt`, buildWorldReportText(project, worldReport!))
            )}
            expanded={expandedSection === 'world_report'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'world_report' ? null : 'world_report')}
          >
            {worldReport && (
              <div className="text-xs text-muted-foreground space-y-1">
                {worldReport.song_summary && <p>"{worldReport.song_summary.slice(0, 120)}…"</p>}
              </div>
            )}
          </ExportRow>

          {/* Storyboard */}
          <ExportRow
            icon={<Sparkles className="w-4 h-4" />}
            label="Storyboard"
            description={`${scenes.length} scene storyboard with timing, camera directions, and mood`}
            available={hasStoryboard}
            status={statuses['storyboard']}
            copied={copied['storyboard']}
            onCopy={() => hasStoryboard && handleCopy('storyboard', buildStoryboardText(project, scenes))}
            onDownload={() => hasStoryboard && handleDownload('storyboard', () =>
              downloadText(`${p}-storyboard.txt`, buildStoryboardText(project, scenes))
            )}
            expanded={expandedSection === 'storyboard'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'storyboard' ? null : 'storyboard')}
          >
            <div className="text-xs text-muted-foreground space-y-0.5">
              {scenes.slice(0, 4).map((s) => (
                <p key={s.id}>
                  <span className="font-mono text-muted-foreground/50">
                    {String(s.scene_number).padStart(2, '0')}{s.timestamp_range ? ` · ${s.timestamp_range}` : ''}
                  </span>
                  {' '}{s.scene_title}
                </p>
              ))}
              {scenes.length > 4 && <p className="text-muted-foreground/40">+ {scenes.length - 4} more scenes</p>}
            </div>
          </ExportRow>

          {/* Style Bible */}
          <ExportRow
            icon={<Sparkles className="w-4 h-4" />}
            label="Style Bible"
            description="Visual style rules, color palette, lighting, and consistency guidelines"
            available={!!styleBible}
            status={statuses['style_bible']}
            copied={copied['style_bible']}
            onCopy={() => styleBible && handleCopy('style_bible', buildStyleBibleText(project, styleBible))}
            onDownload={() => styleBible && handleDownload('style_bible', () =>
              downloadText(`${p}-style-bible.txt`, buildStyleBibleText(project, styleBible!))
            )}
          />

          {/* Character Sheet */}
          <ExportRow
            icon={<FileText className="w-4 h-4" />}
            label="Character Sheet"
            description="Character appearance, wardrobe, and visual consistency notes"
            available={!!characterSheet}
            status={statuses['char_sheet']}
            copied={copied['char_sheet']}
            onCopy={() => characterSheet && handleCopy('char_sheet', buildCharacterSheetText(project, characterSheet))}
            onDownload={() => characterSheet && handleDownload('char_sheet', () =>
              downloadText(`${p}-character-sheet.txt`, buildCharacterSheetText(project, characterSheet!))
            )}
          />

          {/* Environment Sheet */}
          <ExportRow
            icon={<FileText className="w-4 h-4" />}
            label="Environment Sheet"
            description="World environment, locations, textures, and atmosphere details"
            available={!!envSheet}
            status={statuses['env_sheet']}
            copied={copied['env_sheet']}
            onCopy={() => envSheet && handleCopy('env_sheet', buildEnvSheetText(project, envSheet))}
            onDownload={() => envSheet && handleDownload('env_sheet', () =>
              downloadText(`${p}-environment-sheet.txt`, buildEnvSheetText(project, envSheet!))
            )}
          />

          {/* Scene Visual Prompts */}
          <ExportRow
            icon={<FileText className="w-4 h-4" />}
            label="Scene Visual Prompt Pack"
            description={`${scenePrompts.length} scene-by-scene image prompts with camera and lighting`}
            available={hasPrompts}
            status={statuses['prompts']}
            copied={copied['prompts']}
            onCopy={() => hasPrompts && handleCopy('prompts', buildPromptsText(project, scenePrompts))}
            onDownload={() => hasPrompts && handleDownload('prompts', () =>
              downloadText(`${p}-prompt-pack.txt`, buildPromptsText(project, scenePrompts))
            )}
          />

          {/* Scene Images */}
          <ExportRow
            icon={<ImageIcon className="w-4 h-4" />}
            label="Scene Images"
            description={hasImages ? `${sceneImages.filter(i => i.image_url).length} scene images — opens each image in a new tab` : 'No images generated yet'}
            available={hasImages}
            status={statuses['images']}
            copied={false}
            onDownload={() => {
              if (!hasImages) return;
              sceneImages
                .filter((i) => i.image_url)
                .forEach((i) => window.open(i.image_url!, '_blank'));
              toast.success('Opened all scene images in new tabs for download.');
            }}
            hideCopy
          />

          {/* Full Project Data (JSON) */}
          <ExportRow
            icon={<Package className="w-4 h-4" />}
            label="Full Project Package"
            description="Complete project data — all sections, prompts, approvals, and change log as JSON"
            available={hasWorldReport && hasStoryboard}
            status={statuses['full_json']}
            copied={copied['full_json']}
            onCopy={() => {
              if (!hasWorldReport || !hasStoryboard) return;
              const data = buildFullProjectData(project, worldReport, scenes, charEnv, styleBible, characterSheet, envSheet, scenePrompts, sceneImages, sceneVideos, changeLogs);
              handleCopy('full_json', JSON.stringify(data, null, 2));
            }}
            onDownload={() => hasWorldReport && hasStoryboard && handleDownload('full_json', () => {
              const data = buildFullProjectData(project, worldReport, scenes, charEnv, styleBible, characterSheet, envSheet, scenePrompts, sceneImages, sceneVideos, changeLogs);
              downloadJSON(`${p}-full-project.json`, data);
            })}
            accent
          />

          {/* Motion Clips */}
          {hasApprovedClips && (
            <ExportRow
              icon={<Film className="w-4 h-4" />}
              label="Motion Clips"
              description={(() => {
                const approvedWithUrl = motionClips.filter(c => c.approved && (c.preview_url || c.clip_url));
                if (approvedWithUrl.length === 0) return 'Motion clips are approved but have no downloadable URLs. Motion clips are generated by an external server renderer — connect one to produce clip files.';
                return `${approvedWithUrl.length} approved motion clip${approvedWithUrl.length !== 1 ? 's' : ''} — opens each clip preview in a new tab`;
              })()}
              available={hasApprovedClips && motionClips.some(c => c.approved && (c.preview_url || c.clip_url))}
              status={statuses['motion_clips']}
              copied={false}
              onDownload={() => {
                const approved = motionClips.filter(c => c.approved && (c.preview_url || c.clip_url));
                if (!approved.length) {
                  toast.error('No motion clips have downloadable URLs. Connect a server renderer to generate clip files.');
                  return;
                }
                approved.forEach(c => {
                  const url = c.clip_url || c.preview_url;
                  if (url) window.open(url, '_blank');
                });
                toast.success('Opened motion clip previews in new tabs.');
              }}
              hideCopy
            />
          )}

          {/* Preview Video / WebM Browser Render */}
          <ExportRow
            icon={<Film className="w-4 h-4" />}
            label={isBrowserRendered ? 'Browser Video Draft (WebM)' : 'Preview Video'}
            description={
              isBrowserRendered && (hasFinalVideo || hasPreviewVideo)
                ? 'Browser-rendered WebM draft — real playable video from canvas + scene images'
                : hasPreviewVideo
                ? 'In-app preview video — plays in browser'
                : hasSegmentsInManifest
                ? 'Segments created. Use "Render Browser Video" in the Segmented Video Renderer to produce a WebM draft.'
                : hasApprovedClips
                ? 'Generate a preview video from the Motion and Video Rendering section.'
                : 'No preview video yet. Render Browser Video or approve motion clips first.'
            }
            available={hasPreviewVideo || (isBrowserRendered && hasFinalVideo)}
            status={statuses['preview_video']}
            copied={false}
            onDownload={() => {
              const url = finalVideo?.video_url ?? finalVideo?.preview_video_url;
              if (!url) return;
              const a = document.createElement('a');
              a.href = url;
              a.download = `${p}-draft.webm`;
              a.click();
              toast.success('WebM draft download started.');
            }}
            onOpen={(hasPreviewVideo || (isBrowserRendered && hasFinalVideo)) ? () => {
              const url = finalVideo?.video_url ?? finalVideo?.preview_video_url;
              if (url) window.open(url, '_blank');
            } : undefined}
            hideCopy={!(hasPreviewVideo || (isBrowserRendered && hasFinalVideo))}
          />

          {/* Render Manifest */}
          <ExportRow
            icon={<FileText className="w-4 h-4" />}
            label="Render Manifest"
            description={
              hasRenderManifest
                ? `Production data — ${hasSegmentsInManifest ? `${finalVideo!.segment_count} segments` : 'segment plan'} · segment order, images, effects, captions, timing`
                : hasSegmentsInManifest
                ? 'Segments exist. Use "Export Render Manifest" in Segmented Video Renderer to export.'
                : 'No render manifest yet. Create video segments first.'
            }
            available={hasRenderManifest}
            status={statuses['render_manifest']}
            copied={false}
            onDownload={() => {
              if (!hasRenderManifest || !finalVideo?.render_manifest_url) return;
              const a = document.createElement('a');
              a.href = finalVideo.render_manifest_url;
              a.download = `${p}-render-manifest.json`;
              a.click();
              toast.success('Render manifest download started.');
            }}
            onOpen={hasRenderManifest && finalVideo?.render_manifest_url ? () => {
              window.open(finalVideo!.render_manifest_url!, '_blank');
            } : undefined}
            hideCopy={!hasRenderManifest}
          />

          {/* Final Music Video (server-rendered MP4) */}
          <ExportRow
            icon={<Film className="w-4 h-4" />}
            label="Final Music Video (MP4)"
            description={
              hasFinalVideo && !isBrowserRendered
                ? `${finalVideo?.format === 'video/webm' ? 'Rendered as WebM' : 'Music video ready'}${finalVideoDownloadable ? ' · Download available' : ''}`
                : 'MP4 export requires a server renderer. WebM draft export is available via Render Browser Video.'
            }
            available={hasFinalVideo && !isBrowserRendered}
            status={statuses['final_video']}
            copied={false}
            onDownload={() => {
              if (!hasFinalVideo || !finalVideo?.video_url || isBrowserRendered) return;
              const ext = finalVideo.format === 'video/webm' ? 'webm' : 'mp4';
              const a = document.createElement('a');
              a.href = finalVideo.video_url;
              a.download = `${p}-final.${ext}`;
              a.click();
              toast.success(`Final video download started (${ext.toUpperCase()}).`);
            }}
            onOpen={hasFinalVideo && !isBrowserRendered && finalVideo?.video_url ? () => {
              window.open(finalVideo!.video_url!, '_blank');
            } : undefined}
            hideCopy={!hasFinalVideo || isBrowserRendered}
            accent={hasFinalVideo && !isBrowserRendered}
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ReadinessBadge({ label, color }: { label: string; color: 'emerald' | 'blue' | 'violet' | 'amber' }) {
  const styles = {
    emerald: { background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' },
    blue: { background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' },
    violet: { background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' },
    amber: { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', color: '#fcd34d' },
  };
  return (
    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono" style={styles[color]}>
      <Check className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

function StatusIcon({ status }: { status: ExportStatus }) {
  if (status === 'in_progress') return <Clock className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />;
  if (status === 'complete') return <Check className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
  return null;
}

interface ExportRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  available: boolean;
  comingSoon?: boolean;
  status: ExportStatus | 'idle';
  copied: boolean;
  onCopy?: () => void;
  onDownload: () => void;
  onOpen?: () => void;
  hideCopy?: boolean;
  accent?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  children?: React.ReactNode;
}

function ExportRow({
  icon, label, description, available, comingSoon,
  status, copied, onCopy, onDownload, onOpen, hideCopy, accent,
  expanded, onToggleExpand, children,
}: ExportRowProps) {
  const dimmed = !available || !!comingSoon;

  return (
    <div
      className={`rounded-xl transition-colors ${dimmed ? 'opacity-50' : ''}`}
      style={{
        background: accent
          ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(6,182,212,0.06) 100%)'
          : 'rgba(255,255,255,0.025)',
        border: accent
          ? '1px solid rgba(16,185,129,0.20)'
          : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{
            background: accent ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: accent ? '#6ee7b7' : 'rgb(163,163,163)',
          }}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground/90">{label}</p>
            {comingSoon && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
              >
                Coming Soon
              </span>
            )}
            <StatusIcon status={status as ExportStatus} />
          </div>
          <p className="text-xs text-muted-foreground/55 mt-0.5 text-pretty">{description}</p>
        </div>

        {/* Actions */}
        {!comingSoon && available && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpen && (
              <ActionBtn onClick={onOpen} title="Open / Play">
                <Play className="w-3.5 h-3.5" />
              </ActionBtn>
            )}
            {!hideCopy && onCopy && (
              <ActionBtn onClick={onCopy} title="Copy">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </ActionBtn>
            )}
            <ActionBtn onClick={onDownload} title="Download" accent={accent}>
              <Download className="w-3.5 h-3.5" />
            </ActionBtn>
            {children && onToggleExpand && (
              <ActionBtn onClick={onToggleExpand} title="Preview">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </ActionBtn>
            )}
          </div>
        )}
      </div>

      {expanded && children && (
        <div
          className="px-4 pb-3 pt-0 border-t text-xs"
          style={{ borderColor: 'rgba(255,255,255,0.05)' }}
        >
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  onClick, title, accent, children,
}: { onClick: () => void; title?: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
      style={accent
        ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.30)', color: '#6ee7b7' }
        : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgb(163,163,163)' }
      }
    >
      {children}
    </button>
  );
}
