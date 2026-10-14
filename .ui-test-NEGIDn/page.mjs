import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "./stub.mjs";
import { getCreativeErrorMessage } from "./formatCreativeText.mjs";
import TakeHistory from "../components/scenes/TakeHistory";
import { numberTakes, approvedTake, displayedTake, hasConflictingApprovals } from "../lib/beatvision/scenes/takes";
const planFields = "id,project_id,world_report_id,style_bible_id,song_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";
const imageFields = "id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved,created_at,updated_at";
function productionErrorMessage(error) {
    const message = typeof error === "string" ? error : getCreativeErrorMessage(error, "Production request failed.");
    if (message.includes("SCENE_IMAGE_HAS_APPROVED_MOTION"))
        return "This image drives an approved motion clip. Replace that motion take before changing the approved image.";
    if (message.includes("APPROVAL_CHANGED"))
        return "The approved take changed elsewhere. Takes were reloaded; review before replacing again.";
    if (message.includes("ALREADY_APPROVED"))
        return "This scene already has an approved take. Use Replace Approved Take to swap it intentionally.";
    if (message.includes("ASSEMBLY_MOTION_NOT_FULLY_APPROVED")) {
        return "Approve a real motion clip for every scene before assembling the final video.";
    }
    return message;
}
function time(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}
function prompt(scene) {
    return [
        "SCENE " + scene.scene_number + ": " + scene.title,
        "TIME: " + time(scene.start_time) + "–" + time(scene.end_time),
        "LOCATION: " + scene.location,
        "MOOD: " + scene.mood,
        "VISUAL: " + scene.visual_direction,
        "CAMERA: " + scene.camera_direction,
        "MOVEMENT: " + scene.movement_direction,
        "MUSICAL / LYRIC MOMENT: " + (scene.lyric_moment || "Follow the analyzed musical section."),
        "TRANSITION: " + scene.transition_style,
        "CONTINUITY: " + scene.continuity_notes,
    ].join("\n");
}
export default function ProductionWorkspacePage({ projectId }) {
    const [plan, setPlan] = useState(null);
    const [scenes, setScenes] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [imageTakes, setImageTakes] = useState([]);
    const [motionTakes, setMotionTakes] = useState([]);
    const [viewImageId, setViewImageId] = useState(null);
    const [viewMotionId, setViewMotionId] = useState(null);
    const [keyframes, setKeyframes] = useState(null);
    // Explicit confirmation gates: a retake is a new paid-capable provider job,
    // and replacing an approved take intentionally unapproves the old one.
    const [confirming, setConfirming] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [motionGenerating, setMotionGenerating] = useState(false);
    const [finalVideo, setFinalVideo] = useState(null);
    const [assemblyJob, setAssemblyJob] = useState(null);
    const [assemblyRunning, setAssemblyRunning] = useState(false);
    const [assemblyReadiness, setAssemblyReadiness] = useState({ ready: false, message: "Checking approved motion clips…" });
    const [imageJob, setImageJob] = useState(null);
    const [motionJob, setMotionJob] = useState(null);
    const [assetLoading, setAssetLoading] = useState(false);
    const scene = scenes[selectedIndex] ?? null;
    const selectedSceneId = useRef(scene?.id);
    selectedSceneId.current = scene?.id;
    const busy = generating || motionGenerating || assemblyRunning || assetLoading;
    const pending = (job) => ["queued", "submitted", "processing"].includes(job?.status);
    const image = useMemo(() => displayedTake(imageTakes, viewImageId), [imageTakes, viewImageId]);
    const motion = useMemo(() => displayedTake(motionTakes, viewMotionId), [motionTakes, viewMotionId]);
    const approvedImage = approvedTake(imageTakes);
    const approvedMotion = approvedTake(motionTakes);
    const productionText = useMemo(() => scene ? prompt(scene) : "", [scene]);
    async function displayImage(asset) {
        if (!asset?.storage_path)
            return asset;
        const result = await supabase.functions.invoke("beatvision-generation", {
            body: { action: "image_url", projectId, assetId: asset.id },
        });
        if (result.error)
            throw result.error;
        if (!result.data?.image_url)
            throw new Error("No fresh image URL was returned.");
        return { ...asset, image_url: result.data.image_url };
    }
    const refreshScene = useCallback(async (sceneId) => {
        const [images, motions, imageJobs, motionJobs] = await Promise.all([
            supabase.from("scene_image_assets").select(imageFields).eq("scene_id", sceneId).order("created_at", { ascending: false }),
            supabase.from("motion_clip_assets").select("*").eq("scene_id", sceneId).order("created_at", { ascending: false }),
            supabase.from("generation_jobs").select("id,status,error,job_type,output").eq("project_id", projectId).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_image").order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("generation_jobs").select("id,status,error,job_type,output").eq("project_id", projectId).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_motion").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        for (const result of [images, motions, imageJobs, motionJobs])
            if (result.error)
                throw result.error;
        // Keyframe selection is optional: older databases without the table keep working.
        const frames = await supabase.from("scene_keyframe_selections").select("first_frame_asset_id,last_frame_asset_id").eq("scene_id", sceneId).maybeSingle();
        if (selectedSceneId.current !== sceneId)
            return;
        setMotionTakes(numberTakes(motions.data ?? []));
        setImageJob(imageJobs.data);
        setMotionJob(motionJobs.data);
        setKeyframes(frames.error ? null : frames.data ?? null);
        const freshImages = await Promise.all((images.data ?? []).map((row) => displayImage(row)));
        if (selectedSceneId.current === sceneId)
            setImageTakes(numberTakes(freshImages));
    }, [projectId]);
    const refreshFinal = useCallback(async (planId) => {
        const result = await supabase.from("generation_jobs").select("id,status,output,error").eq("project_id", projectId).eq("visual_plan_id", planId).eq("job_type", "assembly").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (result.error)
            throw result.error;
        setAssemblyJob(result.data);
        // Show only the final output belonging to this locked plan's completed job.
        setFinalVideo(result.data?.status === "completed" ? result.data.output?.final_video ?? null : null);
    }, [projectId]);
    const refreshAssemblyReadiness = useCallback(async (planId) => {
        let status = { ready: false, message: "Unable to verify approved motion. Assembly remains unavailable." };
        try {
            // Do not rely on the selected scene or the newest attempt: approved
            // motion from an earlier job can remain authoritative after a retry.
            const [sceneResult, motionResult] = await Promise.all([
                supabase.from("visual_plan_scenes").select("id,status").eq("project_id", projectId).eq("visual_plan_id", planId),
                supabase.from("motion_clip_assets").select("id,scene_id,status,approved,video_url").eq("project_id", projectId).eq("visual_plan_id", planId).eq("status", "approved").eq("approved", true),
            ]);
            if (sceneResult.error)
                throw sceneResult.error;
            if (motionResult.error)
                throw motionResult.error;
            const allScenes = sceneResult.data ?? [];
            const approved = motionResult.data ?? [];
            if (!allScenes.length) {
                status = { ready: false, message: "No approved scenes are available for final assembly." };
            }
            else if (allScenes.some(row => row.status !== "approved")) {
                status = { ready: false, message: "Approve every scene before final assembly." };
            }
            else {
                const counts = new Map();
                for (const clip of approved) {
                    if (clip.status === "approved" && clip.approved === true && clip.video_url) {
                        counts.set(clip.scene_id, (counts.get(clip.scene_id) ?? 0) + 1);
                    }
                }
                const remaining = allScenes.filter(row => counts.get(row.id) !== 1).length;
                status = remaining
                    ? { ready: false, message: `${remaining} of ${allScenes.length} scenes still need exactly one approved real motion clip.` }
                    : { ready: approved.length === allScenes.length, message: "All scene motion is approved. Final assembly is available." };
                // Extra approved rows (including stale or wrong-scene records) must
                // never make the UI more permissive than the server-side RPC.
                if (!remaining && approved.length !== allScenes.length) {
                    status = { ready: false, message: "Motion approval records are inconsistent. Final assembly is unavailable." };
                }
            }
        }
        catch (e) {
            status = { ready: false, message: "Could not check approved motion: " + productionErrorMessage(e) };
        }
        setAssemblyReadiness(status);
        return status;
    }, [projectId]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);
        setPlan(null);
        setScenes([]);
        setSelectedIndex(0);
        setAssemblyReadiness({ ready: false, message: "Checking approved motion clips…" });
        (async () => {
            try {
                const result = await supabase.from("visual_plans").select(planFields).eq("project_id", projectId).eq("status", "approved").single();
                if (result.error)
                    throw new Error("Lock the Visual Plan before entering Production.");
                const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields).eq("visual_plan_id", result.data.id).eq("status", "approved").order("scene_number", { ascending: true });
                if (sceneResult.error)
                    throw sceneResult.error;
                if (!active)
                    return;
                setPlan(result.data);
                setScenes((sceneResult.data ?? []));
                await Promise.all([refreshFinal(result.data.id), refreshAssemblyReadiness(result.data.id)]);
            }
            catch (e) {
                if (active)
                    setError(productionErrorMessage(e));
            }
            finally {
                if (active)
                    setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [projectId, refreshFinal, refreshAssemblyReadiness]);
    useEffect(() => {
        let active = true;
        setImageTakes([]);
        setMotionTakes([]);
        setViewImageId(null);
        setViewMotionId(null);
        setKeyframes(null);
        setConfirming(null);
        setImageJob(null);
        setMotionJob(null);
        setError(null);
        if (!scene)
            return;
        setAssetLoading(true);
        refreshScene(scene.id).catch(e => { if (active)
            setError(productionErrorMessage(e)); }).finally(() => { if (active)
            setAssetLoading(false); });
        return () => { active = false; };
    }, [scene?.id, refreshScene]);
    useEffect(() => {
        if (!scene || !plan)
            return;
        // Jobs can finish in the scheduler even when the initial browser request fails.
        const interval = pending(imageJob) || pending(motionJob) || pending(assemblyJob) ? 5000 : 50 * 60 * 1000;
        let active = true;
        const timer = window.setInterval(() => {
            Promise.all([refreshScene(scene.id), refreshFinal(plan.id)]).catch(e => { if (active)
                setError(productionErrorMessage(e)); });
        }, interval);
        return () => { active = false; window.clearInterval(timer); };
    }, [scene?.id, plan?.id, imageJob?.status, motionJob?.status, assemblyJob?.status, refreshScene, refreshFinal]);
    async function operateJob(type, existing) {
        if (!scene || !plan)
            return;
        const sceneId = scene.id;
        const setBusy = type === "scene_image" ? setGenerating : type === "scene_motion" ? setMotionGenerating : setAssemblyRunning;
        const setJob = type === "scene_image" ? setImageJob : type === "scene_motion" ? setMotionJob : setAssemblyJob;
        setBusy(true);
        setError(null);
        try {
            let job = existing;
            if (!job && type === "assembly") {
                // Recheck at click time: the rendered readiness can be stale after
                // another browser tab revokes or supersedes a motion approval.
                const current = await refreshAssemblyReadiness(plan.id);
                if (!current.ready)
                    throw new Error(current.message);
            }
            if (!job) {
                const queued = type === "assembly"
                    ? await supabase.rpc("enqueue_assembly_generation", { p_project_id: projectId, p_visual_plan_id: plan.id })
                    : await supabase.rpc("enqueue_scene_generation", { p_project_id: projectId, p_scene_id: sceneId, p_job_type: type });
                if (queued.error)
                    throw queued.error;
                job = queued.data;
            }
            if (!job?.id)
                throw new Error("No generation job was returned.");
            setJob(job);
            const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: job.id, action: job.status === "processing" ? "poll" : "run" } });
            if (run.error)
                throw run.error;
            const result = run.data?.job;
            if (!result?.id)
                throw new Error("Generation controller returned no job state.");
            // Fetch persisted assets, then retain the authoritative response if a replica
            // has not observed the latest job write yet.
            if (type === "assembly")
                await refreshFinal(plan.id);
            else
                await refreshScene(sceneId);
            setJob(result);
            if (result.status === "failed")
                throw new Error(result.error?.message || "Generation failed.");
            if (type === "assembly" && result.status === "completed")
                setFinalVideo(result.output?.final_video ?? null);
        }
        catch (e) {
            setError(productionErrorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    const generateImage = () => operateJob("scene_image");
    const generateMotion = () => operateJob("scene_motion");
    const checkMotionStatus = () => operateJob("scene_motion", motionJob);
    const assembleFinal = () => operateJob("assembly");
    const checkAssemblyStatus = () => operateJob("assembly", assemblyJob);
    async function approveMotion() {
        if (!motion || motion.status !== "generated" || !motion.video_url)
            return;
        // Swapping an approved take must be confirmed and go through the replace RPC.
        if (approvedMotion && approvedMotion.id !== motion.id && confirming !== "replace_motion") {
            setConfirming("replace_motion");
            return;
        }
        setError(null);
        setConfirming(null);
        const result = approvedMotion
            ? await supabase.rpc("replace_approved_motion_clip", { p_asset_id: motion.id, p_expected_current_id: approvedMotion.id })
            : await supabase.rpc("approve_motion_clip_asset", { p_asset_id: motion.id });
        if (result.error)
            setError(productionErrorMessage(result.error));
        if (scene)
            await refreshScene(scene.id).catch(e => setError(productionErrorMessage(e)));
        if (plan)
            await refreshAssemblyReadiness(plan.id);
    }
    async function approveImage() {
        if (!image || image.status !== "generated" || !image.image_url)
            return;
        if (approvedImage && approvedImage.id !== image.id && confirming !== "replace_image") {
            setConfirming("replace_image");
            return;
        }
        setError(null);
        setConfirming(null);
        const result = approvedImage
            ? await supabase.rpc("replace_approved_scene_image", { p_asset_id: image.id, p_expected_current_id: approvedImage.id })
            : await supabase.rpc("approve_scene_image_asset", { p_asset_id: image.id });
        if (result.error)
            setError(productionErrorMessage(result.error));
        if (scene)
            await refreshScene(scene.id).catch(e => setError(productionErrorMessage(e)));
    }
    async function setFrame(role, assetId) {
        if (!scene)
            return;
        setError(null);
        const result = await supabase.rpc("set_scene_keyframe", { p_scene_id: scene.id, p_role: role, p_asset_id: assetId });
        if (result.error)
            setError(productionErrorMessage(result.error));
        else
            setKeyframes(result.data ?? null);
    }
    function confirmRetake(kind) {
        setConfirming(null);
        setViewImageId(null);
        setViewMotionId(null);
        void (kind === "retake_image" ? generateImage() : generateMotion());
    }
    async function copyBrief() {
        if (!productionText)
            return;
        await navigator.clipboard.writeText(productionText);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    }
    if (loading)
        return _jsx("main", { className: "studio-main production-page", children: _jsx("div", { className: "style-loading", children: "Loading Production Workspace\u2026" }) });
    if (!plan || !scene) {
        return (_jsxs("main", { className: "studio-main production-page", children: [_jsx("header", { className: "style-header", children: _jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "PHASE 5 / PRODUCTION" }), _jsx("h1", { children: "Production Workspace" })] }) }), _jsxs("section", { className: "style-empty-panel", children: [_jsx("p", { className: "form-error", role: "alert", children: error ?? "No approved production scenes found." }), _jsx("a", { className: "secondary-button", href: `/projects/${projectId}/scenes`, children: "Return to Production Brief" })] })] }));
    }
    return (_jsxs("main", { className: "studio-main production-page", children: [_jsxs("header", { className: "style-header", children: [_jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "PHASE 5 / PRODUCTION WORKSPACE" }), _jsx("h1", { children: "Build the shots from the locked direction." }), _jsxs("p", { children: [plan.title, " is approved. Select a scene, review its production brief, and carry the locked creative direction into your production tools."] })] }), _jsxs("div", { className: "style-status", children: ["PLAN LOCKED / ", scenes.length, " SCENES"] })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), (pending(imageJob) || pending(motionJob) || pending(assemblyJob)) && _jsx("p", { role: "status", children: "Generation is still processing. Status refreshes automatically; no completed media is claimed yet." }), [imageJob, motionJob, assemblyJob].filter(job => job?.status === "failed").map(job => _jsx("p", { className: "form-error", role: "alert", children: job.error?.message || "Generation failed." }, job.id)), _jsxs("div", { className: "production-nav", children: [_jsx("a", { className: "secondary-button", href: `/projects/${projectId}/visual-plan`, children: "\u2190 Visual Plan" }), _jsx("a", { className: "secondary-button", href: `/projects/${projectId}/scenes`, children: "Production Briefs" })] }), _jsxs("section", { className: "production-layout", children: [_jsxs("aside", { className: "production-scene-list", children: [_jsx("span", { className: "panel-label", children: "SCENES" }), scenes.map((item, index) => (_jsxs("button", { disabled: busy, className: index === selectedIndex ? "production-scene selected" : "production-scene", onClick: () => setSelectedIndex(index), children: [_jsxs("span", { children: ["SCENE ", String(item.scene_number).padStart(2, "0")] }), _jsx("strong", { children: item.title }), _jsxs("small", { children: [time(item.start_time), " \u2014 ", time(item.end_time)] })] }, item.id)))] }), _jsxs("section", { className: "production-detail", children: [_jsxs("div", { className: "production-detail-head", children: [_jsxs("div", { children: [_jsxs("span", { className: "eyebrow", children: ["SCENE ", String(scene.scene_number).padStart(2, "0")] }), _jsx("h2", { children: scene.title }), _jsxs("p", { children: [time(scene.start_time), " \u2014 ", time(scene.end_time), " \u00B7 ", scene.location] })] }), _jsx("span", { className: "style-lock-badge", children: "APPROVED" })] }), _jsxs("div", { className: "production-grid", children: [_jsxs("article", { children: [_jsx("span", { children: "Visual" }), _jsx("p", { children: scene.visual_direction })] }), _jsxs("article", { children: [_jsx("span", { children: "Camera" }), _jsx("p", { children: scene.camera_direction })] }), _jsxs("article", { children: [_jsx("span", { children: "Movement" }), _jsx("p", { children: scene.movement_direction })] }), _jsxs("article", { children: [_jsx("span", { children: "Mood" }), _jsx("p", { children: scene.mood })] }), _jsxs("article", { children: [_jsx("span", { children: "Transition" }), _jsx("p", { children: scene.transition_style })] }), _jsxs("article", { children: [_jsx("span", { children: "Continuity" }), _jsx("p", { children: scene.continuity_notes })] }), _jsxs("article", { className: "production-wide", children: [_jsx("span", { children: "Lyric / musical moment" }), _jsx("p", { children: scene.lyric_moment || "Follow the analyzed musical section." })] })] }), _jsxs("div", { className: "production-actions", children: [_jsx("button", { className: "primary-button", onClick: () => void copyBrief(), children: copied ? "Copied" : "Copy Shot Brief" }), _jsx("button", { className: "secondary-button", disabled: busy || selectedIndex === 0, onClick: () => setSelectedIndex((value) => Math.max(0, value - 1)), children: "Previous Scene" }), _jsx("button", { className: "secondary-button", disabled: busy || selectedIndex === scenes.length - 1, onClick: () => setSelectedIndex((value) => Math.min(scenes.length - 1, value + 1)), children: "Next Scene" })] }), _jsxs("div", { className: "production-provider-note", children: [_jsx("span", { className: "panel-label", children: "SCENE IMAGE" }), hasConflictingApprovals(imageTakes) && _jsx("p", { role: "alert", children: "More than one image take is approved for this scene. Approval is blocked until the database is reconciled." }), image && _jsx("p", { children: "Viewing Take " + image.take_number + (image.id === approvedImage?.id ? " · approved" : " · candidate") }), image?.image_url ? _jsx("img", { src: image.image_url, alt: scene.title, style: { width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 12 } }) : _jsx("p", { children: "No real scene image exists yet. Generation is only enabled from the approved Scene Direction." }), _jsx(TakeHistory, { label: "Image", takes: imageTakes, viewingId: image?.id ?? null, disabled: busy, keyframes: keyframes ?? { first_frame_asset_id: null, last_frame_asset_id: null }, onView: setViewImageId, onSetFrame: (role, id) => void setFrame(role, id) }), _jsxs("div", { className: "production-actions", children: [!imageTakes.length
                                                ? _jsx("button", { className: "primary-button", disabled: busy || pending(imageJob), onClick: () => void generateImage(), children: generating ? "Generating…" : "Generate Scene Image" })
                                                : _jsx("button", { className: "secondary-button", disabled: busy || pending(imageJob) || confirming !== null, onClick: () => setConfirming("retake_image"), children: generating ? "Generating…" : "Retake Image" }), pending(imageJob) && _jsx("button", { className: "secondary-button", disabled: busy, onClick: () => void operateJob("scene_image", imageJob), children: "Check Image Status" }), image?.status === "generated" && !hasConflictingApprovals(imageTakes) && _jsx("button", { className: "secondary-button", disabled: busy || confirming !== null, onClick: () => void approveImage(), children: approvedImage ? "Replace Approved Take" : "Approve Image" }), image?.status === "approved" && _jsx("span", { className: "style-lock-badge", children: "IMAGE APPROVED" })] }), confirming === "retake_image" && _jsxs("div", { role: "dialog", "aria-label": "Confirm image retake", children: [_jsx("p", { children: "A retake starts a new provider generation job. It adds a new take; existing takes, including the approved one, are kept unchanged." }), _jsx("button", { className: "primary-button", onClick: () => confirmRetake("retake_image"), children: "Confirm Image Retake" }), _jsx("button", { className: "secondary-button", onClick: () => setConfirming(null), children: "Cancel" })] }), confirming === "replace_image" && approvedImage && image && _jsxs("div", { role: "dialog", "aria-label": "Confirm approved image replacement", children: [_jsx("p", { children: "This will unapprove Take " + approvedImage.take_number + " and approve Take " + image.take_number + ". Take " + approvedImage.take_number + " is kept in history." }), _jsx("button", { className: "primary-button", onClick: () => void approveImage(), children: "Confirm Replace Approved Image" }), _jsx("button", { className: "secondary-button", onClick: () => setConfirming(null), children: "Cancel" })] })] }), _jsxs("div", { className: "production-provider-note", children: [_jsx("span", { className: "panel-label", children: "MOTION" }), hasConflictingApprovals(motionTakes) && _jsx("p", { role: "alert", children: "More than one motion take is approved for this scene. Approval is blocked until the database is reconciled." }), motion && _jsxs("p", { children: ["Viewing Take " + motion.take_number + " · ", motion.model === "image-motion" || (motionJob?.id === motion.generation_job_id && motionJob?.output?.arena_response?.result?.generation_type === "PROCEDURAL_MOTION") ? "Procedural image animation (pan/zoom), not AI-generated subject motion." : `Provider: ${motion.provider} · Model: ${motion.model}`] }), motion?.video_url ? _jsx("video", { src: motion.video_url, controls: true, playsInline: true, style: { width: "100%", maxHeight: 520, borderRadius: 12 } }) : _jsx("p", { children: "No real motion clip exists yet. Motion requires an approved real scene image." }), _jsx(TakeHistory, { label: "Motion", takes: motionTakes, viewingId: motion?.id ?? null, disabled: busy, onView: setViewMotionId }), _jsxs("div", { className: "production-actions", children: [!pending(motionJob) && (!motionTakes.length
                                                ? _jsx("button", { className: "primary-button", disabled: busy || !approvedImage, onClick: () => void generateMotion(), children: motionGenerating ? "Starting Motion…" : "Generate Motion" })
                                                : _jsx("button", { className: "secondary-button", disabled: busy || !approvedImage || confirming !== null, onClick: () => setConfirming("retake_motion"), children: motionGenerating ? "Starting Motion…" : "Retake Motion" })), pending(motionJob) && _jsx("button", { className: "secondary-button", disabled: busy, onClick: () => void checkMotionStatus(), children: motionGenerating ? "Checking…" : "Check Motion Status" }), motion?.status === "generated" && !hasConflictingApprovals(motionTakes) && _jsx("button", { className: "secondary-button", disabled: busy || confirming !== null, onClick: () => void approveMotion(), children: approvedMotion ? "Replace Approved Motion" : "Approve Motion" }), motion?.status === "approved" && _jsx("span", { className: "style-lock-badge", children: "MOTION APPROVED" })] }), confirming === "retake_motion" && _jsxs("div", { role: "dialog", "aria-label": "Confirm motion retake", children: [_jsx("p", { children: "A retake starts a new provider motion job from the approved image. It adds a new take; existing clips are kept unchanged." }), _jsx("button", { className: "primary-button", onClick: () => confirmRetake("retake_motion"), children: "Confirm Motion Retake" }), _jsx("button", { className: "secondary-button", onClick: () => setConfirming(null), children: "Cancel" })] }), confirming === "replace_motion" && approvedMotion && motion && _jsxs("div", { role: "dialog", "aria-label": "Confirm approved motion replacement", children: [_jsx("p", { children: "This will unapprove Take " + approvedMotion.take_number + " and approve Take " + motion.take_number + ". Take " + approvedMotion.take_number + " is kept in history." }), _jsx("button", { className: "primary-button", onClick: () => void approveMotion(), children: "Confirm Replace Approved Motion" }), _jsx("button", { className: "secondary-button", onClick: () => setConfirming(null), children: "Cancel" })] })] }), _jsxs("div", { className: "production-provider-note", children: [_jsx("span", { className: "panel-label", children: "FINAL ASSEMBLY" }), finalVideo?.video_url ? _jsx("video", { src: finalVideo.video_url, controls: true, playsInline: true, style: { width: "100%", maxHeight: 600, borderRadius: 12 } }) : _jsx("p", { children: "No completed final video exists yet. Assembly requires every approved scene to have an approved real motion clip." }), !finalVideo && _jsx("p", { role: "status", children: assemblyReadiness.message }), _jsxs("div", { className: "production-actions", children: [!finalVideo && !pending(assemblyJob) && _jsx("button", { className: "primary-button", disabled: busy || !assemblyReadiness.ready, onClick: () => void assembleFinal(), children: assemblyRunning ? "Starting Assembly…" : "Assemble Final Video" }), pending(assemblyJob) && _jsx("button", { className: "secondary-button", disabled: busy, onClick: () => void checkAssemblyStatus(), children: assemblyRunning ? "Checking…" : "Check Assembly Status" }), finalVideo?.video_url && _jsx("span", { className: "style-lock-badge", children: "FINAL VIDEO COMPLETE" })] })] }), _jsxs("div", { className: "production-provider-note", children: [_jsx("span", { className: "panel-label", children: "GENERATION" }), _jsx("h3", { children: "Provider generation is authenticated and database-authoritative." }), _jsx("p", { children: "Scene images, motion clips, and final assembly are accepted only when real provider media is persisted against the locked project lineage. Missing provider output remains a failure." })] })] })] })] }));
}
