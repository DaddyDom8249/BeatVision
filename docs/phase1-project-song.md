# Phase 1: Project + Song Intake

Only project creation and song intake are implemented.

- /projects/new creates public.projects.
- /projects/:projectId/song reads and writes public.songs.
- Audio files are stored privately in the Supabase Storage audio bucket.
- RLS limits projects, songs, and audio objects to their authenticated owner.
- The database is authoritative; browser state is form state only.
- No World, Style, Storyboard, generation, or later-stage functionality is implemented.
