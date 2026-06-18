# BeatVision Ken Burns fallback

This is the guaranteed motion fallback for BeatVision.

Purpose:

- Works without paid GPU.
- Works without LTX/Wan/Stable Video Diffusion.
- Converts an approved still image into a short browser-rendered motion clip.
- Uses canvas + MediaRecorder.
- Outputs WebM in browser.

Default beta settings:

- 768x432
- 24 FPS
- 5 seconds
- slow zoom/pan
- downloadable WebM

Why WebM instead of MP4?

Browsers can reliably record canvas streams as WebM through MediaRecorder.
MP4 usually requires server-side ffmpeg/OpenCV or heavy ffmpeg.wasm.

Recommended BeatVision motion ladder:

1. Browser Ken Burns fallback
2. OpenCV server MP4 fallback
3. Cloud/free GPU provider
4. LTX/Wan real AI motion provider
