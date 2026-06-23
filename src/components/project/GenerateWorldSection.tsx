import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { createLocalWorldAssets, createLocalScenePromptsOnly } from '@/lib/worldAssetFallbacks';
import type {
  Project,
  VisualWorldReport,
  StoryboardScene,
  CharacterEnvironment,
  WorldStyleBible,
  CharacterSheet,
  EnvironmentSheet,
  SceneVisualPrompt,
  ScenePreview,
} from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Sparkles, ChevronDown, ChevronUp, BookOpen, User, Globe, Film, Play, BarChart2
} from 'lucide-react';
import { toast } from 'sonner';
import WorldStyleBibleSection from './WorldStyleBibleSection';
import CharacterSheetSection from './CharacterSheetSection';
import EnvironmentSheetSection from './EnvironmentSheetSection';
import SceneVisualPromptSection from './SceneVisualPromptSection';
import ScenePreviewCardsSection from './ScenePreviewCardsSection';
import WorldGenerationStatusTracker from './WorldGenerationStatusTracker';

interface Props {
  project: Project;
  worldReport: VisualWorldReport | null;
  scenes: StoryboardScene[];
  charEnv: CharacterEnvironment | null;
  onProjectUpdate: (p: Project) => void;
  onChangeLogged?: () => void;
}

type GenState = 'idle' | 'generating' | 'done';

export default function GenerateWorldSection({ project, worldReport, scenes, charEnv, onProjectUpdate, onChangeLogged }: Props) {
  const [genState, setGenState] = useState<GenState>('idle');
  const [generating, setGenerating] = useState(false);
  const genRef = useRef(false);

  // Phase 2 data
  const [styleBible, setStyleBible] = useState<WorldStyleBible | null>(null);
  const [characterSheet, setCharacterSheet] = useState<CharacterSheet | null>(null);
  const [envSheet, setEnvSheet] = useState<EnvironmentSheet | null>(null);
  const [scenePrompts, setScenePrompts] = useState<SceneVisualPrompt[]>([]);
  const [repairingScenePrompts, setRepairingScenePrompts] = useState(false);
  const [scenePreviews, setScenePreviews] = useState<ScenePreview[]>([]);

  // Per-sub-section generating flags
  const [genBible, setGenBible] = useState(false);
  const [genCharSheet, setGenCharSheet] = useState(false);
  const [genEnvSheet, setGenEnvSheet] = useState(false);
  const [genPrompts, setGenPrompts] = useState(false);
  const [genPreviews, setGenPreviews] = useState(false);
  const [refreshingPromptId, setRefreshingPromptId] = useState<string | null>(null);

  // Collapsed state for subsections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tracker: true,
    bible: true,
    charSheet: true,
    envSheet: true,
    prompts: true,
    previews: true,
  });

  const toggle = (key: string) =>
    setExpandedSections((p) => ({ ...p, [key]: !p[key] }));

  // ── Fetch existing Phase 2 data on mount ──────────────────────────────────
  const fetchExistingData = useCallback(async () => {
    const pid = project.id;
    const [bRes, csRes, esRes, svpRes, spRes] = await Promise.all([
      supabase.from('world_style_bibles').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('character_sheets').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('environment_sheets').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scene_visual_prompts').select('*').eq('project_id', pid).order('scene_number', { ascending: true }),
      supabase.from('scene_previews').select('*').eq('project_id', pid).order('created_at', { ascending: true }),
    ]);
    if (bRes.data) setStyleBible(bRes.data as WorldStyleBible);
    if (csRes.data) setCharacterSheet(csRes.data as CharacterSheet);
    if (esRes.data) setEnvSheet(esRes.data as EnvironmentSheet);
    if (svpRes.data) setScenePrompts(Array.isArray(svpRes.data) ? svpRes.data as SceneVisualPrompt[] : []);
    if (spRes.data) setScenePreviews(Array.isArray(spRes.data) ? spRes.data as ScenePreview[] : []);
    if (bRes.data || csRes.data || esRes.data || (svpRes.data && svpRes.data.length > 0)) {
      setGenState('done');
    }
  }, [project.id]);

  // Load existing data when component first mounts
  useState(() => {
    fetchExistingData();
  });

  // ── Helper: call edge function ────────────────────────────────────────────
  const callEdgeFn = async (body: Record<string, unknown>) => {
    const res = await supabase.functions.invoke('beatvision-generate', { body });
    if (res.error) {
      const msg = await res.error?.context?.text?.();
      throw new Error(msg || 'Generation failed');
    }
    return res.data;
  };

  const baseContext = {
    projectTitle: project.title,
    lyrics: project.lyrics || '',
    style: project.selected_style,
    notes: project.optional_notes || '',
  };

  const worldReportContext = worldReport
    ? {
        main_visual_world: worldReport.main_visual_world,
        emotional_core: worldReport.emotional_core,
        color_palette: worldReport.color_palette,
        lighting_style: worldReport.lighting_style,
        story_direction: worldReport.story_direction,
      }
    : {};

  const charEnvContext = charEnv
    ? {
        main_character: charEnv.main_character,
        supporting_character: charEnv.supporting_character,
        main_environment: charEnv.main_environment,
        visual_atmosphere: charEnv.visual_atmosphere,
        wardrobe_style: charEnv.wardrobe_style,
        world_rules: charEnv.world_rules,
      }
    : {};

  // ── Generate Style Bible ──────────────────────────────────────────────────
  const generateStyleBible = async (seed = 1): Promise<WorldStyleBible | null> => {
    void seed;
    setGenBible(true);
    try {
      const fallback = await createLocalWorldAssets({ project, worldReport, scenes, charEnv });

      if (fallback.bible) setStyleBible(fallback.bible);
      if (fallback.charSheet) setCharacterSheet(fallback.charSheet);
      if (fallback.envSheet) setEnvSheet(fallback.envSheet);
      setScenePrompts(fallback.prompts);
      setScenePreviews(fallback.previews);

      toast.success('World Style Bible regenerated locally.');
      return fallback.bible;
    } catch (err: unknown) {
      console.error('[BeatVision] Local style bible regeneration failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate World Style Bible.');
      return null;
    } finally {
      setGenBible(false);
    }
  };

  // ── Generate Character Sheet ──────────────────────────────────────────────
  const generateCharacterSheet = async (seed = 1): Promise<CharacterSheet | null> => {
    void seed;
    setGenCharSheet(true);
    try {
      const fallback = await createLocalWorldAssets({ project, worldReport, scenes, charEnv });

      if (fallback.bible) setStyleBible(fallback.bible);
      if (fallback.charSheet) setCharacterSheet(fallback.charSheet);
      if (fallback.envSheet) setEnvSheet(fallback.envSheet);
      setScenePrompts(fallback.prompts);
      setScenePreviews(fallback.previews);

      toast.success('Character Sheet regenerated locally.');
      return fallback.charSheet;
    } catch (err: unknown) {
      console.error('[BeatVision] Local character sheet regeneration failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate Character Sheet.');
      return null;
    } finally {
      setGenCharSheet(false);
    }
  };

  // ── Generate Environment Sheet ────────────────────────────────────────────
  const generateEnvironmentSheet = async (seed = 1): Promise<EnvironmentSheet | null> => {
    void seed;
    setGenEnvSheet(true);
    try {
      const fallback = await createLocalWorldAssets({ project, worldReport, scenes, charEnv });

      if (fallback.bible) setStyleBible(fallback.bible);
      if (fallback.charSheet) setCharacterSheet(fallback.charSheet);
      if (fallback.envSheet) setEnvSheet(fallback.envSheet);
      setScenePrompts(fallback.prompts);
      setScenePreviews(fallback.previews);

      toast.success('Environment Sheet regenerated locally.');
      return fallback.envSheet;
    } catch (err: unknown) {
      console.error('[BeatVision] Local environment sheet regeneration failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate Environment Sheet.');
      return null;
    } finally {
      setGenEnvSheet(false);
    }
  };

  // ── Generate Scene Visual Prompts ─────────────────────────────────────────
  const generateScenePrompts = async (bibleData: WorldStyleBible | null, charSheetData: CharacterSheet | null, envSheetData: EnvironmentSheet | null): Promise<SceneVisualPrompt[]> => {
    setGenPrompts(true);
    try {
      const styleBibleContext = bibleData
        ? {
            overall_visual_style: bibleData.overall_visual_style,
            color_rules: bibleData.color_rules,
            camera_rules: bibleData.camera_rules,
            things_to_avoid: bibleData.things_to_avoid,
          }
        : {};
      const charSheetContext = charSheetData
        ? { character_role: charSheetData.character_role, appearance: charSheetData.appearance }
        : {};
      const envSheetContext = envSheetData
        ? { main_world_description: envSheetData.main_world_description }
        : {};

      const result = await callEdgeFn({
        ...baseContext,
        action: 'generate_scene_prompts',
        scenes: scenes.map((s) => ({
          scene_number: s.scene_number,
          scene_title: s.scene_title,
          location: s.location,
          mood: s.mood,
          camera_direction: s.camera_direction,
          lyric_moment: s.lyric_moment,
          timestamp_range: s.timestamp_range,
        })),
        worldReport: worldReportContext,
        styleBible: styleBibleContext,
        characterSheet: charSheetContext,
        environmentSheet: envSheetContext,
      });
      const promptsData = (Array.isArray(result?.data) ? result.data : []) as Record<string, unknown>[];
      if (!promptsData.length) return [];

      await supabase.from('scene_visual_prompts').delete().eq('project_id', project.id);

      const toInsert = promptsData.map((d, i) => {
        const matchingScene = scenes.find((s) => s.scene_number === (d.scene_number as number)) || scenes[i];
        return {
          project_id: project.id,
          storyboard_scene_id: matchingScene?.id ?? null,
          scene_number: (d.scene_number as number) || i + 1,
          scene_title: (d.scene_title as string) || null,
          timestamp_range: (d.timestamp_range as string) || null,
          main_image_prompt: (d.main_image_prompt as string) || null,
          camera_framing: (d.camera_framing as string) || null,
          lighting_direction: (d.lighting_direction as string) || null,
          character_placement: (d.character_placement as string) || null,
          mood: (d.mood as string) || null,
          environment_details: (d.environment_details as string) || null,
          symbolic_objects: (d.symbolic_objects as string) || null,
          style_consistency_notes: (d.style_consistency_notes as string) || null,
          negative_prompt: (d.negative_prompt as string) || null,
          approved: false,
          preview_generated: false,
        };
      });

      const { data: saved, error } = await supabase
        .from('scene_visual_prompts')
        .insert(toInsert)
        .select();
      if (error) throw error;
      const savedPrompts = (Array.isArray(saved) ? saved : []) as SceneVisualPrompt[];
      setScenePrompts(savedPrompts);
      return savedPrompts;
    } finally {
      setGenPrompts(false);
    }
  };

  // ── Generate Scene Previews ───────────────────────────────────────────────
  const generateScenePreviews = async (promptsList: SceneVisualPrompt[]): Promise<void> => {
    setGenPreviews(true);
    try {
      const result = await callEdgeFn({
        ...baseContext,
        action: 'generate_scene_previews',
        scenePrompts: promptsList.map((p) => ({
          scene_number: p.scene_number,
          scene_title: p.scene_title,
          mood: p.mood,
          environment_details: p.environment_details,
          camera_framing: p.camera_framing,
          symbolic_objects: p.symbolic_objects,
        })),
        worldReport: worldReportContext,
      });
      const previewsData = (Array.isArray(result?.data) ? result.data : []) as Record<string, unknown>[];
      if (!previewsData.length) return;

      await supabase.from('scene_previews').delete().eq('project_id', project.id);

      const toInsert = previewsData.map((d, i) => {
        const matchingPrompt = promptsList.find((p) => p.scene_number === (d.scene_number as number)) || promptsList[i];
        return {
          project_id: project.id,
          scene_visual_prompt_id: matchingPrompt?.id ?? null,
          preview_title: (d.preview_title as string) || null,
          preview_description: (d.preview_description as string) || null,
          dominant_colors: (d.dominant_colors as string) || null,
          mood: (d.mood as string) || null,
          location: (d.location as string) || null,
          symbolic_object: (d.symbolic_object as string) || null,
          camera_direction: (d.camera_direction as string) || null,
          placeholder_visual: (d.placeholder_visual as string) || null,
          image_url: null,
          approved: false,
        };
      });

      const { data: saved, error } = await supabase
        .from('scene_previews')
        .insert(toInsert)
        .select();
      if (error) throw error;
      setScenePreviews((Array.isArray(saved) ? saved : []) as ScenePreview[]);
    } finally {
      setGenPreviews(false);
    }
  };

  // ── Master Generate the World ─────────────────────────────────────────────
  const handleGenerateWorld = async () => {
    if (genRef.current) return;

    genRef.current = true;
    setGenerating(true);
    setGenState('generating');

    try {
      const now = new Date().toISOString();

      await supabase
        .from('projects')
        .update({ status: 'Generating World Assets', updated_at: now })
        .eq('id', project.id);

      onProjectUpdate({ ...project, status: 'Generating World Assets' });

      const fallback = await createLocalWorldAssets({ project, worldReport, scenes, charEnv });

      setStyleBible(fallback.bible);
      setCharacterSheet(fallback.charSheet);
      setEnvSheet(fallback.envSheet);
      setScenePrompts(fallback.prompts);
      setScenePreviews(fallback.previews);
      setGenState('done');

      onProjectUpdate({ ...project, status: 'World Assets In Review' });

      if (!fallback.prompts.length) {
        toast.warning('World assets were created, but no scene prompts were returned. Regenerate storyboard, then generate world again.', {
          duration: 7000,
        });
      } else {
        toast.success('World assets created locally. Review and approve each section.', {
          duration: 5000,
        });
      }
    } catch (err: unknown) {
      console.error('[BeatVision] Local-first world asset generation failed:', err);
      setGenState('idle');
      const diagnosticObject = err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack,
          }
        : {
            rawType: typeof err,
            rawValue: (() => {
              try {
                return JSON.stringify(err, null, 2);
              } catch {
                return String(err);
              }
            })(),
          };

      const diagnosticMessage = `[BeatVision World Asset Runtime Diagnostic]\\n${JSON.stringify(diagnosticObject, null, 2)}`;

      console.error('[BeatVision] FULL LOCAL WORLD ASSET DIAGNOSTIC:', diagnosticMessage);

      try {
        window.localStorage.setItem('beatvision:lastWorldAssetError', diagnosticMessage);
      } catch (storageErr) {
        console.warn('[BeatVision] Could not save diagnostic to localStorage:', storageErr);
      }

      try {
        void navigator.clipboard?.writeText?.(diagnosticMessage);
      } catch (clipErr) {
        console.warn('[BeatVision] Could not copy diagnostic:', clipErr);
      }

      try {
        window.alert(diagnosticMessage);
      } catch {
        // alert can be blocked, toast still shows.
      }

      toast.error('World asset generation failed. Diagnostic was shown and saved to localStorage.', { duration: 20000 });
    } finally {
      setGenerating(false);
      genRef.current = false;
    }
  };

  // ── Refresh single scene prompt ───────────────────────────────────────────

  const handleRepairMissingScenePrompts = async () => {
    if (!project?.id) return;

    try {
      setRepairingScenePrompts(true);

      const repairedPrompts = await createLocalScenePromptsOnly({
        project,
        worldReport,
        scenes,
        styleBible,
        characterSheet,
        envSheet,
      });

      setScenePrompts(repairedPrompts);

      const now = new Date().toISOString();
      const { data: updatedProject } = await supabase
        .from('projects')
        .update({
          status: 'World Assets In Review',
          scene_prompts_approved: false,
          updated_at: now,
        })
        .eq('id', project.id)
        .select()
        .maybeSingle();

      if (updatedProject) {
        onProjectUpdate(updatedProject as Project);
      } else {
        onProjectUpdate({
          ...project,
          status: 'World Assets In Review',
          scene_prompts_approved: false,
          updated_at: now,
        } as Project);
      }

      toast.success(`Rebuilt ${repairedPrompts.length} missing scene visual prompt${repairedPrompts.length === 1 ? '' : 's'}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[BeatVision] Missing scene prompt repair failed:', err);
      toast.error(`Scene prompt repair failed: ${message}`, { duration: 20000 });
    } finally {
      setRepairingScenePrompts(false);
    }
  };

  const handleRefreshPrompt = async (prompt: SceneVisualPrompt) => {
    setRefreshingPromptId(prompt.id);
    try {
      const result = await callEdgeFn({
        ...baseContext,
        action: 'refresh_scene_prompt',
        scenePrompt: prompt,
        worldReport: worldReportContext,
        styleBible: styleBible
          ? { overall_visual_style: styleBible.overall_visual_style, color_rules: styleBible.color_rules, camera_rules: styleBible.camera_rules, things_to_avoid: styleBible.things_to_avoid }
          : {},
        seed: Date.now(),
      });
      const d = result?.data as Record<string, unknown>;
      if (!d) throw new Error('No data returned');

      const updates = {
        main_image_prompt: (d.main_image_prompt as string) || prompt.main_image_prompt,
        camera_framing: (d.camera_framing as string) || prompt.camera_framing,
        lighting_direction: (d.lighting_direction as string) || prompt.lighting_direction,
        character_placement: (d.character_placement as string) || prompt.character_placement,
        mood: (d.mood as string) || prompt.mood,
        environment_details: (d.environment_details as string) || prompt.environment_details,
        symbolic_objects: (d.symbolic_objects as string) || prompt.symbolic_objects,
        style_consistency_notes: (d.style_consistency_notes as string) || prompt.style_consistency_notes,
        negative_prompt: (d.negative_prompt as string) || prompt.negative_prompt,
        approved: false,
        updated_at: new Date().toISOString(),
      };

      const { data: saved, error } = await supabase
        .from('scene_visual_prompts')
        .update(updates)
        .eq('id', prompt.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) {
        setScenePrompts((prev) => prev.map((p) => (p.id === prompt.id ? (saved as SceneVisualPrompt) : p)));
        toast.info(`Scene ${prompt.scene_number} prompt refreshed.`);
      }
    } catch {
      toast.error('Failed to refresh scene prompt.');
    } finally {
      setRefreshingPromptId(null);
    }
  };

  // ── When all scene prompts approved → check if ready ─────────────────────
  const handleAllPromptsApproved = async () => {
    const proj = project;
    await supabase
      .from('projects')
      .update({ scene_prompts_approved: true, updated_at: new Date().toISOString() })
      .eq('id', proj.id);
    onProjectUpdate({ ...proj, scene_prompts_approved: true });
    // Check if all approved
    if (proj.style_bible_approved && proj.character_sheet_approved && proj.environment_sheet_approved) {
      await supabase
        .from('projects')
        .update({ status: 'Ready for Image Generation', updated_at: new Date().toISOString() })
        .eq('id', proj.id);
      onProjectUpdate({ ...proj, status: 'Ready for Image Generation', scene_prompts_approved: true });
      toast.success('🎬 All world assets approved. Your project is Ready for Image Generation!', { duration: 6000 });
    }
  };

  // Check if all approved → update status
  const checkAllAssetsApproved = async (updatedProject: Project) => {
    if (
      updatedProject.style_bible_approved &&
      updatedProject.character_sheet_approved &&
      updatedProject.environment_sheet_approved &&
      updatedProject.scene_prompts_approved
    ) {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'Ready for Image Generation', updated_at: new Date().toISOString() })
        .eq('id', updatedProject.id);
      if (!error) {
        onProjectUpdate({ ...updatedProject, status: 'Ready for Image Generation' });
        toast.success('🎬 All world assets approved. Ready for Image Generation!', { duration: 6000 });
      }
    }
  };

  const handleStyleBibleApproved = async (b: WorldStyleBible) => {
    setStyleBible(b);
    const updated = { ...project, style_bible_approved: true };
    onProjectUpdate(updated);
    await checkAllAssetsApproved(updated);
  };

  const handleCharSheetApproved = async (s: CharacterSheet) => {
    setCharacterSheet(s);
    const updated = { ...project, character_sheet_approved: true };
    onProjectUpdate(updated);
    await checkAllAssetsApproved(updated);
  };

  const handleEnvSheetApproved = async (e: EnvironmentSheet) => {
    setEnvSheet(e);
    const updated = { ...project, environment_sheet_approved: true };
    onProjectUpdate(updated);
    await checkAllAssetsApproved(updated);
  };

  const hasAnyAssets = styleBible || characterSheet || envSheet || scenePrompts.length > 0;

  // ── Collapsible Section Header ────────────────────────────────────────────
  const SectionHeader = ({ id, icon: Icon, title, color, badge }: { id: string; icon: React.ElementType; title: string; color: string; badge?: React.ReactNode }) => (
    <button
      className="w-full flex items-center gap-3 text-left py-2 hover:opacity-80 transition-opacity"
      onClick={() => toggle(id)}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color }} />
      <span className="font-semibold text-white flex-1 text-balance">{title}</span>
      {badge}
      {expandedSections[id]
        ? <ChevronUp className="h-4 w-4 text-white/30 shrink-0" />
        : <ChevronDown className="h-4 w-4 text-white/30 shrink-0" />}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="space-y-2">
        <p className="text-white/60 text-sm leading-relaxed text-pretty">
          Your world is approved. BeatVision can now generate the visual foundation for your music video: the style bible, character sheet, environment sheet, and scene-by-scene visual prompts.
        </p>

        {/* Master generate button */}
        {!hasAnyAssets && (
          <Button
            size="lg"
            onClick={handleGenerateWorld}
            disabled={generating}
            className="w-full text-white font-bold text-base mt-4"
            style={{
              background: generating
                ? 'rgba(59,126,255,0.3)'
                : 'linear-gradient(135deg, #3b7eff 0%, #8b5cf6 50%, #3b7eff 100%)',
              backgroundSize: '200% 100%',
              boxShadow: generating ? 'none' : '0 0 32px rgba(59,126,255,0.4)',
            }}
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Generating Your World…
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Generate the World
              </>
            )}
          </Button>
        )}

        {hasAnyAssets && !generating && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              className="text-xs"
              style={{ background: 'rgba(59,126,255,0.2)', color: '#93c5fd', border: '1px solid rgba(59,126,255,0.3)' }}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              World Assets Generated
            </Badge>
            <button
              onClick={handleGenerateWorld}
              disabled={generating}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Regenerate All
            </button>
          </div>
        )}
      </div>

      {/* Production Status Tracker */}
      <Card className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <CardContent className="p-4">
          <SectionHeader
            id="tracker"
            icon={BarChart2}
            title="Production Status"
            color="#3b7eff"
          />
          {expandedSections.tracker && (
            <div className="mt-3">
              <WorldGenerationStatusTracker
                worldApproved={project.world_approved}
                storyboardApproved={project.storyboard_approved}
                charactersApproved={project.characters_approved}
                styleBibleApproved={project.style_bible_approved}
                characterSheetApproved={project.character_sheet_approved}
                environmentSheetApproved={project.environment_sheet_approved}
                scenePromptsApproved={project.scene_prompts_approved}
                generating={generating}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* World Style Bible */}
      <Card className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <CardContent className="p-4">
          <SectionHeader
            id="bible"
            icon={BookOpen}
            title="World Style Bible"
            color="#3b7eff"
            badge={
              styleBible?.approved
                ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs mr-1">Approved</Badge>
                : null
            }
          />
          {expandedSections.bible && (
            <div className="mt-3">
              <WorldStyleBibleSection
                bible={styleBible}
                project={project}
                generating={genBible}
                onGenerate={() => generateStyleBible(Date.now())}
                onApproved={handleStyleBibleApproved}
                onBibleUpdate={setStyleBible}
                onChangeLogged={onChangeLogged}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Character Sheet */}
      <Card className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <CardContent className="p-4">
          <SectionHeader
            id="charSheet"
            icon={User}
            title="Character Sheet"
            color="#8b5cf6"
            badge={
              characterSheet?.approved
                ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs mr-1">Approved</Badge>
                : null
            }
          />
          {expandedSections.charSheet && (
            <div className="mt-3">
              <CharacterSheetSection
                sheet={characterSheet}
                project={project}
                generating={genCharSheet}
                onGenerate={() => generateCharacterSheet(Date.now())}
                onApproved={handleCharSheetApproved}
                onSheetUpdate={setCharacterSheet}
                onChangeLogged={onChangeLogged}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Environment Sheet */}
      <Card className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <CardContent className="p-4">
          <SectionHeader
            id="envSheet"
            icon={Globe}
            title="Environment Sheet"
            color="#10b981"
            badge={
              envSheet?.approved
                ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs mr-1">Approved</Badge>
                : null
            }
          />
          {expandedSections.envSheet && (
            <div className="mt-3">
              <EnvironmentSheetSection
                envSheet={envSheet}
                project={project}
                generating={genEnvSheet}
                onGenerate={() => generateEnvironmentSheet(Date.now())}
                onApproved={handleEnvSheetApproved}
                onSheetUpdate={setEnvSheet}
                onChangeLogged={onChangeLogged}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scene Visual Prompt Pack */}
      <Card className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <CardContent className="p-4">
          <SectionHeader
            id="prompts"
            icon={Film}
            title="Scene Visual Prompt Pack"
            color="#f59e0b"
            badge={
              project.scene_prompts_approved
                ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs mr-1">All Approved</Badge>
                : scenePrompts.length > 0
                ? <Badge variant="outline" className="border-white/20 text-white/40 text-xs mr-1">{scenePrompts.filter((p) => p.approved).length}/{scenePrompts.length}</Badge>
                : null
            }
          />
          {false && expandedSections.prompts && (
            <div className="mt-3">
              
              {/* NESTED SCENE PROMPT DIAGNOSTIC */}
              <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 mb-4 text-xs font-mono text-yellow-100">
                <div className="font-bold text-yellow-300 mb-2">NESTED SCENE PROMPT DIAGNOSTIC</div>
                <div>project_id: {project.id}</div>
                <div>project.status: {project.status || 'none'}</div>
                <div>project.scene_prompts_approved: {String(Boolean(project.scene_prompts_approved))}</div>
                <div>local scenePrompts count: {scenePrompts.length}</div>
                <div>local approved prompt count: {scenePrompts.filter((p) => Boolean(p.approved)).length}</div>
                <div>styleBible exists: {String(Boolean(styleBible))}</div>
                <div>characterSheet exists: {String(Boolean(characterSheet))}</div>
                <div>envSheet exists: {String(Boolean(envSheet))}</div>
                <div className="break-words">
                  prompt ids: {scenePrompts.map((p) => `${p.scene_number ?? '?'}:${p.id ?? 'missing-id'}:${p.approved ? 'approved' : 'not-approved'}`).join(' | ') || 'none'}
                </div>
                {scenePrompts.length === 0 && (
                  <div className="mt-2 text-red-200 space-y-3">
                    <div>
                      GenerateWorldSection has zero local scene prompts. Either fallback insertion failed, fetchInitial did not load rows, or setScenePrompts was not reached.
                    </div>
                    {styleBible && characterSheet && envSheet && (
                      <button
                        type="button"
                        onClick={handleRepairMissingScenePrompts}
                        disabled={repairingScenePrompts}
                        className="rounded-lg border border-yellow-400/50 bg-yellow-400/20 px-3 py-2 text-xs font-bold text-yellow-100 disabled:opacity-60"
                      >
                        {repairingScenePrompts ? 'Repairing Scene Prompts...' : 'Repair Missing Scene Prompts'}
                      </button>
                    )}
                  </div>
                )}
              </div>
<SceneVisualPromptSection
                prompts={scenePrompts}
                project={project}
                generatingAll={genPrompts}
                refreshingId={refreshingPromptId}
                onRefreshPrompt={handleRefreshPrompt}
                onAllApproved={handleAllPromptsApproved}
                onPromptUpdate={(p) => setScenePrompts((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
                onChangeLogged={onChangeLogged}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scene Preview Cards */}
      <Card className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <CardContent className="p-4">
          <SectionHeader
            id="previews"
            icon={Play}
            title="Scene Preview Cards"
            color="#f59e0b"
          />
          {expandedSections.previews && (
            <div className="mt-3">
              <ScenePreviewCardsSection
                previews={scenePreviews}
                prompts={scenePrompts}
                generating={genPreviews}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
