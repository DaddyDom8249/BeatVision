"""Isolated LTX 2B image-to-video worker for BragoraForge/BeatVision.

No public URL endpoint and no remote execution in a local dry run. Only a
server-authorized caller may provide an approved scene image. The Modal SDK's
account ACL protects remote invocation; the frontend must never call it.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import tempfile
import uuid
from pathlib import Path

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_VIDEO_BYTES = 24 * 1024 * 1024
MODEL_ID = "Lightricks/LTX-Video-0.9.5"  # documented 2B Diffusers image-to-video
WIDTH, HEIGHT, FRAMES, FPS = 704, 512, 41, 24

try:
    import modal
except ImportError:  # local preflight and unit tests require no Modal credentials
    modal = None


class ContractError(ValueError):
    pass


def _uid(value, name):
    try:
        return str(uuid.UUID(value))
    except (TypeError, ValueError, AttributeError):
        raise ContractError(f"{name} must be a UUID") from None


def inspect_image(image_bytes):
    """Validate untrusted bytes locally; never fetch arbitrary user-supplied URLs."""
    if not isinstance(image_bytes, bytes) or not (100 <= len(image_bytes) <= MAX_IMAGE_BYTES):
        raise ContractError("IMAGE_SIZE_INVALID")
    if not (image_bytes.startswith(b"\x89PNG\r\n\x1a\n") or image_bytes[:3] == b"\xff\xd8\xff"):
        raise ContractError("IMAGE_TYPE_INVALID")
    from PIL import Image, UnidentifiedImageError
    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            if im.format not in ("PNG", "JPEG") or im.width > 2048 or im.height > 2048 or im.width < 64 or im.height < 64:
                raise ContractError("IMAGE_DIMENSIONS_INVALID")
            im.verify()
        with Image.open(io.BytesIO(image_bytes)) as im:
            im.load()
            if im.width * im.height > 2048 * 2048:
                raise ContractError("IMAGE_DIMENSIONS_INVALID")
            return {"width": im.width, "height": im.height, "format": im.format}
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise ContractError("IMAGE_DECODE_INVALID") from error


def preflight(project_id, scene_id, source_image_id, job_id, prompt, image_bytes):
    """Input-only proof: never marks a video as generated or a scene as approved."""
    ids = {n: _uid(v, n) for n, v in (("project_id", project_id), ("scene_id", scene_id),
                                      ("source_image_id", source_image_id), ("job_id", job_id))}
    if not isinstance(prompt, str) or not 8 <= len(prompt.strip()) <= 1500:
        raise ContractError("PROMPT_INVALID")
    image = inspect_image(image_bytes)
    digest = hashlib.sha256(image_bytes).hexdigest()
    # Job-scoped SHA is a correlation key. Durable de-duplication belongs to
    # BeatVision's generation controller, not this stateless GPU function.
    canonical = json.dumps({**ids, "model": MODEL_ID, "image_sha256": digest,
                            "prompt": prompt.strip(), "frames": FRAMES}, sort_keys=True)
    return {"status": "preflight_only", "model": MODEL_ID, **ids, "image_sha256": digest,
            "request_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
            "image": image, "frames_requested": FRAMES, "fps": FPS,
            "gpu_executed": False, "media_generated": False}


def approval_present():
    # Both flags must be explicitly provisioned after verifying account cost.
    return (os.getenv("BRAGORA_MODAL_GPU_ENABLED") == "YES" and
            os.getenv("BRAGORA_MODAL_BILLING_CONFIRMED") == "YES")


def render_ltx(project_id, scene_id, source_image_id, job_id, prompt, image_bytes):
    """GPU-side inference; performs zero model/download work before strict approval."""
    contract = preflight(project_id, scene_id, source_image_id, job_id, prompt, image_bytes)
    if not approval_present():
        raise ContractError("GPU_EXECUTION_NOT_AUTHORIZED")
    import torch
    from PIL import Image, ImageOps
    from diffusers import LTXConditionPipeline
    from diffusers.utils import export_to_video
    if not torch.cuda.is_available():
        raise ContractError("CUDA_UNAVAILABLE")
    # Modal L4 has BF16 support; never use the T4 for this BF16 pipeline.
    source = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    source = ImageOps.fit(source, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS)
    pipeline = LTXConditionPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16)
    pipeline.enable_model_cpu_offload()
    pipeline.vae.enable_tiling()
    generator = torch.Generator(device="cuda").manual_seed(uuid.UUID(job_id).int % (2**31 - 1))
    # Actual image-conditioned diffusion, not a still-image zoom/pan.
    frames = pipeline(image=source, prompt=prompt.strip(), width=WIDTH, height=HEIGHT,
                      num_frames=FRAMES, frame_rate=FPS, num_inference_steps=24,
                      generator=generator).frames[0]
    if len(frames) < 2:
        raise ContractError("VIDEO_FRAMES_MISSING")
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, "motion.mp4")
        export_to_video(frames, path, fps=FPS)
        mp4 = Path(path).read_bytes()
    if not (1024 < len(mp4) <= MAX_VIDEO_BYTES and b"ftyp" in mp4[:32]):
        raise ContractError("VIDEO_OUTPUT_INVALID")
    return {**contract, "status": "generated_unapproved", "gpu_executed": True,
            "media_generated": True, "video_sha256": hashlib.sha256(mp4).hexdigest(),
            "video_size_bytes": len(mp4), "video_base64": base64.b64encode(mp4).decode(),
            "container": "mp4", "duration_requested_seconds": FRAMES / FPS,
            "needs_authoritative_storage_and_creator_approval": True}


# Importing this module never deploys, loads weights, fetches images or runs a GPU.
if modal is not None:
    app = modal.App("bragoraforge-ltx-2b-motion-private")
    gpu_image = (modal.Image.debian_slim(python_version="3.11")
                 .apt_install("ffmpeg")
                 .pip_install("torch==2.6.0", "diffusers==0.35.2", "transformers==4.53.3",
                              "accelerate==1.9.0", "pillow==11.3.0", "sentencepiece==0.2.1",
                              "imageio==2.37.0", "imageio-ffmpeg==0.6.0", "protobuf==6.31.1"))

    @app.function(image=gpu_image, gpu="L4", max_containers=1,
                  timeout=300, scaledown_window=2,
                  secrets=[modal.Secret.from_name("bragora-modal-activation")])
    def generate_motion(project_id: str, scene_id: str, source_image_id: str,
                        job_id: str, prompt: str, image_bytes: bytes) -> dict:
        # Private Modal RPC, not an HTTP endpoint; access controlled by Modal.
        return render_ltx(project_id, scene_id, source_image_id, job_id, prompt, image_bytes)

    @app.local_entrypoint()
    def run_gpu(project_id: str, scene_id: str, source_image_id: str, job_id: str,
                prompt: str, image_path: str, output_path: str, acknowledge_spend: bool = False):
        if not acknowledge_spend or not approval_present():
            raise ContractError("GPU_EXECUTION_NOT_AUTHORIZED")
        data = Path(image_path).read_bytes()
        preflight(project_id, scene_id, source_image_id, job_id, prompt, data)
        result = generate_motion.remote(project_id, scene_id, source_image_id, job_id, prompt, data)
        mp4 = base64.b64decode(result.pop("video_base64"), validate=True)
        Path(output_path).write_bytes(mp4)
        # Saved to local path only. Never approves or mutates project data.
        print(json.dumps({**result, "local_output_path": output_path}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description="Local no-GPU LTX motion preflight")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--scene-id", required=True)
    parser.add_argument("--source-image-id", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--image-path", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(preflight(args.project_id, args.scene_id, args.source_image_id,
                                   args.job_id, args.prompt, Path(args.image_path).read_bytes()), sort_keys=True))
    except (ContractError, OSError) as error:
        print(json.dumps({"status": "rejected", "error": str(error)}, sort_keys=True))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
