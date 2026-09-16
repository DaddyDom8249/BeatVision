import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatvision-render-evidence-'));
const audio = path.join(dir, 'song.wav');
const video = path.join(dir, 'final.mp4');
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:a', 'pcm_s16le', audio], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-i', audio, '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video], { stdio: 'ignore' });
const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' }));
const streams = metadata.streams;
const v = streams.find((x) => x.codec_type === 'video');
const a = streams.find((x) => x.codec_type === 'audio');
const evidence = { file_exists: fs.existsSync(video), duration_seconds: Number(metadata.format.duration), width: Number(v.width), height: Number(v.height), video_codec: v.codec_name, audio_codec: a.codec_name, frame_rate: v.r_frame_rate, video_duration_seconds: Number(v.duration), audio_duration_seconds: Number(a.duration), timeline_duration_seconds: 4 };
console.log(JSON.stringify(evidence, null, 2));
fs.rmSync(dir, { recursive: true, force: true });
