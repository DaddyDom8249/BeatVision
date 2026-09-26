alter table public.scene_visual_prompts add column if not exists owner_id uuid;

create index if not exists scene_visual_prompts_project_owner_idx
  on public.scene_visual_prompts(project_id, owner_id);
