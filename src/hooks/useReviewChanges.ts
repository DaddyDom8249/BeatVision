import { supabase } from '@/db/supabase';
import type { ChangeType, ProjectChangeLog } from '@/types/types';

// Downstream dependency map: editing key X affects these sections
export const DOWNSTREAM_DEPS: Record<string, string[]> = {
  visual_world_report: [
    'Storyboard',
    'Characters & Environment',
    'World Style Bible',
    'Character Sheet',
    'Environment Sheet',
    'Scene Visual Prompts',
    'Scene Images',
  ],
  storyboard: ['Scene Visual Prompts', 'Scene Images'],
  storyboard_scene: ['Scene Visual Prompts', 'Scene Images'],
  character_environment: ['Character Sheet', 'Scene Images'],
  world_style_bible: ['Scene Images'],
  character_sheet: ['Scene Images'],
  environment_sheet: ['Scene Images'],
  scene_visual_prompt: ['Scene Image'],
  scene_image: [],
};

export const SECTION_WARNINGS: Record<string, string> = {
  visual_world_report:
    'You changed the approved world. This may affect the storyboard, characters, style bible, scene prompts, and generated images.',
  storyboard:
    'You changed the storyboard. This may affect scene prompts and generated scene images.',
  storyboard_scene:
    'You changed this storyboard scene. This may affect its scene prompt and generated image.',
  character_environment:
    'You changed the characters and environment. This may affect the character sheet and generated scene images.',
  world_style_bible:
    'You changed the style bible. This may affect generated scene images.',
  character_sheet:
    'You changed the character design. This may affect generated scene images.',
  environment_sheet:
    'You changed the environment design. This may affect generated scene images.',
  scene_visual_prompt:
    'You changed this scene prompt. This may affect only this scene\'s image.',
  scene_image: 'You changed this scene image.',
};

export interface CreateChangeLogOptions {
  projectId: string;
  sectionName: string;
  sectionType: string;
  sectionRecordId?: string;
  changeType: ChangeType;
  changeSummary?: string;
  affectedSections?: string[];
  userChoice?: string;
}

export async function createChangeLogEntry(opts: CreateChangeLogOptions): Promise<ProjectChangeLog | null> {
  const { data, error } = await supabase
    .from('project_change_log')
    .insert({
      project_id: opts.projectId,
      section_name: opts.sectionName,
      section_type: opts.sectionType,
      section_record_id: opts.sectionRecordId || null,
      change_type: opts.changeType,
      change_summary: opts.changeSummary || null,
      affected_sections: opts.affectedSections || [],
      user_choice: opts.userChoice || null,
      review_status: 'pending',
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to create change log entry:', error.message);
    return null;
  }
  return data as ProjectChangeLog | null;
}

// Mark a record's section as updated_after_approval
export async function markUpdatedAfterApproval(
  table: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ updated_after_approval: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error(`Failed to mark ${table} as updated_after_approval:`, error.message);
}

// Mark a section record as needs_review
export async function markNeedsReview(
  table: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ needs_review: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error(`Failed to mark ${table} as needs_review:`, error.message);
}

// Reapprove a section — clear needs_review and updated_after_approval, set last_approved_at
export async function reapproveSection(
  table: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({
      needs_review: false,
      updated_after_approval: false,
      last_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) console.error(`Failed to reapprove section in ${table}:`, error.message);
}
