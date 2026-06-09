# Requirements Document

## 1. Application Overview

**Application Name**: BeatVision

**Tagline**: Every Song Has a World. BeatVision Reveals It.

**Description**: BeatVision is an AI Music Director that helps creators upload a song, paste lyrics, choose a visual style, add optional creative notes, and reveal the visual world hidden inside the song. The beta version focuses on four phases: Phase 1 (Reveal the World), Phase 2 (World Generation), Phase 3 (Image Generation), and Phase 4 (Motion and Full Music Video Rendering). Creators can approve or edit the generated world, generate a storyboard, define characters and environment, generate world assets including style bible, character sheet, environment sheet, and scene visual prompts, generate scene-by-scene images while maintaining character consistency, world consistency, and style consistency, generate motion clips, and render a full music video. The app prepares the project for future motion and video generation. Creators can preview the complete project in one place and export project assets at any phase.

**New Feature**: Review Changes System allows creators to edit approved sections at any time. BeatVision clearly shows what changed, what might be affected, and what needs review before the project continues. Creators can always revise the project, and BeatVision helps them understand how changes affect later sections.

**Core Identity**: BeatVision is an AI Music Director, not just an AI video generator. The primary goal is to make the user feel that BeatVision understood their song before anything is generated. The main success moment is when the creator looks at the Visual World Report and says: \"Yes. That is my world.\"

**Credit-Safe Mode**: By default, Real AI Providers Enabled is set to false. No paid image or video generation APIs are called by default. All generation uses fallback, manual upload, or placeholder only. Real providers only activate when creator manually enables them.

## 2. Users and Usage Scenarios

**Target Users**: Musicians, songwriters, and creators with no AI knowledge who want to visualize the world inside their songs.

**Core Usage Scenarios**:
- Upload a song and paste lyrics to reveal the visual world hidden inside the music
- Approve or edit the generated Visual World Report
- Generate and approve a storyboard based on the approved world
- Define characters and environment before world generation
- Generate world assets: style bible, character sheet, environment sheet, scene visual prompts
- Generate scene-by-scene images from approved prompts while maintaining consistency
- Upload scene images manually or use placeholder previews
- Review and approve scene images before moving to motion
- Create video segments covering the full song duration
- Render segment previews with image-motion effects
- Render a full music video with motion, transitions, captions, and audio sync
- Edit approved sections and review changes that may affect downstream sections
- Reapprove changed sections or keep later sections unchanged
- Preview the complete project in one cinematic view
- Export project assets at any phase
- Provide beta feedback to help improve BeatVision

## 3. Page Structure and Functional Description

### Page Hierarchy

```
BeatVision
├── Landing Page
├── Dashboard Page
├── Create Project Page
└── Project Results Page
    ├── Review Changes Section
    ├── Visual World Report Section
    ├── Storyboard Section
    ├── Characters and Environment Section
    ├── Generate the World Section
    │   ├── World Style Bible Subsection
    │   ├── Character Sheet Subsection
    │   ├── Environment Sheet Subsection
    │   ├── Scene Visual Prompt Pack Subsection
    │   ├── Scene Preview Cards Subsection
    │   └── World Generation Status Progress Tracker
    ├── Image Provider Settings Section
    ├── Generate Scene Images Section
    │   ├── Image Generation Overview Subsection
    │   ├── Generate All Scene Images Subsection
    │   ├── Scene Image Cards Subsection
    │   ├── Image Review Mode Subsection
    │   ├── Consistency Controls Subsection
    │   └── Ready for Motion Subsection
    ├── Segmented Video Renderer Section
    │   ├── Full Song Coverage Subsection
    │   ├── Create Video Segments Subsection
    │   ├── Segment Rendering Subsection
    │   ├── Per-Segment Controls Subsection
    │   ├── Stitch Segments Subsection
    │   └── Blocker Panels Subsection
    ├── Create Motion Video Section
    │   ├── Motion Readiness Subsection
    │   ├── Motion Style Settings Subsection
    │   ├── Storyboard Motion Timeline Subsection
    │   ├── Motion Clip Generation Subsection
    │   ├── Full Music Video Preview Subsection
    │   ├── Final Music Video Rendering Subsection
    │   └── Readiness Debug Panel Subsection
    ├── Full Preview Section
    ├── Export Project Section
    ├── Project Change Log Section
    └── Beta Feedback Section
```

### 3.1 Landing Page

**Purpose**: Introduce BeatVision and guide users to start creating.

**Content**:
- Display application name: BeatVision
- Display tagline: \"Every Song Has a World. BeatVision Reveals It.\"
- Description: Upload your song. Paste your lyrics. Choose your style. BeatVision reveals the world hidden inside your music before generating anything.
- Buttons: Start Creating, View Demo

**Sections**:
- **How It Works**: Step 1 to Step 12 (Upload song, Paste lyrics, Choose style, Add notes, Reveal world, Approve or edit, Generate storyboard, Generate world assets, Generate scene images, Generate motion clips, Render full music video, Preview and export)
- **Why BeatVision Is Different**: Most AI tools jump from prompt to generation. BeatVision starts with understanding. It reveals the world first, lets the creator approve it, and only then moves toward generation.
- **Creator Control**: Explain that the creator stays in control throughout the process.
- **Beta Mission**: Explain that the beta version focuses on discovering, validating, storyboarding, generating world assets, generating scene images, generating motion clips, and rendering full music videos for the song.

**Actions**:
- Click \"Start Creating\" button: Navigate to Dashboard Page
- Click \"View Demo\" button: Display demo content or video

### 3.2 Dashboard Page

**Purpose**: Display all user projects and allow users to create new projects or open existing projects.

**Content**:
- Display all user projects as cards
- Each project card shows: Project title, Song file name, Selected visual style, Project status, Created date, Open Project button, Delete Project button
- Main button: Create New Project

**Actions**:
- Click \"Create New Project\" button: Navigate to Create Project Page
- Click \"Open Project\" button: Navigate to Project Results Page for that project
- Click \"Delete Project\" button: Delete the project and remove the card from the dashboard

### 3.3 Create Project Page

**Purpose**: Guide users to create a new project by uploading a song, pasting lyrics, choosing a visual style, and adding optional creative notes.

**Form Fields**:
- **Project Title**: Text input
- **Song Upload**: File upload (accept audio files)
- **Lyrics Text Area**: Multi-line text input
- **Visual Style Dropdown**: Select one option from: Cinematic, Cyberpunk, Fantasy, Viking, Anime, Horror, Dreamlike, Post-Apocalyptic, Modern Drama, Concert Performance, Abstract Emotion, Custom
- **Additional Notes Text Area** (optional): Multi-line text input with placeholder: \"Tell BeatVision anything important about your vision, characters, story, meaning, or things to avoid. Example: This song is about my daughter. I want the ending to feel hopeful. No futuristic technology. The main character wears black.\"

**Actions**:
- Click \"Reveal My World\" button: Create a project, Save the song file, lyrics, selected style, and optional notes, Generate a Visual World Report, Navigate to Project Results Page

### 3.4 Project Results Page

**Purpose**: Display the project details and guide users through the approval workflow: Visual World Report → Storyboard → Characters and Environment → Generate the World → Generate Scene Images → Create Motion Video. Display Review Changes Section when approved sections are edited. Provide Full Preview and Export controls.

**Header Content**:
- Display project title, song name, selected style, and status
- Right side buttons: Full Preview button (visible when Visual World Report + Storyboard + World Assets created), Export Project button (visible when Visual World Report + Storyboard exist)

**Sections** (unlock in order):
- Review Changes Section (visible when any section has status = \"Updated After Approval\", needs_review = true, or downstream sections affected by upstream edit)
- Visual World Report Section (unlocked by default)
- Storyboard Section (unlocked after World Approval)
- Characters and Environment Section (unlocked after Storyboard Approval)
- Generate the World Section (unlocked after Characters and Environment Approval)
- Image Provider Settings Section (always visible after Generate the World Section unlocked)
- Generate Scene Images Section (unlocked after all world assets approved)
- Segmented Video Renderer Section (unlocked after all scene images approved or uploaded or placeholder approved)
- Create Motion Video Section (unlocked after all scene images approved)
- Full Preview Section (visible when Visual World Report + Storyboard + World Assets created)
- Export Project Section (visible when Visual World Report + Storyboard exist)
- Project Change Log Section (always visible after first change)
- Beta Feedback Section (always visible)

**Bottom Area**:
- Full Preview button (visible when Visual World Report + Storyboard + World Assets created)
- Export Project button (visible when Visual World Report + Storyboard exist)

### 3.5 Review Changes Section

**Purpose**: When a creator edits something that was already approved, BeatVision clearly shows what changed, what might be affected, and what needs review before the project continues.

**Visibility Condition**: Show this section when any major section has status = \"Updated After Approval\", needs_review = true, or any downstream section was affected by an upstream edit.

**Panel Subtitle**: \"Some approved parts of your project have changed. Review the affected sections before continuing.\"

**Project-level Review Status Card**:
- Total sections approved
- Total sections updated after approval
- Total sections needing review
- Whether project is safe to continue to next phase
- Example text: \"3 sections need review before BeatVision can continue to motion generation.\" or \"All changes have been reviewed. BeatVision is ready to continue.\"

**Each Affected Item Shows**:
- Section name
- Current status (Approved, Updated After Approval, Needs Review, Reapproved)
- What changed
- What it may affect
- Last edited date
- Button to review
- Button to reapprove
- Button to keep unchanged (if allowed)

**Affected Sections**: Visual World Report, Storyboard, Individual Storyboard Scene, Characters and Environment, World Style Bible, Character Sheet, Environment Sheet, Scene Visual Prompt, Scene Image, Motion Settings, Scene Motion Plan, Motion Clip

**Section Status Labels**: Approved (green), Updated After Approval (amber/yellow), Needs Review (orange/red-orange), Reapproved (green/blue)

**Warnings by Section**:
- Visual World Report: \"You changed the approved world. This may affect the storyboard, characters, style bible, scene prompts, generated images, and motion clips.\"
- Storyboard: \"You changed the storyboard. This may affect scene prompts, generated scene images, and motion clips.\"
- Character Sheet: \"You changed the character design. This may affect generated scene images and motion clips.\"
- Scene Visual Prompt: \"You changed this scene prompt. This may affect only this scene's image and motion clip.\"
- Scene Image: \"You changed this scene image. This may affect only this scene's motion clip.\"
- Motion Settings: \"You changed motion settings. This may affect all motion clips and the final video.\"

**Buttons**:
- **Review All Changes**: Scrolls/navigates through every section needing review
- **Reapprove All Reviewed Changes**: Enabled only when user has opened/reviewed all changed sections; marks reviewed sections as Reapproved, clears needs_review and updated_after_approval, updates last_approved_at and progress tracker
- **Keep Later Sections As They Are**: Appears when user saved upstream edits without forcing downstream review; keeps later approved sections unchanged, marks edited section as Updated After Approval, allows creator to continue, shows note that later sections may not perfectly match the edited section

### 3.6 Visual World Report Section

**Purpose**: Generate and display the visual world hidden inside the song, allowing the creator to approve, edit, or regenerate the world.

**Generated Content**: Song Summary, Emotional Core, Main Visual World, Color Palette, Lighting Style, Main Characters, Symbolic Objects, Key Locations, Story Direction, Creative Match Score

**Actions**:
- **Approve World** button: Set world_approved to true, Update project status to \"World Approved\", Unlock Storyboard Section
- **Edit World** button: Allow user to edit Visual World Report fields directly, When user saves edits after approval: trigger Review Changes workflow
- **Regenerate World** button: Generate a new version of the Visual World Report, The visible report content must change, Display message: \"World regenerated. A fresh perspective on your song's world.\", If already approved: trigger Review Changes workflow

### 3.7 Storyboard Section

**Purpose**: Generate and display a storyboard with 6 to 10 scenes based on the approved Visual World Report, allowing the creator to approve, edit, or refresh individual scenes.

**Unlock Condition**: Only show after World Approval.

**Generated Content**: 6 to 10 storyboard scenes. Each scene includes: Scene Number, Timestamp Range, Scene Title, Visual Description, Camera Direction, Mood, Location, Lyric Moment, Transition Style, Approved (true/false)

**Actions**:
- **Approve Scene** button (per scene): Set that scene approved to true
- **Edit Scene** button (per scene): Allow user to edit that scene's fields directly, When user saves edits after approval: trigger Review Changes workflow
- **Refresh Scene** button (per scene): Update only that selected scene, The scene content must visibly change, Display message: \"Scene refreshed.\", If already approved: trigger Review Changes workflow
- **Approve Storyboard** button (main button): Set storyboard_approved to true, Update project status to \"Storyboard Approved\", Unlock Characters and Environment Section

### 3.8 Characters and Environment Section

**Purpose**: Generate and display the main characters and environment based on the approved storyboard, allowing the creator to approve, edit, or regenerate the content.

**Unlock Condition**: Only show after Storyboard Approval.

**Generated Content**: Main Character, Supporting Character, Main Environment, Visual Atmosphere, Wardrobe and Style, World Rules

**Actions**:
- **Approve Characters and World** button: Set characters_approved to true, Update project status to \"Characters Approved\", Unlock Generate the World Section
- **Edit** button: Allow fields to be edited, When user saves edits after approval: trigger Review Changes workflow
- **Regenerate** button: Create a new version, The visible content must change, If already approved: trigger Review Changes workflow

### 3.9 Generate the World Section

**Purpose**: Generate world assets including style bible, character sheet, environment sheet, scene visual prompts, and scene preview cards to prepare for image generation.

**Unlock Condition**: Only show after world_approved = true AND storyboard_approved = true AND characters_approved = true.

**Section Intro**: \"Your world is approved. BeatVision can now generate the visual foundation for your music video: the style bible, character sheet, environment sheet, and scene-by-scene visual prompts.\"

**Main Action**:
- Click \"Generate the World\" button: Generate World Style Bible, Generate Character Sheet, Generate Environment Sheet, Generate Scene Visual Prompts for every approved storyboard scene, Generate placeholder Scene Preview Cards, Save all to database, Update project status to \"Generating World Assets\"

#### 3.9.1 World Style Bible Subsection

**Purpose**: Define overall visual style rules for consistency across all generated assets.

**Generated Content**: Overall Visual Style, Color Rules, Lighting Rules, Camera Rules, Character Consistency Rules, Environment Rules, Symbolic Motifs, Things to Avoid

**Actions**:
- **Generate Style Bible** button: Generate content
- **Edit** button: Allow fields to be edited; when user saves edits after approval: trigger Review Changes workflow
- **Regenerate** button: Create a new version; if already approved: trigger Review Changes workflow
- **Approve** button: Set approved to true

#### 3.9.2 Character Sheet Subsection

**Purpose**: Define character appearance and traits to keep characters consistent across generated images.

**Generated Content** (for main character and supporting characters): Character Role, Appearance, Wardrobe, Body Language, Facial Expression, Personality Energy, Recurring Visual Traits, Consistency Notes

**Actions**:
- **Generate** button: Generate content
- **Edit** button: Allow fields to be edited; when user saves edits after approval: trigger Review Changes workflow
- **Regenerate** button: Create a new version; if already approved: trigger Review Changes workflow
- **Approve** button: Set approved to true

#### 3.9.3 Environment Sheet Subsection

**Purpose**: Define environment details and world consistency rules.

**Generated Content**: Main World Description, Key Locations, Weather Atmosphere, Textures Materials, Background Details, Lighting Conditions, Recurring Objects, World Consistency Rules

**Actions**:
- **Generate** button: Generate content
- **Edit** button: Allow fields to be edited; when user saves edits after approval: trigger Review Changes workflow
- **Regenerate** button: Create a new version; if already approved: trigger Review Changes workflow
- **Approve** button: Set approved to true

#### 3.9.4 Scene Visual Prompt Pack Subsection

**Purpose**: Generate visual prompt packages for each approved storyboard scene to prepare for image generation.

**Generated Content** (per scene): Scene Number, Scene Title, Timestamp Range, Main Image Prompt, Camera Framing, Lighting Direction, Character Placement, Mood, Environment Details, Symbolic Objects, Style Consistency Notes, Negative Prompt, Approved (true/false)

**Actions** (per scene):
- **Regenerate Prompt** button: Update only that scene, content must visibly change; if already approved: trigger Review Changes workflow
- **Edit Prompt** button: Allow fields to be edited; when user saves edits after approval: trigger Review Changes workflow
- **Approve Prompt** button: Set that scene approved to true
- **Generate Preview** button: Generate scene preview card

#### 3.9.5 Scene Preview Cards Subsection

**Purpose**: Display cinematic placeholder preview cards for each scene using scene title, dominant colors, mood, location, symbolic object, camera direction.

**Generated Content** (per scene): Preview Title, Preview Description, Dominant Colors, Mood, Location, Symbolic Object, Camera Direction, Placeholder Visual, Image URL (if image generation API is connected), Approved (true/false)

**Actions**:
- **Generate Preview** button: If image generation API is connected, call it using main_image_prompt + negative_prompt

#### 3.9.6 World Generation Status Progress Tracker

**Purpose**: Display progress through world generation workflow.

**Steps**: World Approved, Storyboard Approved, Characters Approved, Style Bible Approved, Character Sheet Approved, Environment Sheet Approved, Scene Prompts Approved, Ready for Image Generation

**Updates**: Show if any phase changed after approval (e.g., \"Storyboard Needs Review\", \"Scene Images Updated After Approval\")

### 3.10 Image Provider Settings Section

**Purpose**: Allow creators to configure image generation provider settings and enable or disable real AI providers.

**Unlock Condition**: Always visible after Generate the World Section unlocked.

**Section Title**: \"Image Provider Settings\"

**Global Setting**: Real AI Providers Enabled
- Default: false
- If false: all generation uses fallback/placeholder/manual upload, no external API calls
- If true: real provider calls allowed
- Visible warning: \"Real AI providers are disabled by default to prevent accidental credit usage.\"
- Label: \"Credit-Safe Mode: On\" (default)

**Fields**:
- Provider Name (dropdown): Disabled, Manual Upload Only, OpenAI Image, Stability Image, Replicate Image, Custom Image API, Local Image API
- API Key (text input)
- API Endpoint (text input)
- Model Name (text input)
- Output Size (text input)
- Aspect Ratio (text input)
- Enabled (boolean)
- Test Mode (boolean)

**Default**: Manual Upload Only, Enabled = false

**Buttons**:
- **Save Provider Settings**: Save the provider settings
- **Test Connection**: Manual Only — shows confirmation before any call

**If no provider**: Show message about manual upload or placeholder

### 3.11 Generate Scene Images Section

**Purpose**: Turn approved scene visual prompts into actual visual scene images while maintaining character consistency, world consistency, style consistency, and creator control.

**Unlock Condition**: Only show after world_approved = true AND storyboard_approved = true AND characters_approved = true AND style_bible_approved = true AND character_sheet_approved = true AND environment_sheet_approved = true AND all scene visual prompts approved = true.

**Section Intro**: \"Your world assets are approved. BeatVision can now generate scene-by-scene images from the approved prompts, character rules, and environment rules. Review each image, regenerate if needed, and approve the final visual set before moving to motion.\"

#### 3.11.1 Image Generation Overview Subsection

**Purpose**: Display progress through image generation workflow.

**Progress Tracker Steps**: World Approved, Storyboard Approved, Characters Approved, Style Bible Approved, Character Sheet Approved, Environment Sheet Approved, Scene Prompts Approved, Scene Images Generated, Scene Images Approved, Ready for Motion

#### 3.11.2 Generate All Scene Images Subsection

**Purpose**: Generate images for all approved storyboard scenes at once.

**Main Button**: \"Generate All Scene Images\"

**Actions**:
- Click \"Generate All Scene Images\" button: Use every approved Scene Visual Prompt + approved Style Bible + approved Character Sheet + approved Environment Sheet, Generate one image per approved storyboard scene, Save each image, Update project status to \"Generating Scene Images\", After generation: show all scene image cards in order by scene number, If no real image generation API connected: create placeholder records and visual mock cards

#### 3.11.3 Scene Image Cards Subsection

**Purpose**: Display generated scene images with review and approval controls.

**Each Card Shows**: Scene Number, Scene Title, Timestamp Range, Generated Image, Image Status, Prompt Summary, Mood, Camera Framing, Location, Character Presence, Lighting Direction, Style Consistency Summary

**Buttons** (per card):
- **Generate Image** button: Only calls API if Real AI Providers Enabled = true AND provider enabled; else explains and offers alternatives
- **Upload Scene Image** button: Allow manual upload (manual_upload=true, real_generated=false, placeholder=false, status=Completed)
- **Create Placeholder Preview** button: Create placeholder (placeholder=true, real_generated=false, manual_upload=false, status=Placeholder Preview — clearly labeled, NOT counted as ready for motion unless creator clicks \"Use Placeholder As Draft Final\" with warning)
- **Regenerate Image** button: Create new version for that scene only, keep previous versions; if already approved: trigger Review Changes workflow
- **Edit Prompt** button: Allow user to edit scene visual prompt fields; when user saves edits after approval: trigger Review Changes workflow
- **Approve Image** button: Mark image as approved, set as active approved version
- **Reject Image** button: Mark image as rejected/needs revision, keep visible, allow regeneration
- **Compare Versions** button: Show all saved versions for that scene, allow user to select one as approved
- **Replace Image** button: Replace current image with new upload or generation
- **Use Placeholder As Draft Final** button: Show warning dialog, if confirmed: use_placeholder_as_draft_final=true, count toward \"Ready for Motion\"

**Regeneration Rule**: Regenerating one scene must NOT affect other scenes.

**Approval Rule**: Only real generated or manually uploaded images count toward \"Ready for Motion\" by default. Placeholder requires explicit \"Use Placeholder As Draft Final\" with warning dialog.

#### 3.11.4 Image Review Mode Subsection

**Purpose**: Provide a unified view to review all scene images in storyboard order.

**Content**: Scroll through all scene images in storyboard order, See approved/needs-review status for each scene, Quick regenerate or approve from one place, Overall completion progress

**Filters**: All Scenes, Approved Images, Needs Review, Rejected/Regenerate Needed

#### 3.11.5 Consistency Controls Subsection

**Purpose**: Provide creator-friendly controls to prioritize consistency aspects during image generation.

**Labels** (no technical AI jargon):
- \"Character consistency is locked to approved character sheet\"
- \"Environment consistency is locked to approved environment sheet\"
- \"Style consistency is locked to approved style bible\"

**Optional Toggle Labels**: Prioritize Character Consistency, Prioritize Environment Accuracy, Prioritize Cinematic Style, Keep Scene Close to Storyboard, Allow Slight Creative Variation

#### 3.11.6 Ready for Motion Subsection

**Purpose**: Display when all scene images are approved and project is ready for motion.

**Unlock Condition**: Only show when every approved storyboard scene has at least one generated image AND every scene has one approved image version AND no scenes remain in review.

**Content**: Display message: \"Your visual scenes are approved. BeatVision is now ready for motion and video generation.\", Update project status to \"Ready for Motion\"

### 3.12 Segmented Video Renderer Section

**Purpose**: Support full-length music videos by breaking song into segments, rendering each, then combining. Default method: fallback image-motion rendering only (no paid AI required).

**Unlock Condition**: Only show after all scene images approved or uploaded or placeholder approved.

**Section Title**: \"Segmented Video Renderer\"

**Section Intro**: \"Your scene images are ready. BeatVision can now break your song into segments, render each segment with motion effects, and combine them into a full-length music video.\"

#### 3.12.1 Full Song Coverage Subsection

**Purpose**: Display full song coverage status.

**Content**:
- Song duration
- Covered duration
- Segment count
- Missing gaps
- First/last segment times
- Coverage status

**If duration unknown**: Read from audio metadata or allow manual entry.

#### 3.12.2 Create Video Segments Subsection

**Purpose**: Create video segments covering the full song duration.

**Segmentation Options**: Use Storyboard Scenes, Split by Lyrics, Split Every 5s, Split Every 10s (default), Split Every 15s, Custom Segment Length

**Maximum Segment Count**: 100

**Button**: \"Create Video Segments\"

**Actions**:
- Click \"Create Video Segments\" button: Always works if storyboard exists and duration known; creates VideoSegment DB records covering full song 0:00 to end; fills gaps with nearest approved image

#### 3.12.3 Segment Rendering Subsection

**Purpose**: Render all segments without paid providers.

**Button**: \"Render All Segments\" (default: fallback image-motion only)

**Actions**:
- Click \"Render All Segments\" button: For each segment: use approved/uploaded/draft-placeholder image, apply motion effect (Slow Zoom In/Out, Pan Left/Right, Tilt Up/Down, Beat Pulse, Subtle Shake, Flash Impact, Glitch Flicker, Still Frame), add captions, apply transitions, save render data, set fallback_rendered=true. If actual video file not supported: create simulated preview segments, label clearly \"Simulated Preview Segment\", do NOT pretend they are exported MP4.

#### 3.12.4 Per-Segment Controls Subsection

**Purpose**: Provide per-segment buttons for preview, render, regenerate, approve, replace, retry.

**Each Segment Card Shows**: Segment number, Segment title, Start time, End time, Duration, Image, Motion effect, Transition in, Transition out, Caption text, Lyric text, Render status, Approved

**Buttons** (per segment):
- **Preview Segment**: Always works if image exists, opens motion preview modal
- **Render Segment**: Fallback unless provider enabled
- **Regenerate Segment Motion**: Update motion plan for that segment
- **Approve Segment**: approved=true, pending=false, failed=false, render_status=Approved
- **Replace Segment Image**: Replace image for that segment
- **Retry Failed Segment**: Retry rendering for that segment

#### 3.12.5 Stitch Segments Subsection

**Purpose**: Render full music video by stitching all segments.

**Button**: \"Render Full Music Video\" (default: fallback renderer, no paid APIs)

**Pre-checks**: Full song coverage, all active segments have preview/render status, audio exists, no blockers, segments sorted by segment_number.

**Output Options** (in priority order):
1. Browser WebM export if supported
2. Full playable in-app preview + render manifest JSON + production package export

**Show**: \"Full video preview is ready. MP4 export requires server rendering.\" — do NOT fail just because MP4 is unavailable.

#### 3.12.6 Blocker Panels Subsection

**Purpose**: Display exact blockers when rendering is blocked.

**Panels**:
- \"Why Can't I Generate Scene Images?\" panel
- \"Why Can't I Render Full Video?\" panel

**Examples of Exact Messages**: \"No image provider connected\", \"Scene 3 has no uploaded or generated image\", \"Scene 5 only has a placeholder — use as draft first\", \"Audio file missing\", \"Song duration unknown\", \"Timeline gap from 1:20 to 1:30\", \"Segment 22 failed\", \"Final MP4 server renderer not connected\"

### 3.13 Create Motion Video Section

**Purpose**: Turn approved scene images into motion clips and render a full music video with motion, transitions, captions, and audio sync.

**Unlock Condition**: Only show after world_approved = true AND storyboard_approved = true AND characters_approved = true AND style_bible_approved = true AND character_sheet_approved = true AND environment_sheet_approved = true AND all scene visual prompts approved = true AND all scene images approved = true.

**Section Intro**: \"Your approved scenes are ready. BeatVision can now turn your song, storyboard, and scene images into a full music video with motion, transitions, captions, and audio sync.\"

#### 3.13.1 Motion Readiness Subsection

**Purpose**: Display progress through motion generation workflow and check motion readiness.

**Progress Tracker Steps**: World Approved, Storyboard Approved, Characters Approved, World Assets Approved, Scene Prompts Approved, Scene Images Approved, Motion Settings Ready, Preview Render Ready, Final Video Ready

**Button**: \"Check Motion Readiness\"

**Actions**:
- Click \"Check Motion Readiness\" button: Recalculate project readiness, Clear false pending states if approved = true, Show exact blockers if any (e.g. \"Scene Image 4 not approved\", \"Motion settings not saved\"), If no blockers, update project status to \"Ready for Motion\"

**Display Rule**: Never show vague messages like \"pending sections remain.\" Show exact blockers.

#### 3.13.2 Motion Style Settings Subsection

**Purpose**: Allow creators to configure motion style, transition style, caption style, video format, and video quality.

**Fields** (creator-friendly, no technical AI terms, no model settings):

**Motion Style Dropdown**: Cinematic Slow Push, Beat-Synced Cuts, Handheld Energy, Dreamlike Drift, Glitch / Cyberpunk, Hard Rock Impact, Emotional Slow Motion, Custom

**Transition Style Dropdown**: Fade, Hard Cut, Cross Dissolve, Whip Pan, Glitch Cut, Flash Cut, Smoke Fade, Match Cut

**Caption Style Dropdown**: No Captions, Lyric Captions, Scene Titles Only, Lyric Moments Only, Full Storyboard Captions

**Video Format Dropdown**: 16:9 Landscape, 9:16 Vertical, 1:1 Square

**Video Quality Dropdown**: Draft Preview, Standard 720p, HD 1080p

**Toggles**: Add beat-style camera movement, Add subtle zoom and pan, Add cinematic grain, Add scene title cards, Add lyric captions, Add transition effects, Keep motion gentle, Make motion intense

**Button**: \"Save Motion Settings\"

**Actions**:
- Click \"Save Motion Settings\" button: Create or update MotionSettings, Set project status to \"Motion Settings Ready\", Generate SceneMotionPlan records for all approved storyboard scenes

#### 3.13.3 Storyboard Motion Timeline Subsection

**Purpose**: Create a timeline from approved storyboard scenes and allow editing per scene.

**For Each Scene, Show**: Scene number, Scene title, Timestamp range, Duration, Approved scene image, Lyric moment, Visual description, Transition style, Motion effect, Caption text

**Allow Editing Per Scene**: Scene duration, Transition style, Motion effect, Caption text, Whether the scene appears in the final video

**Motion Effect Options**: Slow Zoom In, Slow Zoom Out, Pan Left, Pan Right, Tilt Up, Tilt Down, Parallax Drift, Subtle Shake, Beat Pulse, Flash Impact, Glitch Flicker, Still Frame

**Buttons Per Scene**:
- **Preview Scene Motion**: Preview motion effect for that scene
- **Regenerate Motion Plan**: Update motion plan for that scene
- **Approve Motion Plan**: Mark motion plan as approved

#### 3.13.4 Motion Clip Generation Subsection

**Purpose**: Generate motion clips for each approved scene image.

**Section Title**: \"Generate Motion Clips\"

**Generation Logic**: For each approved scene image, generate a motion clip. If no AI video provider is connected: generate a motion clip using the approved still image with zoom, pan, shake, beat pulse, fade, glitch, flash, caption overlay, transition in and out. If browser video rendering available: use browser canvas/video rendering. If server rendering available: use server-side rendering. If neither available: create a simulated motion preview inside the app and save motion settings for future rendering.

**Each Motion Clip Includes**: Scene image, Start time, End time, Duration, Motion effect, Transition in, Transition out, Caption, Lyric moment, Status, Approved

**Buttons Per Motion Clip**:
- **Generate Motion Clip**: Generate motion clip for that scene only
- **Preview Motion Clip**: Preview motion clip
- **Regenerate Motion Clip**: Create new version for that scene only; if already approved: trigger Review Changes workflow
- **Approve Motion Clip**: Mark motion clip as approved
- **Edit Motion Settings**: Allow user to edit motion settings for that scene

**Status Options**: Not Generated, Generating, Ready for Review, Approved, Failed, Needs Regeneration

**Regeneration Rule**: Regenerating one motion clip must NOT affect other clips.

**Bulk Buttons**:
- **Generate All Motion Clips**: Generates all approved scenes, sets project status to \"Motion Clips In Review\"
- **Approve All Motion Clips**: Approves all ready clips, sets project status to \"Motion Clips Approved\", unlocks Full Music Video Preview

#### 3.13.5 Full Music Video Preview Subsection

**Purpose**: Combine all approved motion clips into a preview music video.

**Section Title**: \"Full Music Video Preview\"

**Button**: \"Generate Preview Video\"

**Actions**:
- Click \"Generate Preview Video\" button: Combine all approved motion clips in storyboard order, Add uploaded song audio, Add captions if selected, Add transitions, Create preview music video, Update project status to \"Preview Render Ready\"

**Output**: If real video file rendering available: generate a preview video file. If not: generate in-app playable preview using scene images, motion effects, captions, and audio timing.

**Preview Player Controls**: Play / Pause / Restart, Previous Scene / Next Scene, Fullscreen / Close Preview, Show current scene title, current timestamp, total video duration

#### 3.13.6 Final Music Video Rendering Subsection

**Purpose**: Render the final music video.

**Section Title**: \"Render Final Music Video\"

**Button**: \"Render Full Music Video\"

**Actions**:
- Click \"Render Full Music Video\" button: Use uploaded song as audio track, Use approved motion clips, Use approved storyboard order, Use selected video format and quality, Add selected captions and transitions, Render one complete music video

**Output Priority**: MP4 if supported, WebM if MP4 not supported (label clearly: \"Preview Video Rendered as WebM\"), Downloadable video file if possible

**If MP4 Not Supported**: Show \"MP4 export will be available when server rendering is connected.\"

**Render Failure Handling**: Set render status to Failed, Show exact error message, Allow retry, Never stay stuck pending forever

#### 3.13.7 Readiness Debug Panel Subsection

**Purpose**: Display exact blockers when rendering is blocked.

**Section Title**: \"Why Can't I Render Video?\"

**Visibility Condition**: Only show when rendering is blocked.

**Content**: Lists exact blockers (e.g. \"Scene Image 4 not approved\", \"Motion settings not saved\", \"Motion Clip 2 not approved\", \"Audio file missing\"). If no blockers: show \"No blockers found. Render Full Music Video is available.\"

**Display Rule**: Never show vague pending messages.

### 3.14 Full Preview Section

**Purpose**: Provide a cinematic full-screen preview of the complete project in one place.

**Visibility Condition**: Show Full Preview button when Visual World Report created AND Storyboard created AND World Assets created.

**Button Locations**: Project Results Page header (right side), Progress tracker area, Bottom of Project Results Page

**Modal Content** (displayed in order): Project Title, Song Name, Selected Style, Tagline: \"Every Song Has a World. BeatVision Reveals It.\", Visual World Summary, Character and Environment Summary, Style Bible Summary, Storyboard Timeline, Scene Image Preview Gallery, Motion Preview (if motion clips exist), Final Video Preview (if final video exists)

**For Each Storyboard Scene**: Scene Number, Timestamp Range, Scene Title, Scene Image (if available), Motion Clip (if available), Visual Description, Camera Direction, Mood, Location, Lyric Moment, Transition Style

**Preview Controls**: Previous Scene button, Next Scene button, Play Preview button, Pause Preview button, Restart Preview button, Close Preview button

**Storyboard Slideshow Preview** (if real motion/video does not exist): Show each scene in order using timestamp ranges if available, Show scene image or placeholder, Show scene title + short description + lyric moment, Navigate manually with Next Scene button, Add Auto Play using estimated timing per scene

**Design**: Full-screen modal, Dark cinematic BeatVision studio aesthetic, Black backgrounds, deep gray cards, electric blue accents, purple highlights, Mobile-friendly layout

### 3.15 Export Project Section

**Purpose**: Allow creators to export project assets at any phase.

**Visibility Condition**: Show Export Project button when Visual World Report AND Storyboard exist.

**Button Locations**: Project Results Page header (right side), Progress tracker area, Bottom of Project Results Page

**Export Panel Options**:
- Export Visual World Report (PDF + Copy)
- Export Storyboard (PDF + Copy)
- Export Style Bible (PDF + Copy)
- Export Character Sheet (PDF + Copy)
- Export Environment Sheet (PDF + Copy)
- Export Scene Visual Prompts (TXT + Copy)
- Export Scene Images (ZIP if images exist, else disabled)
- Export Motion Clips (ZIP if motion clips exist, else disabled)
- Export Full Project Package (JSON/ZIP)
- Export Preview Video (if preview video exists, else \"Coming Soon\")
- Export Final Music Video (MP4) (if final video exists, else \"Coming Soon\")
- Export Render Manifest JSON

**Beta Implementation** (when real file export is not fully connected): Generate export-ready text content inside the app, Show Copy buttons: Copy World Report, Copy Storyboard, Copy Prompt Pack, Copy Full Project Summary, Show Download buttons where supported: Download World Report, Download Storyboard, Download Prompt Pack, Download Full Project Data, Download Scene Images (if image files exist), Download Motion Clips (if motion clip files exist)

**Export Full Project Package Includes**: Project title, song name, lyrics, selected style, optional notes, Visual World Report, Storyboard, Characters and Environment, World Style Bible, Character Sheet, Environment Sheet, Scene Visual Prompts, Scene Images (if available), Motion Settings, Motion Clips (if available), Preview Video (if available), Final Video (if available), Beta feedback (if available), Project status, approval history, change log

**Export Render Manifest**: Button: Download Render Manifest JSON. Manifest includes: project title, song file name, song duration, segment count, each segment (start/end time, image, motion effect, transition, caption, lyric text, storyboard scene source, approved state, render status)

**Export Status Display**: Ready to Export, Export In Progress, Export Complete, Export Failed

**Error Handling**: Show clear error message on failure, Allow retry on failure, Never leave export stuck

**Phase-based Readiness Rules**: Phase 1 complete: allow export of Visual World Report and Storyboard. Phase 2 complete: allow export of World Assets and Prompt Pack. Phase 3 complete: allow export of Scene Images and Full Project Package. Phase 4 complete: allow export of Motion Clips, Preview Video, and Final Music Video.

**Final Music Video Export Row**: If final video exists: Play button, Download button, Copy metadata button. If only preview exists: Play preview, Download preview if possible, Show \"Final MP4 is not rendered yet. Preview video is available.\" If no video: Show \"No video rendered yet.\" + button \"Render Full Music Video\"

**Design**: Clear, practical, simple panel, Dark cinematic BeatVision studio aesthetic, Creator-friendly labels (no technical jargon), Mobile-friendly layout

### 3.16 Project Change Log Section

**Purpose**: Display a log of all changes made to approved sections, including what changed, what was affected, and review status.

**Title**: \"Project Change Log\"

**Each Log Item Shows**: Date/time, Section changed, Change type, User action, Affected sections, Review status

**Change Types**: Edited after approval, Regenerated after approval, Marked downstream sections as needs review, Reapproved, Kept later sections unchanged

### 3.17 Beta Feedback Section

**Purpose**: Collect beta feedback from creators to help improve BeatVision.

**Unlock Condition**: Always visible after Visual World Report and Storyboard sections.

**Title**: Beta Feedback: Did BeatVision Understand Your Song?

**Questions**: How well did BeatVision understand your song? (1-10 rating), How close was this revealed world to what you imagined? (1-10 rating), Did BeatVision give you ideas you had not considered? (Yes/No buttons), Would you trust BeatVision to generate a video from this world? (Yes/No buttons), What felt right about the world? (text area), What felt wrong or missing? (text area), What would you change before generation? (text area), Would you use BeatVision again? (Yes/No buttons), Would you recommend BeatVision to another musician or creator? (Yes/No buttons), Any final notes? (text area)

**Actions**:
- Click \"Submit Feedback\" button: Save the feedback, Display message: \"Feedback saved. This helps improve BeatVision.\"

## 4. Business Rules and Logic

### 4.1 Approval Workflow

**Unlock Order**: Visual World Report Section (unlocked by default) → Storyboard Section (unlocked after world_approved = true) → Characters and Environment Section (unlocked after storyboard_approved = true) → Generate the World Section (unlocked after world_approved = true AND storyboard_approved = true AND characters_approved = true) → Generate Scene Images Section (unlocked after world_approved = true AND storyboard_approved = true AND characters_approved = true AND style_bible_approved = true AND character_sheet_approved = true AND environment_sheet_approved = true AND all scene visual prompts approved = true) → Create Motion Video Section (unlocked after world_approved = true AND storyboard_approved = true AND characters_approved = true AND style_bible_approved = true AND character_sheet_approved = true AND environment_sheet_approved = true AND all scene visual prompts approved = true AND all scene images approved = true)

**Approval Actions**: Approve World, Approve Storyboard, Approve Characters and World, Approve Style Bible, Approve Character Sheet, Approve Environment Sheet, Approve Scene Visual Prompts, Approve Scene Image, Approve Motion Settings, Approve Motion Plan, Approve Motion Clip

**Ready for Image Generation Condition**: Project NOT marked \"Ready for Image Generation\" until: style_bible_approved = true AND character_sheet_approved = true AND environment_sheet_approved = true AND all scene visual prompts approved = true. Do NOT allow project to move to next phase if required sections are marked Needs Review. BUT allow creator to continue if they chose \"Keep later sections unchanged for now\". In that case show visible reminder: \"Some approved sections were changed after approval. Later sections were kept unchanged by creator choice.\"

**Ready for Motion Condition**: Project NOT marked \"Ready for Motion\" until: every approved storyboard scene has at least one generated image AND every scene has one approved image version AND no scenes remain in review. Only real generated or manually uploaded images count toward \"Ready for Motion\" by default. Placeholder requires explicit \"Use Placeholder As Draft Final\" with warning dialog.

**Ready for Video Rendering Condition**: Project NOT marked \"Ready for Video Rendering\" until: motion_settings_approved = true AND all scene motion plans approved = true AND all motion clips approved = true

### 4.2 Review Changes Workflow

**When Approved Section Is Edited**: Create ProjectChangeLog record, Mark edited section as Updated After Approval, Ask user: \"Mark affected downstream sections as Needs Review\" OR \"Keep later sections unchanged\"

**When User Chooses \"Mark Affected Sections as Needs Review\"**: Mark downstream dependent sections as needs_review = true, Create change log entries for affected sections, Show Review Changes panel

**When User Chooses \"Keep Later Sections Unchanged\"**: Keep downstream sections approved, Mark edited section as Updated After Approval, Create change log entry, Show Review Changes panel with softer warning

**When User Reapproves a Changed Section**: Set status to Reapproved or Approved, Set needs_review = false, Set updated_after_approval = false, Update last_approved_at, Create ProjectChangeLog entry

**When All Changed/Affected Sections Are Reapproved**: Hide urgent warning state, Show: \"All changes reviewed. BeatVision is ready to continue.\"

**Dependency Rules**: Visual World Report affects: Storyboard, Characters and Environment, World Style Bible, Character Sheet, Environment Sheet, Scene Visual Prompts, Scene Images, Motion Settings, Motion Clips. Storyboard affects: Scene Visual Prompts, Scene Images, Motion Plans, Motion Clips. Characters and Environment affects: Character Sheet, Scene Images, Motion Clips. World Style Bible affects: Scene Images, Motion Clips. Character Sheet affects: Scene Images, Motion Clips. Environment Sheet affects: Scene Images, Motion Clips. Scene Visual Prompt affects: Scene Image (only that scene), Motion Clip (only that scene). Scene Image affects: Motion Clip (only that scene). Motion Settings affects: All Motion Clips, Final Video.

### 4.3 Regeneration and Refresh Logic

**Regenerate World**: Generate a new version of the Visual World Report, The visible report content must change, Update all Visual World Report fields, If already approved: trigger Review Changes workflow

**Refresh Scene**: Update only the selected scene, The scene content must visibly change, Update all scene fields, If already approved: trigger Review Changes workflow

**Regenerate Characters and Environment**: Create a new version of Characters and Environment, The visible content must change, If already approved: trigger Review Changes workflow

**Regenerate Style Bible**: Create a new version of World Style Bible, The visible content must change, If already approved: trigger Review Changes workflow

**Regenerate Character Sheet**: Create a new version of Character Sheet, The visible content must change, If already approved: trigger Review Changes workflow

**Regenerate Environment Sheet**: Create a new version of Environment Sheet, The visible content must change, If already approved: trigger Review Changes workflow

**Regenerate Scene Visual Prompt**: Update only the selected scene prompt, The scene prompt content must visibly change, If already approved: trigger Review Changes workflow

**Regenerate Scene Image**: Create new version for that scene only, Create new SceneImageVersion, Keep previous versions, Update card immediately, Regenerating one scene must NOT affect other scenes, If already approved: trigger Review Changes workflow

**Regenerate Motion Plan**: Update only the selected scene motion plan, The motion plan content must visibly change, If already approved: trigger Review Changes workflow

**Regenerate Motion Clip**: Create new version for that scene only, Create new MotionClip, Keep previous versions, Update card immediately, Regenerating one motion clip must NOT affect other clips, If already approved: trigger Review Changes workflow

### 4.4 World Generation Workflow

When user clicks \"Generate the World\": Generate World Style Bible based on approved Visual World Report + Storyboard + Characters and Environment, Generate Character Sheet for main character and supporting characters, Generate Environment Sheet, Generate Scene Visual Prompts for every approved storyboard scene, Generate placeholder Scene Preview Cards for each scene, Save all to database, Update project status to \"Generating World Assets\"

### 4.5 Image Generation Workflow

**Generate All Scene Images**: Create ImageGenerationBatch, Loop through approved Scene Visual Prompts, Generate one SceneImage per scene using: approved Scene Visual Prompt + approved Style Bible + approved Character Sheet + approved Environment Sheet, Create first SceneImageVersion for each, Set project status to \"Generating Scene Images\", When complete update to \"Scene Images In Review\"

**Generate Single Scene Image**: Generate for that scene only, Create SceneImage if not exists, Create SceneImageVersion, Update card immediately

**Image Generation Logic**: Each image generated using: approved Scene Visual Prompt + approved Style Bible + approved Character Sheet + approved Environment Sheet. Combined prompt includes: main image prompt, camera framing, lighting direction, character placement, environment details, symbolic objects, style consistency notes, negative prompt. Must reflect: consistent character appearance/wardrobe, consistent visual world/palette/lighting/atmosphere/symbolic motifs.

**Image Versioning**: Each scene image supports multiple versions. Store: original version, regenerated versions, selected approved version. User can: view previous versions, choose which version is the active approved one. Only one version per scene can be the active approved version.

**Image Approval Rules**: Approve: mark SceneImageVersion as approved, mark as active approved version, mark SceneImage as approved, update progress. Reject: mark image as rejected/needs revision, keep visible, allow regeneration. Compare Versions: show all saved versions for that scene, allow user to select one as approved.

**Manual Upload**: Allow manual upload (manual_upload=true, real_generated=false, placeholder=false, status=Completed). Manually uploaded images count toward \"Ready for Motion\".

**Placeholder Preview**: Create placeholder (placeholder=true, real_generated=false, manual_upload=false, status=Placeholder Preview — clearly labeled, NOT counted as ready for motion unless creator clicks \"Use Placeholder As Draft Final\" with warning).

**Use Placeholder As Draft Final**: Show warning dialog, if confirmed: use_placeholder_as_draft_final=true, count toward \"Ready for Motion\".

### 4.6 Segmented Video Renderer Workflow

**Create Video Segments**: Always works if storyboard exists and duration known; creates VideoSegment DB records covering full song 0:00 to end; fills gaps with nearest approved image.

**Segmentation Options**: Use Storyboard Scenes, Split by Lyrics, Split Every 5s, Split Every 10s (default), Split Every 15s, Custom Segment Length. Maximum segment count: 100.

**Render All Segments**: For each segment: use approved/uploaded/draft-placeholder image, apply motion effect (Slow Zoom In/Out, Pan Left/Right, Tilt Up/Down, Beat Pulse, Subtle Shake, Flash Impact, Glitch Flicker, Still Frame), add captions, apply transitions, save render data, set fallback_rendered=true. If actual video file not supported: create simulated preview segments, label clearly \"Simulated Preview Segment\", do NOT pretend they are exported MP4.

**Per-Segment Controls**: Preview Segment (always works if image exists, opens motion preview modal), Render Segment (fallback unless provider enabled), Regenerate Segment Motion, Approve Segment (approved=true, pending=false, failed=false, render_status=Approved), Replace Segment Image, Retry Failed Segment.

**Stitch Segments**: Pre-checks: full song coverage, all active segments have preview/render status, audio exists, no blockers, segments sorted by segment_number. Output options (in priority order): Browser WebM export if supported, Full playable in-app preview + render manifest JSON + production package export. Show: \"Full video preview is ready. MP4 export requires server rendering.\" — do NOT fail just because MP4 is unavailable.

### 4.7 Motion Generation Workflow

**Save Motion Settings**: Create or update MotionSettings, Set project status to \"Motion Settings Ready\", Generate SceneMotionPlan records for all approved storyboard scenes

**Generate All Motion Clips**: Loop through approved SceneMotionPlan records, Generate one MotionClip per scene using: approved scene image + motion effect + transition in + transition out + caption + lyric moment, Set project status to \"Motion Clips In Review\", When complete update to \"Motion Clips Approved\"

**Generate Single Motion Clip**: Generate for that scene only, Create MotionClip if not exists, Update card immediately

**Motion Clip Generation Logic**: If no AI video provider is connected: generate a motion clip using the approved still image with zoom, pan, shake, beat pulse, fade, glitch, flash, caption overlay, transition in and out. If browser video rendering available: use browser canvas/video rendering. If server rendering available: use server-side rendering. If neither available: create a simulated motion preview inside the app and save motion settings for future rendering.

**Motion Clip Approval Rules**: Approve: mark MotionClip as approved, update progress. Regenerate: create new version, keep previous versions.

### 4.8 Video Rendering Workflow

**Generate Preview Video**: Combine all approved motion clips in storyboard order, Add uploaded song audio, Add captions if selected, Add transitions, Create preview music video, Update project status to \"Preview Render Ready\"

**Render Full Music Video**: Use uploaded song as audio track, Use approved motion clips, Use approved storyboard order, Use selected video format and quality, Add selected captions and transitions, Render one complete music video, Update project status to \"Final Video Rendered\"

**Rendering Fallback Logic**: First working version must render a complete music video WITHOUT requiring AI video generation providers. Fallback method: Use approved scene images as visual source, Animate with: zoom, pan, tilt, subtle shake, beat pulse, fade transitions, glitch transitions if selected, lyric captions, scene title cards, Combine with uploaded song audio, Creates a full music video from still images and motion effects.

**Output Priority**: MP4 if supported, WebM if MP4 not supported (label clearly: \"Preview Video Rendered as WebM\"), Downloadable video file if possible

**Render Failure Handling**: Set render status to Failed, Show exact error message, Allow retry, Never stay stuck pending forever

### 4.9 Readiness Cleanup Logic

**Before Rendering, Automatically Run Readiness Cleanup**: If approved = true on any record: pending = false, needs_review = false, updated_after_approval = false, rejected = false. Only active storyboard scenes, active prompts, active scene images, and active motion clips count. Old inactive versions must NOT block rendering.

### 4.10 Full Preview Logic

**Visibility Condition**: Show Full Preview button when: Visual World Report created AND Storyboard created AND World Assets created

**Modal Behavior**: Open full-screen modal, Display project content in order, Show storyboard timeline with scene cards, Show scene images if available, Show motion clips if available, Show final video if available, If no motion/video exists: show Storyboard Slideshow Preview

**Storyboard Slideshow Preview**: Show each scene in order, Use timestamp ranges if available, Show scene image or placeholder, Show scene title + short description + lyric moment, Navigate manually with Next Scene button, Add Auto Play using estimated timing per scene

**Preview Controls**: Previous Scene: Navigate to previous scene, Next Scene: Navigate to next scene, Play Preview: Start auto-play slideshow or video, Pause Preview: Pause auto-play, Restart Preview: Restart from beginning, Close Preview: Close modal and return to Project Results Page

### 4.11 Export Project Logic

**Visibility Condition**: Show Export Project button when: Visual World Report AND Storyboard exist

**Export Panel Behavior**: Open export panel, Display export options based on project phase, Show Copy buttons for text content, Show Download buttons for file content, Show \"Coming Soon\" for unavailable options

**Phase-based Export Readiness**: Phase 1 complete: allow export of Visual World Report and Storyboard. Phase 2 complete: allow export of World Assets and Prompt Pack. Phase 3 complete: allow export of Scene Images and Full Project Package. Phase 4 complete: allow export of Motion Clips, Preview Video, and Final Music Video.

**Export Actions**: Export Visual World Report, Export Storyboard, Export Style Bible, Export Character Sheet, Export Environment Sheet, Export Scene Visual Prompts, Export Scene Images, Export Motion Clips, Export Full Project Package, Export Preview Video, Export Final Music Video, Export Render Manifest JSON

**Export Status**: Ready to Export, Export In Progress, Export Complete, Export Failed

**Error Handling**: Show clear error message on failure, Allow retry on failure, Never leave export stuck

### 4.12 Project Status Values

Draft, World Revealed, World Approved, Storyboard Approved, Characters Approved, Generating World Assets, World Assets Approved, Generating Scene Images, Scene Images In Review, Scene Images Approved, Ready for Motion, Motion Settings Ready, Motion Plan Ready, Motion Clips In Review, Motion Clips Approved, Preview Render Ready, Final Video Rendered, Ready for Video Generation, Preview Ready (set when Visual World Report + Storyboard exist), Export Ready (set when Visual World Report + Storyboard exist)

**Additional Status Badges** (UI labels, not DB status): Scene Image Export Ready (if scene images approved), Motion Clips Export Ready (if motion clips approved), Motion Preview Ready (if motion clips approved), Final Video Export Ready (if final video generated)

### 4.13 Generation Logic for Beta

If no real AI API is connected, create realistic structured placeholder generation based on: Project title, Lyrics, Selected style, Optional notes, Approved Visual World Report, Approved Storyboard, Approved Characters and Environment. The generated content should feel specific to the user's inputs. Do not produce completely generic filler. For regeneration actions, create alternate versions so the visible content changes. If no real image generation API connected: create placeholder records and visual mock cards so structure works. If no real video generation API connected: create motion clips using still images with zoom, pan, shake, beat pulse, fade, glitch, flash, caption overlay, transition in and out.

### 4.14 Credit Safety

**Default**: Real AI Providers Enabled = false (Credit-Safe Mode: On). No paid image/video generation APIs called by default. All generation uses fallback/manual upload/placeholder only. Real providers only activate when creator manually enables them.

**Before Any Real Provider Call**: Show confirmation dialog \"This action may use external provider credits. Continue?\" — only when Real AI Providers Enabled = true. If Real AI Providers Enabled = false: do NOT call provider, show fallback/manual upload options.

### 4.15 Button Behavior Rules

Every button must do something useful. Generate Image: provider only if enabled, else explains and offers alternatives. Create Video Segments: always works if storyboard + duration available. Render All Segments: uses fallback, no paid providers needed. Render Full Music Video: creates preview or export package even if MP4 unavailable. Download Video: works if downloadable exists, else offers render manifest + production package.

### 4.16 Creator Memory Principle

Include a simple creator memory system for future personalization. With permission, BeatVision should remember the creator's journey, favorite styles, recurring themes, preferred worlds, character preferences, and storytelling patterns. Store creator memory data in the CreatorMemory model.

### 4.17 Authentication

Use login skill for authentication. Users must log in to access Dashboard, Create Project, and Project Results pages.

### 4.18 AI Generation

Use large-language-model skill for AI generation of Visual World Reports, Storyboard Scenes, Characters and Environment content, World Style Bible, Character Sheet, Environment Sheet, Scene Visual Prompts, Motion Settings, and Scene Motion Plans.

### 4.19 Image Generation Provider Structure

Provider-ready architecture to plug into APIs later (OpenAI image generation, Google image generation, Stability-based APIs, others). If no provider connected: build full UI, workflows, database logic, and placeholder generation structure ready for live image generation.

### 4.20 Video Generation Provider Structure

Provider-ready architecture to plug into AI video generation providers later (image-to-video providers, text-to-video, local model rendering, cloud video generation APIs). If no provider connected: build full UI, workflows, database logic, and fallback rendering structure ready for live video generation. Fallback rendering IS the first functional full video renderer.

### 4.21 Core Product Rule

BeatVision must never trap the creator. Creator can edit approved sections at any time. BeatVision explains what changed, what may be affected, and what needs review. Creator can preview the complete project in one place. Creator can export project assets at any phase.

## 5. Exceptions and Edge Cases

| Scenario | Handling |
|----------|----------|
| User uploads a non-audio file | Display error message: \"Please upload a valid audio file.\" |
| User submits Create Project form with missing required fields | Display error message: \"Please fill in all required fields.\" |
| User tries to access locked sections before approval | Display message: \"This section will unlock after you approve the previous step.\" |
| User clicks Regenerate World multiple times | Each regeneration should produce a different version of the Visual World Report |
| User clicks Refresh Scene multiple times | Each refresh should produce a different version of that scene |
| User clicks Regenerate Style Bible multiple times | Each regeneration should produce a different version |
| User clicks Regenerate Character Sheet multiple times | Each regeneration should produce a different version |
| User clicks Regenerate Environment Sheet multiple times | Each regeneration should produce a different version |
| User clicks Regenerate Scene Visual Prompt multiple times | Each regeneration should produce a different version of that scene prompt |
| User clicks Regenerate Scene Image multiple times | Each regeneration should create a new version, keep previous versions |
| User clicks Regenerate Motion Clip multiple times | Each regeneration should create a new version, keep previous versions |
| User deletes a project | Confirm deletion with a confirmation dialog before deleting |
| User submits Beta Feedback with missing fields | Allow submission even if some fields are empty |
| User navigates away from Project Results Page before completing approval workflow | Save the current state and allow the user to resume later |
| User tries to mark project as Ready for Image Generation before all world assets are approved | Display message: \"Please approve all world assets before proceeding.\" |
| User tries to mark project as Ready for Motion before all scene images are approved | Display message: \"Please approve all scene images before proceeding.\" |
| User tries to mark project as Ready for Video Rendering before all motion clips are approved | Display message: \"Please approve all motion clips before proceeding.\" |
| User tries to generate scene images before all world assets are approved | Display message: \"Please approve all world assets before generating scene images.\" |
| User tries to generate motion clips before all scene images are approved | Display message: \"Please approve all scene images before generating motion clips.\" |
| User tries to render video before all motion clips are approved | Display message: \"Please approve all motion clips before rendering video.\" |
| User tries to access Generate Scene Images Section before unlock conditions are met | Display message: \"This section will unlock after you approve all world assets and scene prompts.\" |
| User tries to access Create Motion Video Section before unlock conditions are met | Display message: \"This section will unlock after you approve all scene images.\" |
| Image generation API fails or times out | Display error message: \"Image generation failed. Please try again.\" |
| Motion clip generation fails or times out | Display error message: \"Motion clip generation failed. Please try again.\" |
| Video rendering fails or times out | Display error message: \"Video rendering failed. Please try again.\", allow retry |
| User rejects a scene image | Mark image as rejected, keep visible, allow regeneration |
| User edits approved Visual World Report | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User edits approved Storyboard Scene | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User edits approved Character Sheet | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User edits approved Scene Visual Prompt | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User edits approved Scene Image | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User edits approved Motion Settings | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User regenerates approved section | Trigger Review Changes workflow, ask user to mark affected sections as Needs Review or keep later sections unchanged |
| User tries to continue to next phase with sections marked Needs Review | Display message: \"Please review and reapprove all changed sections before continuing.\" |
| User chooses \"Keep later sections unchanged\" | Mark edited section as Updated After Approval, keep downstream sections approved, show reminder that later sections may not perfectly match |
| User clicks \"Reapprove All Reviewed Changes\" before reviewing all sections | Button remains disabled until all changed sections are reviewed |
| User clicks \"Review All Changes\" | Navigate/scroll through every section needing review |
| User clicks Full Preview button before Visual World Report + Storyboard + World Assets created | Button not visible |
| User clicks Full Preview button | Open full-screen modal with project preview |
| User clicks Close Preview button | Close modal and return to Project Results Page |
| User clicks Export Project button before Visual World Report + Storyboard exist | Button not visible |
| User clicks Export Project button | Open export panel with export options |
| User clicks export option before required data exists | Disable button or show \"Coming Soon\" |
| User clicks export option when data exists | Generate export file or allow copy of text content |
| Export process fails | Display error message: \"Export failed. Please try again.\", allow retry |
| User clicks export option multiple times | Show export status, prevent duplicate exports |
| User tries to export scene images before images exist | Disable button |
| User tries to export motion clips before motion clips exist | Disable button |
| User tries to export preview video before preview video exists | Show \"Coming Soon\" |
| User tries to export final video before video exists | Show \"Coming Soon\" |
| User clicks \"Check Motion Readiness\" and blockers exist | Display exact blockers (e.g. \"Scene Image 4 not approved\", \"Motion settings not saved\") |
| User clicks \"Check Motion Readiness\" and no blockers exist | Update project status to \"Ready for Motion\", display \"No blockers found. Render Full Music Video is available.\" |
| User clicks \"Render Full Music Video\" and rendering is blocked | Show Readiness Debug Panel with exact blockers |
| User clicks \"Render Full Music Video\" and MP4 not supported | Render WebM, label clearly: \"Preview Video Rendered as WebM\", show \"MP4 export will be available when server rendering is connected.\" |
| Rendering stays stuck pending forever | Never allow this; set render status to Failed, show exact error message, allow retry |
| Old inactive versions block rendering | Automatically exclude old inactive versions from readiness checks |
| User clicks \"Generate Image\" when Real AI Providers Enabled = false | Do NOT call provider, show fallback/manual upload options |
| User clicks \"Generate Image\" when Real AI Providers Enabled = true | Show confirmation dialog \"This action may use external provider credits. Continue?\" before calling provider |
| User clicks \"Upload Scene Image\" | Allow manual upload (manual_upload=true, real_generated=false, placeholder=false, status=Completed) |
| User clicks \"Create Placeholder Preview\" | Create placeholder (placeholder=true, real_generated=false, manual_upload=false, status=Placeholder Preview — clearly labeled, NOT counted as ready for motion unless creator clicks \"Use Placeholder As Draft Final\" with warning) |
| User clicks \"Use Placeholder As Draft Final\" | Show warning dialog, if confirmed: use_placeholder_as_draft_final=true, count toward \"Ready for Motion\" |
| User clicks \"Create Video Segments\" when storyboard exists and duration known | Always works; creates VideoSegment DB records covering full song 0:00 to end; fills gaps with nearest approved image |
| User clicks \"Render All Segments\" | Uses fallback image-motion rendering only (no paid AI required) |
| User clicks \"Render Full Music Video\" when MP4 unavailable | Creates preview or export package, shows \"Full video preview is ready. MP4 export requires server rendering.\" |
| User clicks \"Download Video\" when downloadable exists | Works |
| User clicks \"Download Video\" when downloadable does not exist | Offers render manifest + production package |
| Song duration unknown | Read from audio metadata or allow manual entry |
| Timeline gap exists | Fill gaps with nearest approved image |
| Segment rendering fails | Set render status to Failed, show exact error message, allow retry |
| User clicks \"Preview Segment\" when image exists | Always works, opens motion preview modal |
| User clicks \"Approve Segment\" | approved=true, pending=false, failed=false, render_status=Approved |
| User clicks \"Replace Segment Image\" | Replace image for that segment |
| User clicks \"Retry Failed Segment\" | Retry rendering for that segment |
| User clicks \"Download Render Manifest JSON\" | Generate and download render manifest JSON |
| Blocker panel shows vague message | Never allow this; always show exact blockers |

## 6. Acceptance Criteria

1. User lands on Landing Page, clicks \"Start Creating\", and navigates to Dashboard Page
2. User clicks \"Create New Project\" on Dashboard Page and navigates to Create Project Page
3. User fills in Project Title, uploads a song file, pastes lyrics, selects a visual style, adds optional notes, and clicks \"Reveal My World\"
4. System creates a project, generates a Visual World Report, and navigates to Project Results Page
5. User reviews the Visual World Report and clicks \"Approve World\"
6. System unlocks Storyboard Section, generates 6 to 10 storyboard scenes
7. User reviews the storyboard, approves all scenes, and clicks \"Approve Storyboard\"
8. System unlocks Characters and Environment Section, generates characters and environment content
9. User reviews the characters and environment and clicks \"Approve Characters and World\"
10. System unlocks Generate the World Section
11. User clicks \"Generate the World\" button
12. System generates World Style Bible, Character Sheet, Environment Sheet, Scene Visual Prompts, and Scene Preview Cards
13. User reviews and approves World Style Bible, Character Sheet, Environment Sheet, and all Scene Visual Prompts
14. System unlocks Image Provider Settings Section and Generate Scene Images Section
15. User configures Image Provider Settings, sets Real AI Providers Enabled to false (default), selects Manual Upload Only
16. User clicks \"Save Provider Settings\" button
17. System saves provider settings
18. User clicks \"Generate All Scene Images\" button
19. System does NOT call external API, creates placeholder records and visual mock cards
20. User clicks \"Upload Scene Image\" button for each scene
21. User uploads scene images manually
22. System marks images as manual_upload=true, real_generated=false, placeholder=false, status=Completed
23. User approves all scene images
24. System updates project status to \"Scene Images Approved\" and displays \"Ready for Motion\" message
25. System unlocks Segmented Video Renderer Section
26. User clicks \"Create Video Segments\" button
27. System creates VideoSegment DB records covering full song 0:00 to end, fills gaps with nearest approved image
28. User clicks \"Render All Segments\" button
29. System renders all segments using fallback image-motion rendering only (no paid AI required)
30. User reviews segment previews and clicks \"Approve Segment\" button for each segment
31. System marks segments as approved
32. User clicks \"Render Full Music Video\" button
33. System combines all approved segments, adds uploaded song audio, adds captions if selected, adds transitions, creates preview music video or export package
34. System displays \"Full video preview is ready. MP4 export requires server rendering.\"
35. User clicks \"Download Render Manifest JSON\" button
36. System generates and downloads render manifest JSON
37. User clicks \"Full Preview\" button
38. System opens full-screen modal with project preview
39. User navigates through scenes using Previous Scene and Next Scene buttons
40. User clicks \"Play Preview\" button
41. System starts auto-play slideshow or video
42. User clicks \"Close Preview\" button
43. System closes modal and returns to Project Results Page
44. User clicks \"Export Project\" button
45. System opens export panel with export options
46. User clicks \"Export Visual World Report\" button
47. System generates PDF or allows copy of text content
48. User clicks \"Export Storyboard\" button
49. System generates PDF or allows copy of text content
50. User clicks \"Export Scene Images\" button
51. System generates ZIP file if images exist
52. User clicks \"Export Motion Clips\" button
53. System generates ZIP file if motion clips exist
54. User clicks \"Export Preview Video\" button
55. System allows download if preview video exists
56. User clicks \"Export Final Music Video\" button
57. System allows download if final video exists
58. User clicks \"Export Full Project Package\" button
59. System generates JSON/ZIP file with all project data
60. User submits Beta Feedback
61. System saves the feedback and displays \"Feedback saved. This helps improve BeatVision.\"

## 7. Out of Scope for This Release

- Real-time collaboration between multiple users
- Advanced AI settings or prompt engineering options
- Integration with external video editing tools
- Social sharing features (like, comment, share)
- Payment or subscription system
- Multi-language support beyond English
- Mobile native app (iOS/Android)
- Advanced analytics or reporting dashboard
- Batch project creation or bulk operations
- Version history or rollback functionality for projects beyond scene image versions and motion clip versions
- Custom visual style creation by users
- Audio editing or mixing features
- Automatic lyric synchronization with audio timestamps
- Advanced character customization tools
- Advanced environment customization tools
- Real-time preview rendering during editing
- Batch image generation for multiple projects
- Advanced image editing tools within BeatVision
- Watermarking or branding options for generated images or videos
- Automatic conflict resolution for changed sections
- Bulk reapproval of multiple sections at once beyond \"Reapprove All Reviewed Changes\"
- Detailed diff view showing exact field-level changes
- Undo/redo functionality for edits
- Advanced export customization options
- Scheduled or automated exports
- Export to external cloud storage services
- Export format customization beyond provided options
- Batch export of multiple projects
- Export history or export analytics
- Advanced motion customization tools beyond provided motion effects
- Frame-by-frame video editing
- Multi-track audio mixing
- Advanced color grading or visual effects
- 3D rendering or animation
- Live streaming or real-time video generation
- AI voice generation or text-to-speech for lyrics
- Automatic beat detection or tempo analysis
- Multi-camera angle support
- Green screen or chroma key effects
- Advanced transition effects beyond provided options
- Custom font or typography options for captions
- Subtitle or closed caption generation
- Multi-language caption support
- Accessibility features (audio descriptions, sign language)
- Video compression or optimization tools
- Batch video rendering for multiple projects
- Cloud rendering or distributed rendering
- GPU acceleration or hardware encoding options
- Video quality comparison or A/B testing
- Video analytics or performance metrics
- Video hosting or CDN integration
- Video monetization or advertising features
- Video rights management or licensing tools