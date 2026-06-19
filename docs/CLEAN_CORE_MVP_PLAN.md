# BeatVision Clean Core MVP Plan

## Goal

Strip BeatVision down to a stable approval-first creator workflow.

This branch is not for experimental motion, Kling, segmented rendering, or override panels.
Those features can return only after the core workflow is stable.

## Core workflow to keep active

1. Create Project
2. Generate Visual World Report
3. Approve Visual World Report
4. Generate Storyboard
5. Approve Storyboard
6. Generate Characters and Environment
7. Approve Characters and Environment
8. Generate World Assets:
   - Style Bible
   - Character Sheet
   - Environment Sheet
   - Scene Visual Prompts
9. Approve World Assets
10. Scene Images:
   - Manual upload always available
   - Provider generation optional
   - Clear disabled-provider messaging
11. Approve Scene Images
12. Static Ken Burns fallback test remains separate at:
   /ken-burns-test.html

## Keep active

- src/pages/LandingPage.tsx
- src/pages/AuthPage.tsx
- src/pages/DashboardPage.tsx
- src/pages/CreateProjectPage.tsx
- src/pages/ProjectResultsPage.tsx, simplified later
- src/components/project/VisualWorldReportSection.tsx
- src/components/project/StoryboardSection.tsx
- src/components/project/CharacterEnvironmentSection.tsx
- src/components/project/GenerateWorldSection.tsx
- src/components/project/GenerateSceneImagesSection.tsx
- src/components/project/ImageProviderSettingsSection.tsx
- src/components/project/SceneImageCard.tsx
- src/components/project/SceneImageOptionsPanel.tsx
- src/db/supabase.ts
- src/contexts/AuthContext.tsx
- src/types/types.ts
- public/ken-burns-test.html

## Quarantine from active workflow

These may remain in the repo, but should not be mounted in ProjectResultsPage until clean core is stable.

- SegmentedVideoRenderer
- SegmentImageOverridePanel
- GenerateMotionSection
- CreateMotionVideoSection
- MotionClipSection
- MotionReadinessSection
- MotionStyleSettings
- StoryboardMotionTimeline
- FinalVideoRenderSection
- VideoPreviewSection
- FullPreviewModal
- ExportProjectPanel, unless kept as simple metadata export only
- Kling submit/query sections
- Any React Ken Burns route page

## Rules

- No feature additions until clean core passes.
- No motion/video generation inside the main project page.
- No segment override panel.
- No duplicate generation paths if avoidable.
- Every approval must update child record and project flag.
- Every locked section must explain exactly what is missing.
- Provider disabled state must show manual upload path.
- Build and TypeScript must pass before every commit.

## First clean-core target

Make ProjectResultsPage show only:

- Visual World Report
- Storyboard
- Characters and Environment
- Generate World Assets
- Image Provider Settings
- Scene Images
- Beta Feedback

Hide or remove:

- top preview/export buttons
- bottom preview/export panel
- segmented video renderer
- motion sections
- final video sections
- override panel
