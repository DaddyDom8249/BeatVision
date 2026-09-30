# Phase 3: Style, Characters, Environments, and Visual Rules

Phase 3 starts only from a completed and explicitly confirmed Visual World Report.

Implemented:
- Durable Style Bible bound to the confirmed `world_report_id`.
- A preserved World Foundation copied from the confirmed report at Style Bible creation.
- Editable visual rules, continuity rules, and reference asset references.
- Character records with structured character sheets bound to the same confirmed World Report and Style Bible.
- Environment records with structured environment sheets bound to the same confirmed World Report and Style Bible.
- Character and environment visual assets stored in the private `visual-assets` bucket.
- Asset records append to history; the Phase 3 client has no asset-delete path.
- Approved assets are protected by a database delete guard.
- Database triggers reject unconfirmed World Report lineage and cross-world Style/character/environment mismatches.
- RLS and authenticated-only grants protect the Phase 3 tables.

Not implemented:
- Storyboard
- Scene image generation
- Image generation providers
- Motion
- Final video
