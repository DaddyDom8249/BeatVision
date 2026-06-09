
-- Add all missing project_status enum values that the application code writes.
-- PostgreSQL only supports appending to enums; existing values are preserved.
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'World Revealed';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Characters Approved';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Generating World Assets';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'World Assets Approved';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Generating Scene Images';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Scene Images In Review';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Scene Images Approved';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Ready for Motion';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Ready for Image Generation';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Ready for Video Generation';
