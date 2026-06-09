import { useState } from 'react';
import { Settings, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type {
  Project, MotionSettings, StoryboardScene, SceneImage, SceneMotionPlan,
} from '@/types/types';
import {
  MOTION_STYLES, TRANSITION_STYLES, CAPTION_STYLES, VIDEO_FORMATS, VIDEO_QUALITIES,
} from '@/types/types';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

interface Props {
  project: Project;
  scenes: StoryboardScene[];
  sceneImages: SceneImage[];
  existing: MotionSettings | null;
  onSaved: (ms: MotionSettings) => void;
  onPlansRefreshed: (plans: SceneMotionPlan[]) => void;
  onProjectUpdate: (p: Partial<Project>) => void;
}

const DEFAULT_MOTION_EFFECT_MAP: Record<string, string> = {
  'Cinematic Slow Push': 'Slow Zoom In',
  'Beat-Synced Cuts': 'Beat Pulse',
  'Handheld Energy': 'Subtle Shake',
  'Dreamlike Drift': 'Parallax Drift',
  'Glitch / Cyberpunk': 'Glitch Flicker',
  'Hard Rock Impact': 'Flash Impact',
  'Emotional Slow Motion': 'Slow Zoom Out',
  'Custom': 'Still Frame',
};

function buildMotionPlanRecords(
  projectId: string,
  scenes: StoryboardScene[],
  sceneImages: SceneImage[],
  ms: MotionSettings,
) {
  const defaultEffect = DEFAULT_MOTION_EFFECT_MAP[ms.motion_style] ?? 'Slow Zoom In';
  return scenes
    .filter((s) => s.approved)
    .map((s) => {
      const img = sceneImages.find(
        (i) => (i.storyboard_scene_id === s.id || i.scene_number === s.scene_number) && i.approved
      );
      return {
        project_id: projectId,
        storyboard_scene_id: s.id,
        scene_image_id: img?.id ?? null,
        scene_number: s.scene_number,
        scene_title: s.scene_title ?? null,
        timestamp_range: s.timestamp_range ?? null,
        duration: 4.0,
        motion_effect: defaultEffect,
        transition_in: ms.transition_style,
        transition_out: ms.transition_style,
        caption_text: ms.caption_style === 'No Captions' ? null : (s.lyric_moment ?? s.scene_title ?? null),
        lyric_moment: s.lyric_moment ?? null,
        include_in_final_video: true,
        approved: false,
        status: 'not_generated' as const,
      };
    });
}

export default function MotionStyleSettings({ project, scenes, sceneImages, existing, onSaved, onPlansRefreshed, onProjectUpdate }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    motion_style: existing?.motion_style ?? 'Cinematic Slow Push',
    transition_style: existing?.transition_style ?? 'Fade',
    caption_style: existing?.caption_style ?? 'No Captions',
    video_format: existing?.video_format ?? '16:9 Landscape',
    video_quality: existing?.video_quality ?? 'Standard 720p',
    add_beat_camera_movement: existing?.add_beat_camera_movement ?? false,
    add_zoom_pan: existing?.add_zoom_pan ?? true,
    add_cinematic_grain: existing?.add_cinematic_grain ?? false,
    add_scene_title_cards: existing?.add_scene_title_cards ?? false,
    add_lyric_captions: existing?.add_lyric_captions ?? false,
    add_transition_effects: existing?.add_transition_effects ?? true,
    keep_motion_gentle: existing?.keep_motion_gentle ?? false,
    make_motion_intense: existing?.make_motion_intense ?? false,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      let ms: MotionSettings;

      if (existing) {
        const { data, error } = await supabase
          .from('motion_settings')
          .update({ ...form, approved: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        if (error) throw error;
        ms = data as MotionSettings;
      } else {
        const { data, error } = await supabase
          .from('motion_settings')
          .insert({ project_id: project.id, ...form, approved: true })
          .select()
          .maybeSingle();
        if (error) throw error;
        ms = data as MotionSettings;
      }

      // Upsert scene motion plans — delete old then insert fresh
      const plans = buildMotionPlanRecords(project.id, scenes, sceneImages, ms);
      if (plans.length > 0) {
        await supabase.from('scene_motion_plans').delete().eq('project_id', project.id);
        const { error: insertErr } = await supabase.from('scene_motion_plans').insert(plans);
        if (insertErr) throw new Error(`Failed to create motion plans: ${insertErr.message}`);
      }

      // Re-fetch the freshly created plans so React state gets the real IDs
      const { data: freshPlans, error: fetchErr } = await supabase
        .from('scene_motion_plans')
        .select('*')
        .eq('project_id', project.id)
        .order('scene_number', { ascending: true });
      if (fetchErr) throw new Error(`Failed to load motion plans: ${fetchErr.message}`);
      onPlansRefreshed(Array.isArray(freshPlans) ? (freshPlans as SceneMotionPlan[]) : []);

      // Update project status
      await supabase
        .from('projects')
        .update({ status: 'Motion Settings Ready' })
        .eq('id', project.id);
      onProjectUpdate({ status: 'Motion Settings Ready' });
      onSaved(ms);
      toast.success('Motion settings saved! Motion timeline generated.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save motion settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-4 h-4 text-blue-400" />
        <p className="text-xs font-mono text-muted-foreground/60 uppercase tracking-widest">
          Motion Style Settings
        </p>
      </div>

      {/* Dropdowns grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectField label="Motion Style" value={form.motion_style} onChange={(v) => set('motion_style', v)} options={MOTION_STYLES as unknown as readonly string[]} />
        <SelectField label="Transition Style" value={form.transition_style} onChange={(v) => set('transition_style', v)} options={TRANSITION_STYLES as unknown as readonly string[]} />
        <SelectField label="Caption Style" value={form.caption_style} onChange={(v) => set('caption_style', v)} options={CAPTION_STYLES as unknown as readonly string[]} />
        <SelectField label="Video Format" value={form.video_format} onChange={(v) => set('video_format', v)} options={VIDEO_FORMATS as unknown as readonly string[]} />
        <SelectField label="Video Quality" value={form.video_quality} onChange={(v) => set('video_quality', v)} options={VIDEO_QUALITIES as unknown as readonly string[]} />
      </div>

      {/* Toggles */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">
          Motion Options
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            ['add_beat_camera_movement', 'Add beat-style camera movement'],
            ['add_zoom_pan', 'Add subtle zoom and pan'],
            ['add_cinematic_grain', 'Add cinematic grain'],
            ['add_scene_title_cards', 'Add scene title cards'],
            ['add_lyric_captions', 'Add lyric captions'],
            ['add_transition_effects', 'Add transition effects'],
            ['keep_motion_gentle', 'Keep motion gentle'],
            ['make_motion_intense', 'Make motion intense'],
          ] as [keyof typeof form, string][]).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label className="text-sm text-foreground/80 cursor-pointer" htmlFor={key}>
                {label}
              </Label>
              <Switch
                id={key}
                checked={form[key] as boolean}
                onCheckedChange={(v) => set(key, v as (typeof form)[typeof key])}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 font-bold"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.20) 0%, rgba(6,182,212,0.20) 100%)',
          border: '1px solid rgba(16,185,129,0.40)',
          color: '#6ee7b7',
        }}
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
        ) : (
          <><Save className="w-4 h-4 mr-2" />Save Motion Settings</>
        )}
      </Button>
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wide">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className="h-10 text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
