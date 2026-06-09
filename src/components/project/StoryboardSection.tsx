import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { StoryboardScene, Project, VisualWorldReport } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, Film, Save, X, Clock,
  Camera, Zap, MapPin, Music, Layers, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import AfterEditChoiceDialog from '@/components/project/AfterEditChoiceDialog';
import {
  DOWNSTREAM_DEPS,
  createChangeLogEntry,
  reapproveSection,
} from '@/hooks/useReviewChanges';
import { ReviewStatusBadge } from '@/components/project/ReviewChangesPanel';
import type { ReviewSectionStatus } from '@/components/project/ReviewChangesPanel';

interface Props {
  scenes: StoryboardScene[];
  project: Project;
  worldReport: VisualWorldReport | null;
  generating: boolean;
  onApprovedAll: () => void;
  onScenesUpdate: (scenes: StoryboardScene[]) => void;
  onChangeLogged?: () => void;
}

export default function StoryboardSection({ scenes, project, worldReport, generating, onApprovedAll, onScenesUpdate, onChangeLogged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<StoryboardScene>>({});
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [choiceDialog, setChoiceDialog] = useState<{ scene: StoryboardScene; data: Partial<StoryboardScene> } | null>(null);

  const handleApproveScene = async (scene: StoryboardScene) => {
    setApprovingId(scene.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('storyboard_scenes')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', scene.id);
      if (error) throw error;
      onScenesUpdate(scenes.map((s) => s.id === scene.id ? { ...s, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now } : s));
    } catch {
      toast.error('Failed to approve scene');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRefreshScene = async (scene: StoryboardScene) => {
    setRefreshingId(scene.id);
    try {
      const res = await supabase.functions.invoke('beatvision-generate', {
        body: {
          action: 'refresh_scene',
          projectTitle: project.title,
          lyrics: project.lyrics || '',
          style: project.selected_style,
          notes: project.optional_notes || '',
          sceneNumber: scene.scene_number,
          existingScene: scene,
          worldReport: worldReport || {},
          seed: Date.now(),
        },
      });
      if (res.error) {
        const msg = await res.error?.context?.text?.();
        throw new Error(msg || 'Failed to refresh scene');
      }
      const newSceneData = res.data?.data;
      if (!newSceneData) throw new Error('No scene data returned');

      const wasApproved = scene.approved;
      const { data: updated, error: updateErr } = await supabase
        .from('storyboard_scenes')
        .update({
          scene_title: newSceneData.scene_title,
          visual_description: newSceneData.visual_description,
          camera_direction: newSceneData.camera_direction,
          mood: newSceneData.mood,
          location: newSceneData.location,
          lyric_moment: newSceneData.lyric_moment,
          transition_style: newSceneData.transition_style,
          approved: false,
          updated_after_approval: wasApproved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scene.id)
        .select()
        .maybeSingle();
      if (updateErr) throw updateErr;
      if (updated) {
        onScenesUpdate(scenes.map((s) => s.id === scene.id ? updated : s));
        if (wasApproved) {
          await createChangeLogEntry({
            projectId: project.id,
            sectionName: `Scene ${scene.scene_number}: ${scene.scene_title || ''}`,
            sectionType: 'storyboard_scene',
            sectionRecordId: scene.id,
            changeType: 'regenerated_after_approval',
            changeSummary: `Scene ${scene.scene_number} was regenerated after approval.`,
            affectedSections: DOWNSTREAM_DEPS['storyboard_scene'],
            userChoice: undefined,
          });
          onChangeLogged?.();
        }
      }
      toast.success('Scene refreshed.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh scene');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleEditScene = (scene: StoryboardScene) => {
    setEditData({ ...scene });
    setEditingId(scene.id);
  };

  const handleSaveEdit = async (scene: StoryboardScene) => {
    if (scene.approved) {
      setChoiceDialog({ scene, data: editData });
      return;
    }
    await performSave(scene, editData, false);
  };

  const performSave = async (scene: StoryboardScene, data: Partial<StoryboardScene>, updatedAfterApproval: boolean) => {
    setSavingId(scene.id);
    try {
      const { data: saved, error } = await supabase
        .from('storyboard_scenes')
        .update({ ...data, updated_after_approval: updatedAfterApproval, updated_at: new Date().toISOString() })
        .eq('id', scene.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onScenesUpdate(scenes.map((s) => s.id === scene.id ? saved : s));
      setEditingId(null);
      toast.success('Scene updated.');
    } catch {
      toast.error('Failed to save scene');
    } finally {
      setSavingId(null);
    }
  };

  const handleMarkDownstream = async () => {
    if (!choiceDialog) return;
    const { scene, data } = choiceDialog;
    setChoiceDialog(null);
    await performSave(scene, data, true);
    // Mark scene images and prompts as needs_review
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('scene_visual_prompts').update({ needs_review: true, updated_at: now }).eq('project_id', project.id),
      supabase.from('scene_images').update({ needs_review: true, updated_at: now }).eq('project_id', project.id),
    ]);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: `Scene ${scene.scene_number}: ${scene.scene_title || ''}`,
      sectionType: 'storyboard_scene',
      sectionRecordId: scene.id,
      changeType: 'marked_downstream_needs_review',
      changeSummary: `Scene ${scene.scene_number} edited after approval. Scene prompts and images marked for review.`,
      affectedSections: DOWNSTREAM_DEPS['storyboard_scene'],
      userChoice: 'Mark affected sections as Needs Review',
    });
    onChangeLogged?.();
    toast.success('Scene updated. Affected sections marked for review.');
  };

  const handleKeepUnchanged = async () => {
    if (!choiceDialog) return;
    const { scene, data } = choiceDialog;
    setChoiceDialog(null);
    await performSave(scene, data, true);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: `Scene ${scene.scene_number}: ${scene.scene_title || ''}`,
      sectionType: 'storyboard_scene',
      sectionRecordId: scene.id,
      changeType: 'kept_later_sections_unchanged',
      changeSummary: `Scene ${scene.scene_number} edited after approval. Creator chose to keep later sections unchanged.`,
      affectedSections: DOWNSTREAM_DEPS['storyboard_scene'],
      userChoice: 'Keep later sections unchanged',
    });
    onChangeLogged?.();
    toast.success('Scene updated. Later sections kept unchanged.');
  };

  const handleReapproveScene = async (scene: StoryboardScene) => {
    try {
      await reapproveSection('storyboard_scenes', scene.id);
      const now = new Date().toISOString();
      onScenesUpdate(scenes.map((s) => s.id === scene.id ? { ...s, needs_review: false, updated_after_approval: false, last_approved_at: now } : s));
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: `Scene ${scene.scene_number}: ${scene.scene_title || ''}`,
        sectionType: 'storyboard_scene',
        sectionRecordId: scene.id,
        changeType: 'reapproved',
        changeSummary: `Scene ${scene.scene_number} reapproved.`,
        affectedSections: [],
      });
      onChangeLogged?.();
      toast.success(`Scene ${scene.scene_number} reapproved.`);
    } catch {
      toast.error('Failed to reapprove scene');
    }
  };

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const now = new Date().toISOString();
      const { error: sError } = await supabase
        .from('storyboard_scenes')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now })
        .eq('project_id', project.id);
      if (sError) throw sError;

      const { error: pError } = await supabase
        .from('projects')
        .update({ storyboard_approved: true, status: 'Storyboard Approved', updated_at: now })
        .eq('id', project.id);
      if (pError) throw pError;

      onScenesUpdate(scenes.map((s) => ({ ...s, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now })));
      onApprovedAll();
      toast.success('Storyboard approved! Characters and environment are now unlocked.');
    } catch {
      toast.error('Failed to approve storyboard');
    } finally {
      setApprovingAll(false);
    }
  };

  const getSceneReviewStatus = (scene: StoryboardScene): ReviewSectionStatus | null => {
    if (scene.needs_review) return 'Needs Review';
    if (scene.updated_after_approval) return 'Updated After Approval';
    if (scene.approved) return 'Approved';
    return null;
  };

  return (
    <div className="space-y-5">
      {choiceDialog && (
        <AfterEditChoiceDialog
          open
          sectionType="storyboard_scene"
          sectionName={`Scene ${choiceDialog.scene.scene_number}`}
          onMarkDownstream={handleMarkDownstream}
          onKeepUnchanged={handleKeepUnchanged}
          onClose={() => setChoiceDialog(null)}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <Film className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-foreground">Storyboard</h2>
            <p className="text-xs text-muted-foreground">{scenes.length} scenes generated</p>
          </div>
          {project.storyboard_approved && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
            </Badge>
          )}
        </div>
        {!project.storyboard_approved && scenes.length > 0 && !generating && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 shrink-0"
            onClick={handleApproveAll}
            disabled={approvingAll}
          >
            {approvingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
            Approve Storyboard
          </Button>
        )}
      </div>

      {generating ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-4 w-24 bg-muted" />
                <Skeleton className="h-16 w-full bg-muted" />
                <Skeleton className="h-4 w-40 bg-muted" />
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Generating your storyboard scenes...
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {scenes.map((scene) => {
            const isEditing = editingId === scene.id;
            const isRefreshing = refreshingId === scene.id;
            const isApproving = approvingId === scene.id;
            const isSaving = savingId === scene.id;
            const reviewStatus = getSceneReviewStatus(scene);

            return (
              <Card key={scene.id} className={`bg-card border transition-colors h-full ${scene.approved ? 'border-green-500/30' : 'border-border'}`}>
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{scene.scene_number}</span>
                      </div>
                      <div className="min-w-0">
                        {isEditing ? (
                          <Input
                            value={(editData.scene_title as string) || ''}
                            onChange={(e) => setEditData((p) => ({ ...p, scene_title: e.target.value }))}
                            className="bg-secondary border-border text-foreground h-8 text-sm"
                          />
                        ) : (
                          <CardTitle className="text-sm font-semibold text-foreground text-balance truncate">
                            {scene.scene_title}
                          </CardTitle>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{scene.timestamp_range}</span>
                          {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      {scene.approved && !scene.needs_review && !scene.updated_after_approval && (
                        <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                        </Badge>
                      )}
                      {/* Always show edit buttons (persistent edit) */}
                      {isEditing ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground border border-border" onClick={() => setEditingId(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                          <Button size="sm" className="h-7 px-2 bg-primary text-primary-foreground" onClick={() => handleSaveEdit(scene)} disabled={isSaving}>
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground border border-border" onClick={() => handleRefreshScene(scene)} disabled={isRefreshing}>
                            {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground border border-border" onClick={() => handleEditScene(scene)}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          {!scene.approved && (
                            <Button size="sm" className="h-7 px-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleApproveScene(scene)} disabled={isApproving}>
                              {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                            </Button>
                          )}
                          {scene.approved && (scene.needs_review || scene.updated_after_approval) && (
                            <Button size="sm" className="h-7 px-2.5 text-xs text-white font-medium" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }} onClick={() => handleReapproveScene(scene)}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Reapprove
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {/* Inline warning */}
                  {scene.needs_review && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 border" style={{ background: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.2)' }}>
                      <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-300/80 text-pretty">This scene needs review due to upstream changes.</p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Visual Description */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Film className="w-3 h-3" /> Visual Description</p>
                    {isEditing ? (
                      <Textarea
                        value={(editData.visual_description as string) || ''}
                        onChange={(e) => setEditData((p) => ({ ...p, visual_description: e.target.value }))}
                        className="bg-secondary border-border text-foreground text-sm min-h-16 resize-y"
                      />
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed text-pretty">{scene.visual_description}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Camera className="w-3 h-3" /> Camera</p>
                      {isEditing ? (
                        <Input value={(editData.camera_direction as string) || ''} onChange={(e) => setEditData((p) => ({ ...p, camera_direction: e.target.value }))} className="bg-secondary border-border text-foreground h-8 text-xs" />
                      ) : (
                        <p className="text-xs text-foreground text-pretty">{scene.camera_direction}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Zap className="w-3 h-3" /> Mood</p>
                      {isEditing ? (
                        <Input value={(editData.mood as string) || ''} onChange={(e) => setEditData((p) => ({ ...p, mood: e.target.value }))} className="bg-secondary border-border text-foreground h-8 text-xs" />
                      ) : (
                        <p className="text-xs text-foreground">{scene.mood}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Location</p>
                      {isEditing ? (
                        <Input value={(editData.location as string) || ''} onChange={(e) => setEditData((p) => ({ ...p, location: e.target.value }))} className="bg-secondary border-border text-foreground h-8 text-xs" />
                      ) : (
                        <p className="text-xs text-foreground">{scene.location}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Music className="w-3 h-3" /> Lyric Moment</p>
                      {isEditing ? (
                        <Input value={(editData.lyric_moment as string) || ''} onChange={(e) => setEditData((p) => ({ ...p, lyric_moment: e.target.value }))} className="bg-secondary border-border text-foreground h-8 text-xs" />
                      ) : (
                        <p className="text-xs text-foreground italic">"{scene.lyric_moment}"</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Layers className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Transition:</span>
                    {isEditing ? (
                      <Input value={(editData.transition_style as string) || ''} onChange={(e) => setEditData((p) => ({ ...p, transition_style: e.target.value }))} className="bg-secondary border-border text-foreground h-7 text-xs flex-1" />
                    ) : (
                      <span className="text-xs text-foreground">{scene.transition_style}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
