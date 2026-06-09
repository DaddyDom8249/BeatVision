import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Film } from 'lucide-react';
import type { SceneMotionPlan, SceneImage } from '@/types/types';

interface Props {
  plan: SceneMotionPlan;
  image: SceneImage | undefined;
  onClose: () => void;
}

// ── Canvas motion engine (shared with MotionClipSection) ─────────────────────

function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  progress: number,
  motionEffect: string,
  captionText: string | null,
) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const ease = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  let dx = 0, dy = 0, dw = W, dh = H;

  switch (motionEffect) {
    case 'Slow Zoom In': {
      const s = 1 + ease * 0.15;
      dw = W * s; dh = H * s;
      dx = (W - dw) / 2; dy = (H - dh) / 2;
      break;
    }
    case 'Slow Zoom Out': {
      const s = 1.15 - ease * 0.15;
      dw = W * s; dh = H * s;
      dx = (W - dw) / 2; dy = (H - dh) / 2;
      break;
    }
    case 'Pan Left':
      dx = -ease * W * 0.09; dw = W + Math.abs(dx); break;
    case 'Pan Right':
      dx = ease * W * 0.09; dw = W + Math.abs(dx); break;
    case 'Tilt Up':
      dy = -ease * H * 0.09; dh = H + Math.abs(dy); break;
    case 'Tilt Down':
      dy = ease * H * 0.09; dh = H + Math.abs(dy); break;
    case 'Parallax Drift':
      dx = Math.sin(progress * Math.PI * 2) * W * 0.03;
      dy = Math.cos(progress * Math.PI * 2) * H * 0.02;
      break;
    case 'Subtle Shake': {
      const k = Math.sin(progress * Math.PI * 14) * 5;
      dx = k; dy = k * 0.6; break;
    }
    case 'Beat Pulse': {
      const p = 1 + Math.abs(Math.sin(progress * Math.PI * 4)) * 0.05;
      dw = W * p; dh = H * p;
      dx = (W - dw) / 2; dy = (H - dh) / 2; break;
    }
    case 'Flash Impact':
      if (progress < 0.12) {
        ctx.fillStyle = `rgba(255,255,255,${(0.12 - progress) * 8})`;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    case 'Glitch Flicker':
      if (Math.random() > 0.88) {
        sx = Math.random() * img.naturalWidth * 0.08;
        sy = Math.random() * img.naturalHeight * 0.08;
        sw = img.naturalWidth * 0.92; sh = img.naturalHeight * 0.92;
      }
      break;
    default: break; // Still Frame
  }

  // Fade in / fade out
  const fadeIn  = Math.min(progress * 7, 1);
  const fadeOut = Math.min((1 - progress) * 7, 1);
  ctx.globalAlpha = Math.min(fadeIn, fadeOut);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.globalAlpha = 1;

  // Flash overlay for Flash Impact
  if (motionEffect === 'Flash Impact' && progress < 0.18) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.75 - progress * 5)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Caption bar
  if (captionText) {
    const capProgress = Math.min((progress - 0.12) * 5, 1);
    if (capProgress > 0) {
      ctx.globalAlpha = capProgress;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, H - 52, W, 52);
      ctx.font = `bold ${Math.round(W * 0.044)}px system-ui, sans-serif`;
      ctx.fillStyle = '#f0f0ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const t = captionText.length > 54 ? captionText.slice(0, 51) + '…' : captionText;
      ctx.fillText(t, W / 2, H - 26);
      ctx.globalAlpha = 1;
    }
  }
}

// ── Modal component ───────────────────────────────────────────────────────────

export default function MotionPreviewModal({ plan, image, onClose }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const animRef    = useRef<number | null>(null);
  const startRef   = useRef<number | null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaded,   setLoaded]   = useState(false);
  const [noImage,  setNoImage]  = useState(false);

  const duration = plan.duration ?? 4;
  const imageUrl = image?.image_url ?? null;

  const drawStatic = useCallback((p = 0) => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (img) {
      drawMotionFrame(ctx, img, canvas.width, canvas.height, p, plan.motion_effect, plan.caption_text);
    } else {
      ctx.fillStyle = '#080810';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No scene image', canvas.width / 2, canvas.height / 2);
    }
  }, [plan.motion_effect, plan.caption_text]);

  const stopAnim = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    startRef.current = null;
    setPlaying(false);
  }, []);

  const animate = useCallback((ts: number) => {
    if (!startRef.current) startRef.current = ts;
    const elapsed  = (ts - startRef.current) / 1000;
    const prog     = Math.min(elapsed / duration, 1);
    setProgress(prog);
    drawStatic(prog);
    if (prog < 1) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      stopAnim();
    }
  }, [duration, drawStatic, stopAnim]);

  const handlePlay = useCallback(() => {
    stopAnim();
    setPlaying(true);
    animRef.current = requestAnimationFrame(animate);
  }, [animate, stopAnim]);

  const handlePause = useCallback(() => stopAnim(), [stopAnim]);

  const handleRestart = useCallback(() => {
    stopAnim();
    setProgress(0);
    drawStatic(0);
  }, [stopAnim, drawStatic]);

  // Load image
  useEffect(() => {
    if (!imageUrl) { setNoImage(true); setLoaded(true); drawStatic(0); return; }
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.src = imageUrl;
    el.onload  = () => { imgRef.current = el; setLoaded(true); drawStatic(0); };
    el.onerror = () => { setNoImage(true); setLoaded(true); drawStatic(0); };
    return () => stopAnim();
  }, [imageUrl, drawStatic, stopAnim]);

  // Keyboard: Escape to close, Space to play/pause
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); playing ? handlePause() : handlePlay(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, playing, handlePlay, handlePause]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: '#0a0a14', border: '1px solid rgba(139,92,246,0.30)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.35)' }}
            >
              <Film className="w-3 h-3 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">Motion Preview</p>
              <p className="text-sm font-bold text-foreground/90 truncate">
                Scene {String(plan.scene_number).padStart(2, '0')}
                {plan.scene_title ? ` — ${plan.scene_title}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Canvas */}
        <div className="relative" style={{ background: '#000', aspectRatio: '16/9' }}>
          <canvas
            ref={canvasRef}
            width={640}
            height={360}
            className="w-full h-full"
          />

          {/* Badges */}
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.30)' }}
            >
              {plan.motion_effect}
            </span>
            {noImage && (
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.30)' }}
              >
                Placeholder
              </span>
            )}
          </div>

          {/* Progress bar */}
          {loaded && (
            <div className="absolute bottom-0 inset-x-0 h-0.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <div
                className="h-full transition-none"
                style={{ width: `${progress * 100}%`, background: '#8b5cf6' }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div
          className="flex items-center gap-2 px-5 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            onClick={handleRestart}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
            title="Restart"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {playing ? (
            <button
              onClick={handlePause}
              className="flex items-center justify-center w-9 h-9 rounded-xl font-semibold text-xs gap-1.5 px-3"
              style={{ background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.40)', color: '#c4b5fd' }}
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
          ) : (
            <button
              onClick={handlePlay}
              disabled={!loaded}
              className="flex items-center justify-center w-9 h-9 rounded-xl font-semibold text-xs gap-1.5 px-3 disabled:opacity-40"
              style={{ background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.40)', color: '#c4b5fd' }}
            >
              <Play className="w-4 h-4" /> Play
            </button>
          )}

          <div className="flex-1 flex items-center gap-2 ml-2">
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.10)' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const p = (e.clientX - rect.left) / rect.width;
                stopAnim(); setProgress(p); drawStatic(p);
              }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${progress * 100}%`, background: 'rgba(139,92,246,0.80)' }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
              {(progress * duration).toFixed(1)}s / {duration}s
            </span>
          </div>

          <div className="flex flex-col items-end text-right ml-2">
            {plan.transition_in !== 'None' && (
              <span className="text-[10px] font-mono text-blue-400/70">{plan.transition_in} in</span>
            )}
            {plan.transition_out !== 'None' && (
              <span className="text-[10px] font-mono text-blue-400/70">{plan.transition_out} out</span>
            )}
          </div>
        </div>

        {/* Info row */}
        <div
          className="flex flex-wrap gap-3 px-5 pb-4 text-xs text-muted-foreground/50"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <span className="pt-3">Duration: <b className="text-foreground/70">{duration}s</b></span>
          {plan.lyric_moment && (
            <span className="pt-3 italic text-violet-400/60">🎵 "{plan.lyric_moment}"</span>
          )}
          {plan.caption_text && (
            <span className="pt-3">Caption: <b className="text-foreground/70">{plan.caption_text}</b></span>
          )}
          <span className="pt-3 ml-auto text-muted-foreground/30">Press Space to play · Esc to close</span>
        </div>
      </div>
    </div>
  );
}
