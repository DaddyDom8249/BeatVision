import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { Project, VisualWorldReport, StoryboardScene, CharacterEnvironment, SceneVisualPrompt, ProjectChangeLog, WorldStyleBible, CharacterSheet, EnvironmentSheet, SceneImage } from '@/types/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/layouts/Navbar';
import VisualWorldReportSection from '@/components/project/VisualWorldReportSection';
import StoryboardSection from '@/components/project/StoryboardSection';
import CharacterEnvironmentSection from '@/components/project/CharacterEnvironmentSection';
import GenerateWorldSection from '@/components/project/GenerateWorldSection';
import GenerateSceneImagesSection from '@/components/project/GenerateSceneImagesSection';
import BetaFeedbackSection from '@/components/project/BetaFeedbackSection';
import ReviewChangesPanel from '@/components/project/ReviewChangesPanel';
import ReviewStatusCard from '@/components/project/ReviewStatusCard';
import ProjectChangeLogSection from '@/components/project/ProjectChangeLogSection';
import type { AffectedSectionItem } from '@/components/project/ReviewChangesPanel';
import { reapproveSection, createChangeLogEntry } from '@/hooks/useReviewChanges';
import { ArrowLeft, Music2, Sparkles, Lock, Clapperboard, Loader2, ImageIcon, Settings2 } from 'lucide-react';
import ImageProviderSettingsSection from '@/components/project/ImageProviderSettingsSection';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  'Draft': 'bg-muted text-muted-foreground border-border',
  'World Revealed': 'bg-primary/10 text-primary/80 border-primary/20',
  'World Approved': 'bg-primary/15 text-primary border-primary/30',
  'Storyboard Approved': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'Characters Approved': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Generating World Assets': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'World Assets Approved': 'bg-green-500/15 text-green-400 border-green-500/30',
  'Generating Scene Images': 'bg-blue-500/20 text-blue-300 border-blue-400/40',
  'Scene Images In Review': 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
  'Scene Images Approved': 'bg-green-500/20 text-green-300 border-green-400/40',
  'Ready for Motion': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  'Ready for Image Generation': 'bg-green-500/20 text-green-300 border-green-400/40',
  'Ready for Video Generation': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  // Legacy DB value — kept for backward compatibility with older projects
  'Ready for Generation': 'bg-green-500/15 text-green-400 border-green-500/30',
  'Generating Motion': 'bg-blue-500/20 text-blue-300 border-blue-400/40',
  'Preview Ready': 'bg-primary/20 text-primary border-primary/30',
  'Export Ready': 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'Motion In Review': 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
  'Motion Approved': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  'Motion Settings Ready': 'bg-blue-500/15 text-blue-300 border-blue-400/30',
  'Motion Plan Ready': 'bg-violet-500/15 text-violet-300 border-violet-400/30',
  'Motion Clips In Review': 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
  'Motion Clips Approved': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  'Preview Render Ready': 'bg-violet-500/20 text-violet-300 border-violet-400/40',
  'Final Video Rendered': 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
};

export default function ProjectResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [worldReport, setWorldReport] = useState<VisualWorldReport | null>(null);
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [charEnv, setCharEnv] = useState<CharacterEnvironment | null>(null);
  const [scenePrompts, setScenePrompts] = useState<SceneVisualPrompt[]>([]);
  const [changeLogs, setChangeLogs] = useState<ProjectChangeLog[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [styleBible, setStyleBible] = useState<WorldStyleBible | null>(null);
  const [characterSheet, setCharacterSheet] = useState<CharacterSheet | null>(null);
  const [envSheet, setEnvSheet] = useState<EnvironmentSheet | null>(null);
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [generatingWorld, setGeneratingWorld] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingCharacters, setGeneratingCharacters] = useState(false);

  // Phase 3+ — Image provider settings (Credit-Safe Mode: default OFF)
  const [realProvidersEnabled, setRealProvidersEnabled] = useState(false);
  const [providerActive, setProviderActive] = useState(false);
  const [providerName, setProviderName] = useState<string>('Manual Upload Only');
  const [providerEndpoint, setProviderEndpoint] = useState<string | null>(null);

  // Review panel interaction state
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const worldGenRef = useRef(false);
  const storyGenRef = useRef(false);
  const charGenRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!id || !user) return;
    loadProject();
  }, [id, user]);

  const loadChangeLogs = useCallback(async (projectId: string) => {
    const { data } = await supabase
      .from('project_change_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    setChangeLogs(Array.isArray(data) ? (data as ProjectChangeLog[]) : []);
  }, []);

  const loadProject = async () => {
    setLoadingProject(true);
    try {
      const { data: proj, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !proj) throw error || new Error('Project not found');
      setProject(proj);

      // Load Visual World Report
      const { data: reportData } = await supabase
        .from('visual_world_reports')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setWorldReport(reportData || null);

      // Repair unlock state:
      // If the visual world report is approved but the project flag was not updated,
      // unlock storyboard generation instead of trapping the user on a locked story step.
      if (reportData?.approved && !proj.world_approved) {
        const { data: repairedProject } = await supabase
          .from('projects')
          .update({
            world_approved: true,
            status: 'World Approved',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .maybeSingle();

        if (repairedProject) {
          setProject(repairedProject as Project);
        }

        // Keep this load cycle moving too, not just the next page refresh.
        proj.world_approved = true;
        proj.status = 'World Approved';
      }

      // Load Storyboard Scenes
      const { data: scenesData } = await supabase
        .from('storyboard_scenes')
        .select('*')
        .eq('project_id', id)
        .order('scene_number', { ascending: true });
      setScenes(Array.isArray(scenesData) ? scenesData : []);

      // Load Character Environment
      const { data: charData } = await supabase
        .from('character_environments')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setCharEnv(charData || null);

      // Load scene visual prompts
      const { data: promptsData } = await supabase
        .from('scene_visual_prompts')
        .select('*')
        .eq('project_id', id)
        .order('scene_number', { ascending: true });
      setScenePrompts(Array.isArray(promptsData) ? promptsData : []);

      // Load world assets + scene images
      const [sbRes, csRes, esRes, imgRes] = await Promise.all([
        supabase.from('world_style_bibles').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('character_sheets').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('environment_sheets').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('scene_images').select('*').eq('project_id', id).order('scene_number', { ascending: true }),
        ]);
      if (sbRes.data) setStyleBible(sbRes.data as WorldStyleBible);
      if (csRes.data) setCharacterSheet(csRes.data as CharacterSheet);
      if (esRes.data) setEnvSheet(esRes.data as EnvironmentSheet);
      if (Array.isArray(imgRes.data)) setSceneImages(imgRes.data as SceneImage[]);

      // Load change logs
      await loadChangeLogs(proj.id);

      // Auto-generate world if arriving from Create
      if (searchParams.get('generate') === 'true' && !reportData) {
        setTimeout(() => triggerGenerateWorld(proj), 300);
      }

      // Auto-generate storyboard if world approved but no scenes
      if ((proj.world_approved || !!reportData?.approved) && !scenesData?.length) {
        setTimeout(() => triggerGenerateStoryboard(proj, reportData), 300);
      }

      // Auto-generate characters if storyboard approved but no char env
      if (proj.storyboard_approved && !charData) {
        setTimeout(() => triggerGenerateCharacters(proj, reportData), 300);
      }
    } catch (err) {
      toast.error('Failed to load project');
      navigate('/dashboard');
    } finally {
      setLoadingProject(false);
    }
  };

  const triggerGenerateWorld = async (proj: Project, seed = 1) => {
    try {
      const now = new Date().toISOString();
      const lyricsSnippet = (proj.lyrics || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900);

      const fallbackSummary = lyricsSnippet
        ? `Created locally from the song title, style, notes, and lyrics preview: ${lyricsSnippet}`
        : 'Created locally from the song title, selected style, and creator notes.';

      await supabase.from('visual_world_reports').delete().eq('project_id', proj.id);

      const { data: saved, error: saveErr } = await supabase
        .from('visual_world_reports')
        .insert({
          project_id: proj.id,
          song_summary: `BeatVision local world report for "${proj.title}". ${fallbackSummary}`,
          emotional_core:
            'The emotional core centers on pressure, survival, transformation, memory, conflict, release, and the hidden visual world inside the track.',
          main_visual_world:
            `A ${proj.selected_style || 'cinematic'} music-video world built around the song atmosphere, creator notes, and emotional arc. The visuals should feel intentional, grounded, symbolic, and ready for storyboard/image generation.`,
          color_palette:
            'deep black, muted steel, dusty amber, electric blue highlights, worn industrial gray, pale white glow, smoke-shadow contrast',
          lighting_style:
            'cinematic low-key lighting, hard rim light, glowing practicals, haze, smoke, selective highlights, dramatic contrast',
          main_characters:
            'A central protagonist shaped by the emotional weight of the song, shown through body language, environment, symbolic action, and visual transformation.',
          symbolic_objects:
            'light, shadow, broken machinery, weathered metal, reflections, sparks, smoke, doors, roads, wires, glass, rain, dust',
          key_locations:
            'emotionally charged cinematic locations shaped by the song: an opening pressure space, a transitional path, a symbolic confrontation zone, and a final transformed space',
          story_direction:
            'Start with the protagonist trapped inside pressure, reveal the world around them, build toward confrontation or release, and end with a clear visual transformation.',
          creative_match_score: seed > 1 ? 78 : 72,
          approved: false,
        })
        .select()
        .maybeSingle();

      if (saveErr) throw saveErr;
      if (!saved) throw new Error('Local world report save returned no row.');

      setWorldReport(saved as VisualWorldReport);

      const { data: updatedProject, error: projectErr } = await supabase
        .from('projects')
        .update({
          status: 'World Revealed',
          updated_at: now,
        })
        .eq('id', proj.id)
        .select()
        .maybeSingle();

      if (projectErr) {
        console.warn('[BeatVision] Project status update after local world report failed:', projectErr);
      }

      if (updatedProject) {
        setProject(updatedProject as Project);
      } else {
        setProject({ ...proj, status: 'World Revealed', updated_at: now } as Project);
      }

      toast.success(seed > 1 ? 'World regenerated locally.' : 'Visual World Report created locally.', {
        duration: 5000,
      });
    } catch (err: unknown) {
      console.error('[BeatVision] Local-first world report failed:', err);
      toast.error(err instanceof Error ? `Local world generation failed: ${err.message}` : 'Local world generation failed.');
    }
  };

  const triggerGenerateStoryboard = async (proj: Project, report: VisualWorldReport | null) => {
    if (storyGenRef.current) return;
    storyGenRef.current = true;
    setGeneratingStoryboard(true);
    try {
      const res = await supabase.functions.invoke('beatvision-generate', {
        body: {
          action: 'generate_storyboard',
          projectTitle: proj.title,
          lyrics: proj.lyrics || '',
          style: proj.selected_style,
          notes: proj.optional_notes || '',
          worldReport: report || {},
        },
      });
      if (res.error) {
        const msg = await res.error?.context?.text?.();
        throw new Error(msg || 'Failed to generate storyboard');
      }
      const scenesData: Record<string, unknown>[] = res.data?.data || [];

      // Clear old scenes
      await supabase.from('storyboard_scenes').delete().eq('project_id', proj.id);

      const toInsert = scenesData.map((s) => ({
        project_id: proj.id,
        scene_number: s.scene_number,
        timestamp_range: s.timestamp_range,
        scene_title: s.scene_title,
        visual_description: s.visual_description,
        camera_direction: s.camera_direction,
        mood: s.mood,
        location: s.location,
        lyric_moment: s.lyric_moment,
        transition_style: s.transition_style,
        approved: false,
      }));

      const { data: savedScenes, error: sErr } = await supabase
        .from('storyboard_scenes')
        .insert(toInsert)
        .select()
        .order('scene_number', { ascending: true });
      if (sErr) throw sErr;
      setScenes(Array.isArray(savedScenes) ? savedScenes : []);
    } catch (err: unknown) {
      console.error('[BeatVision] Storyboard generation failed:', err);

      try {
        const fallbackScenes = [
          {
            project_id: proj.id,
            scene_number: 1,
            timestamp_range: '0:00 - 0:20',
            scene_title: 'Opening Pressure',
            visual_description: `Open inside the emotional world of "${proj.title}", introducing the main atmosphere, setting, and symbolic tension.`,
            camera_direction: 'Slow cinematic push-in, low contrast shadows, careful environmental detail.',
            mood: 'tense, cinematic, immersive',
            location: 'primary world location',
            lyric_moment: 'intro / opening feeling',
            transition_style: 'slow dissolve',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 2,
            timestamp_range: '0:20 - 0:40',
            scene_title: 'The Protagonist Appears',
            visual_description: 'Reveal the central figure through posture, silhouette, and movement rather than exposition.',
            camera_direction: 'Medium tracking shot with shallow depth of field.',
            mood: 'focused, emotional, grounded',
            location: 'inside the main environment',
            lyric_moment: 'first verse',
            transition_style: 'match cut',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 3,
            timestamp_range: '0:40 - 1:00',
            scene_title: 'Symbols Surface',
            visual_description: 'Key objects and visual motifs begin appearing around the protagonist, hinting at the song meaning.',
            camera_direction: 'Insert shots, slow pans, close texture details.',
            mood: 'mysterious, symbolic',
            location: 'symbolic interior/exterior space',
            lyric_moment: 'verse detail',
            transition_style: 'glitch fade',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 4,
            timestamp_range: '1:00 - 1:25',
            scene_title: 'World Expands',
            visual_description: 'Pull back to show the larger world BeatVision has built around the track.',
            camera_direction: 'Wide reveal shot with atmospheric motion.',
            mood: 'expansive, cinematic',
            location: 'main world wide view',
            lyric_moment: 'pre-chorus / build',
            transition_style: 'rising light transition',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 5,
            timestamp_range: '1:25 - 1:55',
            scene_title: 'Emotional Collision',
            visual_description: 'The protagonist confronts the main emotional conflict through action, weather, movement, or environment.',
            camera_direction: 'Handheld energy mixed with dramatic closeups.',
            mood: 'intense, conflicted',
            location: 'conflict space',
            lyric_moment: 'chorus / impact',
            transition_style: 'hard cut',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 6,
            timestamp_range: '1:55 - 2:25',
            scene_title: 'Breaking Point',
            visual_description: 'The world becomes more unstable as the song reaches its strongest emotional pressure.',
            camera_direction: 'Fast cuts, push-ins, moving shadows, kinetic framing.',
            mood: 'overwhelming, dramatic',
            location: 'fractured version of the main world',
            lyric_moment: 'second build / bridge',
            transition_style: 'strobe cut',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 7,
            timestamp_range: '2:25 - 2:55',
            scene_title: 'Release',
            visual_description: 'The protagonist finds a visual release, shift, surrender, or transformation.',
            camera_direction: 'Slow motion, widening frame, symbolic light movement.',
            mood: 'transformational, cathartic',
            location: 'open or elevated space',
            lyric_moment: 'final chorus',
            transition_style: 'light bloom',
            approved: false,
          },
          {
            project_id: proj.id,
            scene_number: 8,
            timestamp_range: '2:55 - end',
            scene_title: 'Final Image',
            visual_description: 'End on a strong final frame that summarizes the song world in one memorable image.',
            camera_direction: 'Locked-off cinematic final shot, lingering atmosphere.',
            mood: 'resolved, haunting, memorable',
            location: 'final symbolic location',
            lyric_moment: 'outro',
            transition_style: 'fade to black',
            approved: false,
          },
        ];

        await supabase.from('storyboard_scenes').delete().eq('project_id', proj.id);

        const { data: savedScenes, error: fallbackErr } = await supabase
          .from('storyboard_scenes')
          .insert(fallbackScenes)
          .select()
          .order('scene_number', { ascending: true });

        if (fallbackErr) throw fallbackErr;

        setScenes(Array.isArray(savedScenes) ? savedScenes as StoryboardScene[] : []);
        toast.warning('AI storyboard failed, so BeatVision created a local fallback storyboard. You can edit it or regenerate later.');
      } catch (fallbackErr: unknown) {
        console.error('[BeatVision] Local fallback storyboard failed:', fallbackErr);
        toast.error(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to generate storyboard');
      }
    } finally {
      setGeneratingStoryboard(false);
      storyGenRef.current = false;
    }
  };

  const triggerGenerateCharacters = async (proj: Project, report: VisualWorldReport | null, seed = 1) => {
    if (charGenRef.current) return;
    charGenRef.current = true;
    setGeneratingCharacters(true);
    try {
      const res = await supabase.functions.invoke('beatvision-generate', {
        body: {
          action: 'generate_characters',
          projectTitle: proj.title,
          lyrics: proj.lyrics || '',
          style: proj.selected_style,
          notes: proj.optional_notes || '',
          worldReport: report || {},
          seed,
        },
      });
      if (res.error) {
        const msg = await res.error?.context?.text?.();
        throw new Error(msg || 'Failed to generate characters');
      }
      const charData = res.data?.data;
      if (!charData) throw new Error('No character data returned');

      // Delete old entry if exists
      if (charEnv) {
        await supabase.from('character_environments').delete().eq('project_id', proj.id);
      }

      const { data: saved, error: cErr } = await supabase
        .from('character_environments')
        .insert({
          project_id: proj.id,
          main_character: charData.main_character || null,
          supporting_character: charData.supporting_character || null,
          main_environment: charData.main_environment || null,
          visual_atmosphere: charData.visual_atmosphere || null,
          wardrobe_style: charData.wardrobe_style || null,
          world_rules: charData.world_rules || null,
          approved: false,
        })
        .select()
        .maybeSingle();
      if (cErr) throw cErr;
      if (saved) setCharEnv(saved);
    } catch (err: unknown) {
      console.error('[BeatVision] Character generation failed:', err);

      try {
        const fallbackCharacter = {
          project_id: proj.id,
          main_character: 'A central protagonist shaped by the emotional pressure of the song, visually defined by posture, movement, clothing, and symbolic contrast.',
          supporting_character: 'A secondary presence or opposing force that reflects the song conflict. This can be a person, memory, shadow, environment, machine, or spiritual counterpart.',
          main_environment: `A ${proj.selected_style || 'cinematic'} visual world built from the song title, lyrics, style, and creator notes.`,
          visual_atmosphere: 'Cinematic contrast, symbolic lighting, textured environments, emotional realism, and a clear music-video identity.',
          wardrobe_style: 'Practical, story-driven wardrobe that fits the world and helps the protagonist read clearly across scenes.',
          world_rules: 'Every visual choice should support the song emotion. Symbols should repeat with purpose. The protagonist should remain visually consistent across the storyboard.',
          approved: false,
        };

        await supabase.from('character_environments').delete().eq('project_id', proj.id);

        const { data: saved, error: fallbackErr } = await supabase
          .from('character_environments')
          .insert(fallbackCharacter)
          .select()
          .maybeSingle();

        if (fallbackErr) throw fallbackErr;

        if (saved) setCharEnv(saved as CharacterEnvironment);
        toast.warning('AI character generation failed, so BeatVision created a local fallback character/environment plan. You can edit it or regenerate later.');
      } catch (fallbackErr: unknown) {
        console.error('[BeatVision] Local fallback character generation failed:', fallbackErr);
        toast.error(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to generate characters');
      }
    } finally {
      setGeneratingCharacters(false);
      charGenRef.current = false;
    }
  };

  const handleWorldApproved = () => {
    if (!project) return;

    const approvedProject: Project = {
      ...project,
      world_approved: true,
      status: 'World Approved',
    };

    setProject(approvedProject);
    setTimeout(() => triggerGenerateStoryboard(approvedProject, worldReport), 300);
  };

  const handleStoryboardApproved = () => {
    if (!project) return;

    const approvedProject: Project = {
      ...project,
      storyboard_approved: true,
      status: 'Storyboard Approved',
    };

    setProject(approvedProject);
    setTimeout(() => triggerGenerateCharacters(approvedProject, worldReport), 300);
  };

  const handleCharactersApproved = () => {
    if (!project) return;

    const approvedProject: Project = {
      ...project,
      characters_approved: true,
      status: 'Characters Approved',
    };

    setProject(approvedProject);
  };

  // Called by any section after it logs a change — refresh logs + all section data
  const handleChangeLogged = useCallback(async () => {
    if (!id) return;
    // Reload project record first — ensures approval flags are current
    const { data: projReload } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
    if (projReload) setProject(projReload);

    // Refresh change logs
    await loadChangeLogs(id);
    // Refresh all section records to pick up updated needs_review / updated_after_approval flags
    const [reportRes, scenesRes, charRes, promptsRes] = await Promise.all([
      supabase.from('visual_world_reports').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('storyboard_scenes').select('*').eq('project_id', id).order('scene_number', { ascending: true }),
      supabase.from('character_environments').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scene_visual_prompts').select('*').eq('project_id', id).order('scene_number', { ascending: true }),
    ]);
    if (reportRes.data) setWorldReport(reportRes.data);
    if (Array.isArray(scenesRes.data)) setScenes(scenesRes.data);
    if (charRes.data) setCharEnv(charRes.data);
    if (Array.isArray(promptsRes.data)) setScenePrompts(promptsRes.data);

    // Refresh world assets and scene images
    const [sbRes, csRes, esRes, imgRes] = await Promise.all([
      supabase.from('world_style_bibles').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('character_sheets').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('environment_sheets').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scene_images').select('*').eq('project_id', id).order('scene_number', { ascending: true }),
    ]);
    if (sbRes.data) setStyleBible(sbRes.data as WorldStyleBible);
    if (csRes.data) setCharacterSheet(csRes.data as CharacterSheet);
    if (esRes.data) setEnvSheet(esRes.data as EnvironmentSheet);
    if (Array.isArray(imgRes.data)) setSceneImages(imgRes.data as SceneImage[]);
  }, [id, loadChangeLogs]);

  // ── Fix Project Status ────────────────────────────────────────────────────
  // Clears stale pending/review flags on every approved section.
  // Use when a section looks stuck after approval (beta/debug tool).
  const [fixingStatus, setFixingStatus] = useState(false);
  const [readinessBlockers, setReadinessBlockers] = useState<string[]>([]);

  const fixProjectStatus = useCallback(async () => {
    if (!id || !project) return;
    setFixingStatus(true);
    setReadinessBlockers([]);
    try {
      const now = new Date().toISOString();

      // Visual world report — if approved, clear stale flags
      if (worldReport?.approved) {
        await supabase.from('visual_world_reports')
          .update({ needs_review: false, updated_after_approval: false, updated_at: now })
          .eq('id', worldReport.id);
      }

      // All storyboard scenes that are approved
      const approvedSceneIds = scenes.filter(s => s.approved).map(s => s.id);
      if (approvedSceneIds.length > 0) {
        await supabase.from('storyboard_scenes')
          .update({ needs_review: false, updated_after_approval: false, updated_at: now })
          .in('id', approvedSceneIds);
      }

      // Characters & environment
      if (charEnv?.approved) {
        await supabase.from('character_environments')
          .update({ needs_review: false, updated_after_approval: false, updated_at: now })
          .eq('id', charEnv.id);
      }

      // Scene visual prompts — all approved ones
      const approvedPromptIds = scenePrompts.filter(p => p.approved).map(p => p.id);
      if (approvedPromptIds.length > 0) {
        await supabase.from('scene_visual_prompts')
          .update({ needs_review: false, updated_after_approval: false, updated_at: now })
          .in('id', approvedPromptIds);
      }

      // Scene images — fetch fresh from DB, clear stale flags on approved ones
      const { data: allImages } = await supabase
        .from('scene_images').select('id, approved, scene_visual_prompt_id, real_generated, manual_upload, use_placeholder_as_draft_final').eq('project_id', id);
      const freshImages = allImages || [];
      const approvedImageIds = freshImages.filter((i) => i.approved).map((i: { id: string }) => i.id);
      if (approvedImageIds.length > 0) {
        await supabase.from('scene_images')
          .update({ needs_review: false, updated_after_approval: false, generation_status: 'approved', rejected: false, updated_at: now })
          .in('id', approvedImageIds);
      }

      // Recalculate project.scene_prompts_approved from fresh prompt data
      const { data: freshPrompts } = await supabase
        .from('scene_visual_prompts').select('id, approved').eq('project_id', id);
      const fp = freshPrompts || [];
      const allPromptsApproved = fp.length > 0 && fp.every((p: { approved: boolean }) => p.approved);
      if (allPromptsApproved && !project.scene_prompts_approved) {
        await supabase.from('projects')
          .update({ scene_prompts_approved: true, updated_at: now })
          .eq('id', id);
      }

      // Recalculate (project.images_approved || hasApprovedSceneImagesForMotion): all approved prompts must have an approved image,
      // or all active scene images are approved (handles manual-upload-only workflows)
      const approvedPromptIds2 = fp.filter((p: { approved: boolean }) => p.approved).map((p: { id: string }) => p.id);
      const allPromptsCovered = approvedPromptIds2.length > 0 &&
        approvedPromptIds2.every((pid: string) =>
          freshImages.some((i) => i.scene_visual_prompt_id === pid && i.approved)
        );
      // Fallback: if no prompts exist but manual uploads are approved, allow images_approved
      const hasAnyApprovedImages = freshImages.some((i) => i.approved);
      const noPromptWorkflow = fp.length === 0 && hasAnyApprovedImages;
      if ((allPromptsCovered || noPromptWorkflow) && !(project.images_approved || hasApprovedSceneImagesForMotion)) {
        await supabase.from('projects')
          .update({ status: 'Scene Images Approved', images_approved: true, updated_at: now })
          .eq('id', id);
      }

        // Compute exact readiness blockers from current (post-fix) state
      const blockers: string[] = [];
      const freshProj = (await supabase.from('projects').select('*').eq('id', id).maybeSingle()).data || project;
      if (!freshProj.world_approved) blockers.push('Visual World Report not approved.');
      if (!freshProj.storyboard_approved) blockers.push('Storyboard not approved.');
      if (!freshProj.characters_approved) blockers.push('Characters & Environment not approved.');
      if (!freshProj.style_bible_approved) blockers.push('World Style Bible not approved.');
      if (!freshProj.character_sheet_approved) blockers.push('Character Sheet not approved.');
      if (!freshProj.environment_sheet_approved) blockers.push('Environment Sheet not approved.');
      if (!freshProj.scene_prompts_approved && fp.length > 0) blockers.push('Scene Visual Prompts not all approved.');
      if (!freshProj.images_approved) {
        if (freshImages.length === 0) {
          blockers.push('No scene images exist. Generate or upload images for each scene.');
        } else {
          const unapprovedCount = freshImages.filter((i) => !i.approved).length;
          if (unapprovedCount > 0) {
            blockers.push(`${unapprovedCount} scene image${unapprovedCount > 1 ? 's' : ''} not yet approved. Open Scene Images and approve each one.`);
          } else {
            blockers.push('Not all scene images are approved. Check each image and approve.');
          }
        }
      }
      setReadinessBlockers(blockers);

      // Refresh all section data to reflect the fix
      await handleChangeLogged();
      if (blockers.length === 0) {
        toast.success('All sections are approved and ready. No blockers found.');
      } else {
        toast.warning(`Status fixed. ${blockers.length} blocker${blockers.length > 1 ? 's' : ''} remain — see the readiness panel below.`);
      }
    } catch {
      toast.error('Failed to fix project status. Please try again.');
    } finally {
      setFixingStatus(false);
    }
  }, [id, project, worldReport, scenes, charEnv, scenePrompts, handleChangeLogged]);

  if (authLoading || loadingProject) {
  
  const approvedScenePromptCountForMotion = scenePrompts.filter((prompt: any) => Boolean(prompt.approved)).length;
  const validApprovedSceneImagesForMotion = sceneImages.filter((image: any) =>
    Boolean(
      image.approved &&
      (
        image.real_generated ||
        image.manual_upload ||
        image.use_placeholder_as_draft_final ||
        image.provider === 'manual_upload' ||
        image.provider_name === 'manual_upload' ||
        image.generation_status === 'uploaded' ||
        image.generation_status === 'manual_upload'
      ) &&
      (
        image.image_url ||
        image.use_placeholder_as_draft_final ||
        image.placeholder
      )
    )
  );

  const hasApprovedSceneImagesForMotion =
    approvedScenePromptCountForMotion > 0 &&
    validApprovedSceneImagesForMotion.length >= approvedScenePromptCountForMotion;

  const hasAnyApprovedSceneImageForMotion =
    validApprovedSceneImagesForMotion.length > 0;

  return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm">Loading your project...</span>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const allApproved = project.world_approved && project.storyboard_approved && project.characters_approved;
  const worldGenUnlocked = allApproved;
  const phase3Unlocked =
    allApproved &&
    project.style_bible_approved &&
    project.character_sheet_approved &&
    project.environment_sheet_approved &&
    project.scene_prompts_approved;

  // Also unlock Scene Images section when rows already exist in the DB
  // (e.g. seeded externally or created via a prior workflow step with awaiting_upload status)
  const sceneImagesUnlocked = phase3Unlocked || sceneImages.length > 0;


  // Preview is ready as soon as world report + storyboard are approved
  // Export is ready as soon as world report + storyboard exist

  // ── Review Changes: compute affected items across all sections ──────────────

  const affectedItems: AffectedSectionItem[] = [];

  // Helper: map a single section record into an AffectedSectionItem
  const addItem = (
    item: AffectedSectionItem,
    condition: boolean,
  ) => { if (condition) affectedItems.push(item); };

  // Visual World Report
  if (worldReport) {
    addItem({
      id: `vwr-${worldReport.id}`,
      sectionType: 'visual_world_report',
      sectionName: 'Visual World Report',
      status: worldReport.needs_review ? 'Needs Review' : 'Updated After Approval',
      whatChanged: 'The approved visual world was edited.',
      whatItMayAffect: ['Storyboard', 'Characters & Environment', 'World Style Bible', 'Character Sheet', 'Environment Sheet', 'Scene Visual Prompts', 'Scene Images'],
      lastEditedAt: worldReport.updated_at ?? null,
      canKeepUnchanged: worldReport.updated_after_approval && !worldReport.needs_review,
      onReapprove: async () => {
        await reapproveSection('visual_world_reports', worldReport.id);
        await createChangeLogEntry({
          projectId: project.id,
          sectionName: 'Visual World Report',
          sectionType: 'visual_world_report',
          sectionRecordId: worldReport.id,
          changeType: 'reapproved',
          changeSummary: 'Visual World Report reapproved from Review Changes panel.',
          affectedSections: [],
        });
        toast.success('Visual World Report reapproved.');
        await handleChangeLogged();
      },
    }, worldReport.needs_review || worldReport.updated_after_approval);
  }

  // Storyboard scenes
  scenes.filter((s) => s.needs_review || s.updated_after_approval).forEach((scene) => {
    addItem({
      id: `scene-${scene.id}`,
      sectionType: 'storyboard_scene',
      sectionName: `Storyboard — Scene ${scene.scene_number}${scene.scene_title ? ': ' + scene.scene_title : ''}`,
      status: scene.needs_review ? 'Needs Review' : 'Updated After Approval',
      whatChanged: 'This storyboard scene was edited after approval.',
      whatItMayAffect: ['Scene Visual Prompts', 'Scene Images'],
      lastEditedAt: scene.updated_at ?? null,
      canKeepUnchanged: scene.updated_after_approval && !scene.needs_review,
      onReapprove: async () => {
        await reapproveSection('storyboard_scenes', scene.id);
        await createChangeLogEntry({
          projectId: project.id,
          sectionName: `Storyboard Scene ${scene.scene_number}`,
          sectionType: 'storyboard_scene',
          sectionRecordId: scene.id,
          changeType: 'reapproved',
          changeSummary: `Scene ${scene.scene_number} reapproved from Review Changes panel.`,
          affectedSections: [],
        });
        toast.success(`Scene ${scene.scene_number} reapproved.`);
        await handleChangeLogged();
      },
    }, true);
  });

  // Characters & Environment
  if (charEnv && (charEnv.needs_review || charEnv.updated_after_approval)) {
    addItem({
      id: `charenv-${charEnv.id}`,
      sectionType: 'character_environment',
      sectionName: 'Characters & Environment',
      status: charEnv.needs_review ? 'Needs Review' : 'Updated After Approval',
      whatChanged: 'Characters and environment were edited after approval.',
      whatItMayAffect: ['Character Sheet', 'Scene Images'],
      lastEditedAt: charEnv.updated_at ?? null,
      canKeepUnchanged: charEnv.updated_after_approval && !charEnv.needs_review,
      onReapprove: async () => {
        await reapproveSection('character_environments', charEnv.id);
        await createChangeLogEntry({
          projectId: project.id,
          sectionName: 'Characters & Environment',
          sectionType: 'character_environment',
          sectionRecordId: charEnv.id,
          changeType: 'reapproved',
          changeSummary: 'Characters & Environment reapproved from Review Changes panel.',
          affectedSections: [],
        });
        toast.success('Characters & Environment reapproved.');
        await handleChangeLogged();
      },
    }, true);
  }

  // Scene visual prompts (individual)
  scenePrompts.filter((p) => p.needs_review || p.updated_after_approval).forEach((prompt) => {
    addItem({
      id: `svp-${prompt.id}`,
      sectionType: 'scene_visual_prompt',
      sectionName: `Scene Prompt — Scene ${prompt.scene_number}${prompt.scene_title ? ': ' + prompt.scene_title : ''}`,
      status: prompt.needs_review ? 'Needs Review' : 'Updated After Approval',
      whatChanged: 'This scene prompt was edited after approval.',
      whatItMayAffect: ['Scene Image'],
      lastEditedAt: prompt.updated_at ?? null,
      canKeepUnchanged: prompt.updated_after_approval && !prompt.needs_review,
      onReapprove: async () => {
        await reapproveSection('scene_visual_prompts', prompt.id);
        await createChangeLogEntry({
          projectId: project.id,
          sectionName: `Scene Prompt ${prompt.scene_number}`,
          sectionType: 'scene_visual_prompt',
          sectionRecordId: prompt.id,
          changeType: 'reapproved',
          changeSummary: `Scene Prompt ${prompt.scene_number} reapproved from Review Changes panel.`,
          affectedSections: [],
        });
        toast.success(`Scene Prompt ${prompt.scene_number} reapproved.`);
        await handleChangeLogged();
      },
    }, true);
  });

  const hasChanges = affectedItems.length > 0;
  const totalNeedsReview = affectedItems.filter((i) => i.status === 'Needs Review').length;
  const totalUpdated = affectedItems.filter((i) => i.status === 'Updated After Approval').length;
  // Count all approved sections across the project
  const totalApproved = [
    project.world_approved,
    project.storyboard_approved,
    project.characters_approved,
    project.style_bible_approved,
    project.character_sheet_approved,
    project.environment_sheet_approved,
    project.scene_prompts_approved,
  ].filter(Boolean).length;

  const creatorChoseKeep = affectedItems.some((i) => i.status === 'Updated After Approval' && i.canKeepUnchanged);
  const isReadyToContinue = hasChanges && totalNeedsReview === 0;

  const handleMarkViewed = (itemId: string) => {
    setViewedIds((prev) => new Set([...prev, itemId]));
  };

  const handleReviewAll = () => {
    setViewedIds(new Set(affectedItems.map((i) => i.id)));
    toast.info('All changed sections marked as reviewed.');
  };

  const handleReapproveAll = async () => {
    if (!affectedItems.every((i) => viewedIds.has(i.id))) return;
    try {
      await Promise.all(affectedItems.map((item) => item.onReapprove?.()));
      toast.success('All changed sections reapproved. BeatVision is ready to continue.');
    } catch {
      toast.error('Some sections could not be reapproved. Please try individually.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="pt-20 pb-16 px-4 max-w-4xl mx-auto">
        {/* Back + Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-balance leading-tight">
                {project.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5" />
                  <span className="truncate max-w-48">{project.song_file_name || 'No audio file'}</span>
                </div>
                <span className="text-border">·</span>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{project.selected_style}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge className={`border ${STATUS_COLORS[project.status] || STATUS_COLORS['Draft']}`}>
                {project.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-1">
          {[
            {
              label: 'World',
              done: project.world_approved,
              changed: worldReport?.updated_after_approval || worldReport?.needs_review,
            },
            {
              label: 'Storyboard',
              done: project.storyboard_approved,
              changed: scenes.some((s) => s.updated_after_approval || s.needs_review),
            },
            {
              label: 'Characters',
              done: project.characters_approved,
              changed: charEnv?.updated_after_approval || charEnv?.needs_review,
            },
            {
              label: 'Visual Assets',
              done: project.style_bible_approved && project.character_sheet_approved && project.environment_sheet_approved && project.scene_prompts_approved,
              changed: scenePrompts.some((p) => p.updated_after_approval || p.needs_review),
            },
            { label: 'Scene Images', done: !!(project.images_approved || hasApprovedSceneImagesForMotion), changed: false },
            {
              label: 'Motion',
              done: ['Motion Settings Ready', 'Motion Plan Ready', 'Motion Clips In Review', 'Motion Clips Approved', 'Preview Render Ready', 'Final Video Rendered'].includes(project.status ?? ''),
              changed: false,
            },
            {
              label: 'Video Ready',
              done: project.status === 'Final Video Rendered',
              changed: false,
            },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                step.changed
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                  : step.done
                  ? 'bg-green-500/15 text-green-400 border-green-500/30'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>
                {step.done && !step.changed && <span>✓</span>}
                {step.changed && <span>~</span>}
                {step.label}
              </div>
              {i < arr.length - 1 && <div className="w-6 h-px bg-border shrink-0" />}
            </div>
          ))}
        </div>


        {/* Fix Project Status — beta/debug tool */}
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={fixProjectStatus}
            disabled={fixingStatus}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors disabled:opacity-50"
          >
            {fixingStatus
              ? <><Loader2 className="w-3 h-3 animate-spin" />Fixing…</>
              : <>Recalculate Project Readiness</>}
          </button>
          <span className="ml-2 text-[9px] text-muted-foreground/25">Clears stale flags · recomputes approval status · shows exact blockers.</span>
        </div>

        {/* Readiness blockers panel — shows only after Recalculate is run */}
        {readinessBlockers.length > 0 && (
          <div
            className="mb-4 rounded-xl p-4 space-y-2"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)' }}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-red-400 mb-1">Readiness Blockers</p>
            {readinessBlockers.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5 shrink-0">•</span>
                <span className="text-xs text-red-300/80">{b}</span>
              </div>
            ))}
          </div>
        )}
        {!fixingStatus && (sceneImages.length > 0 || project.images_approved || hasApprovedSceneImagesForMotion || hasAnyApprovedSceneImageForMotion) && (
          <div
            className="mb-4 rounded-xl px-4 py-2 flex items-center gap-2"
            style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}
          >
            <span className="text-emerald-400 text-xs">✓</span>
            <span className="text-[11px] text-emerald-400/70">All required sections approved. No blockers.</span>
          </div>
        )}

        {/* ── Review Changes Panel ─────────────────────────────────────── */}
        {hasChanges && (
          <div className="space-y-4 mb-10">
            <ReviewStatusCard
              totalApproved={totalApproved}
              totalUpdatedAfterApproval={totalUpdated}
              totalNeedsReview={totalNeedsReview}
              isReadyToContinue={isReadyToContinue}
              creatorChoseKeep={creatorChoseKeep}
            />
            <ReviewChangesPanel
              items={affectedItems}
              viewedIds={viewedIds}
              onMarkViewed={handleMarkViewed}
              onReviewAll={handleReviewAll}
              onReapproveAll={handleReapproveAll}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="space-y-12">
          {/* Visual World Report */}
          <section className="reveal-animation">
            <VisualWorldReportSection
              report={worldReport}
              project={project}
              generating={generatingWorld}
              onRegenerate={() => triggerGenerateWorld(project, Date.now())}
              onApproved={handleWorldApproved}
              onReportUpdate={setWorldReport}
              onChangeLogged={handleChangeLogged}
            />
          </section>

          {/* Storyboard */}
          {project.world_approved ? (
            <section className="section-unlock">
              <StoryboardSection
                scenes={scenes}
                project={project}
                worldReport={worldReport}
                generating={generatingStoryboard}
                onApprovedAll={handleStoryboardApproved}
                onScenesUpdate={setScenes}
                onChangeLogged={handleChangeLogged}
              />
            </section>
          ) : (
            <LockedSection
              title="Storyboard"
              message="Approve your Visual World Report to unlock the storyboard."
              icon={<Clapperboard className="w-5 h-5 text-muted-foreground/50" />}
            />
          )}

          {/* Characters and Environment */}
          {project.storyboard_approved ? (
            <section className="section-unlock">
              <CharacterEnvironmentSection
                charEnv={charEnv}
                project={project}
                generating={generatingCharacters}
                onRegenerate={() => triggerGenerateCharacters(project, worldReport, Date.now())}
                onApproved={handleCharactersApproved}
                onCharEnvUpdate={setCharEnv}
                onChangeLogged={handleChangeLogged}
              />
            </section>
          ) : (
            <LockedSection
              title="Characters & Environment"
              message="Approve your storyboard to unlock characters and environment."
              icon={<Lock className="w-5 h-5 text-muted-foreground/50" />}
            />
          )}

          {/* Generate the World — Phase 2 */}
          {worldGenUnlocked ? (
            <section className="section-unlock space-y-3">
              {/* Section heading */}
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(59,126,255,0.15)', border: '1px solid rgba(59,126,255,0.3)' }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: '#3b7eff' }} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-foreground">Generate the World</h2>
                  <p className="text-xs text-muted-foreground">Style bible · Character sheet · Environment sheet · Scene prompts</p>
                </div>
              </div>
              <GenerateWorldSection
                project={project}
                worldReport={worldReport}
                scenes={scenes}
                charEnv={charEnv}
                onProjectUpdate={(updated) => {
                  setProject(updated);
                  // Refresh scene prompts when world assets are generated/approved
                  if (id) {
                    supabase
                      .from('scene_visual_prompts')
                      .select('*')
                      .eq('project_id', id)
                      .order('scene_number', { ascending: true })
                      .then(({ data }) => setScenePrompts(Array.isArray(data) ? data : []));
                  }
                }}
                onChangeLogged={handleChangeLogged}
              />
            </section>
          ) : (
            <LockedSection
              title="Generate the World"
              message="Approve your world, storyboard, and characters to unlock visual world generation."
              icon={<Sparkles className="w-5 h-5 text-muted-foreground/50" />}
            />
          )}

          {/* Image Provider Settings — Phase 3+ (shown BEFORE Generate Scene Images) */}
          {sceneImagesUnlocked && (
            <section className="section-unlock space-y-3">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <Settings2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-foreground">Image Provider Settings</h2>
                  <p className="text-xs text-muted-foreground">
                    Credit-Safe Mode · Real AI providers disabled by default · Manual upload always available
                  </p>
                </div>
              </div>
              <ImageProviderSettingsSection
                project={project}
                onProvidersEnabledChange={(enabled) => setRealProvidersEnabled(enabled)}
                onSettingsSaved={(s) => {
                  setRealProvidersEnabled(s.real_ai_providers_enabled);
                  const isActive = s.real_ai_providers_enabled &&
                    s.enabled &&
                    s.provider_name !== 'Manual Upload Only' &&
                    s.provider_name !== 'Disabled';
                  setProviderActive(isActive);
                  setProviderName(s.provider_name);
                  setProviderEndpoint(s.api_endpoint ?? null);
                }}
              />
            </section>
          )}

          {/* Generate Scene Images — Phase 3 / manual upload unlock */}
          {sceneImagesUnlocked ? (
            <section className="section-unlock space-y-3">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(59,126,255,0.12)', border: '1px solid rgba(59,126,255,0.25)' }}
                >
                  <ImageIcon className="w-4 h-4" style={{ color: '#3b7eff' }} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-foreground">Scene Images</h2>
                  <p className="text-xs text-muted-foreground">
                    Upload an image per scene · Approve each one · Clean-core visual workflow
                  </p>
                </div>
              </div>
              <GenerateSceneImagesSection
                project={project}
                prompts={scenePrompts}
                realProvidersEnabled={realProvidersEnabled}
                providerActive={providerActive}
                providerName={providerName}
                providerEndpoint={providerEndpoint}
                onProjectUpdate={(updated) => setProject(p => p ? { ...p, ...updated } : p)}
                onSceneImagesUpdate={(imgs) => setSceneImages(imgs)}
              />
            </section>
          ) : (
            <LockedSection
              title="Scene Images"
              message="Approve all world assets and scene prompts to unlock scene image generation, or scenes will appear here automatically when created."
              icon={<ImageIcon className="w-5 h-5 text-muted-foreground/50" />}
            />
          )}


          {/* Project Change Log */}
          {changeLogs.length > 0 && (
            <section>
              <ProjectChangeLogSection logs={changeLogs} />
            </section>
          )}

          {/* Beta Feedback */}
          <section>
            {user && <BetaFeedbackSection project={project} userId={user.id} />}
          </section>

        </div>
      </div>


    </div>
  );
}

function LockedSection({ title, message, icon }: { title: string; message: string; icon: React.ReactNode }) {
  return (
    <Card className="bg-card/40 border-border/50">
      <CardContent className="p-6 flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="font-semibold text-muted-foreground/70 mb-0.5">{title}</h2>
          <p className="text-xs text-muted-foreground/50">{message}</p>
        </div>
        <Lock className="w-4 h-4 text-muted-foreground/30 ml-auto shrink-0" />
      </CardContent>
    </Card>
  );
}
