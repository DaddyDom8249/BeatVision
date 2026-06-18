export type KenBurnsOptions = {
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  zoomStart?: number;
  zoomEnd?: number;
  panX?: number;
  panY?: number;
};

export type KenBurnsResult = {
  blob: Blob;
  url: string;
  mimeType: string;
  filename: string;
};

function pickMimeType(): string {
  const options = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  for (const type of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return "video/webm";
}

function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number,
) {
  const imgAspect = img.width / img.height;
  const canvasAspect = width / height;

  let drawWidth: number;
  let drawHeight: number;

  if (imgAspect > canvasAspect) {
    drawHeight = height * zoom;
    drawWidth = drawHeight * imgAspect;
  } else {
    drawWidth = width * zoom;
    drawHeight = drawWidth / imgAspect;
  }

  const maxPanX = Math.max(0, (drawWidth - width) / 2);
  const maxPanY = Math.max(0, (drawHeight - height) / 2);

  const x = (width - drawWidth) / 2 + maxPanX * panX;
  const y = (height - drawHeight) / 2 + maxPanY * panY;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
}

export async function renderKenBurnsFallback(
  imageUrl: string,
  filename = "beatvision_ken_burns_fallback.webm",
  options: KenBurnsOptions = {},
): Promise<KenBurnsResult> {
  if (typeof window === "undefined") {
    throw new Error("Ken Burns fallback can only run in the browser.");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support MediaRecorder video export.");
  }

  const width = options.width ?? 768;
  const height = options.height ?? 432;
  const fps = options.fps ?? 24;
  const durationSeconds = options.durationSeconds ?? 5;
  const zoomStart = options.zoomStart ?? 1.02;
  const zoomEnd = options.zoomEnd ?? 1.16;
  const panX = options.panX ?? 0.35;
  const panY = options.panY ?? -0.18;

  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context.");
  }

  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  const frameDelay = 1000 / fps;

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("MediaRecorder failed during Ken Burns render."));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) {
        reject(new Error("Ken Burns render produced an empty video blob."));
        return;
      }
      resolve(blob);
    };
  });

  recorder.start();

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = totalFrames <= 1 ? 1 : frame / (totalFrames - 1);
    const eased = t * t * (3 - 2 * t);
    const zoom = zoomStart + (zoomEnd - zoomStart) * eased;

    drawCoverImage(ctx, img, width, height, zoom, panX * eased, panY * eased);

    await new Promise((resolve) => setTimeout(resolve, frameDelay));
  }

  recorder.stop();

  const blob = await finished;
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    mimeType,
    filename,
  };
}

export function downloadKenBurnsResult(result: KenBurnsResult) {
  const a = document.createElement("a");
  a.href = result.url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
