// Validate bucket keys before signing or writing with service credentials.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segments(path: unknown): string[] {
  if (typeof path !== "string" || !path || path !== path.trim()) throw new Error("STORAGE_PATH_INVALID");
  const parts = path.split("/");
  for (const part of parts) {
    let decoded: string;
    try { decoded = decodeURIComponent(part); } catch { throw new Error("STORAGE_PATH_INVALID"); }
    if (!decoded || decoded === "." || decoded === ".." || /[\\/\\\\\u0000-\u001f\u007f]/.test(decoded) || decoded.includes("%")) {
      throw new Error("STORAGE_PATH_INVALID");
    }
  }
  return parts;
}

function context(actual: string, expected: string): void {
  if (!expected || actual !== expected) throw new Error("STORAGE_PATH_CONTEXT_MISMATCH");
}

export function assertSongPath(path: unknown, ownerId: string, projectId: string): asserts path is string {
  const parts = segments(path);
  if (parts.length !== 3 || !uuid.test(parts[2].slice(0,36)) || parts[2][36] !== "." || !/^[a-zA-Z0-9_-]+$/.test(parts[2].slice(37))) {
    throw new Error("SONG_STORAGE_PATH_INVALID");
  }
  context(parts[0], ownerId);
  context(parts[1], projectId);
}

export function assertStyleAssetPath(path: unknown, ownerId: string, projectId: string, kind: "characters" | "environments", parentId: string): asserts path is string {
  const parts = segments(path);
  if (parts.length !== 5 || !uuid.test(parts[4].slice(0,36)) || parts[4][36] !== "-" || !parts[4].slice(37)) {
    throw new Error("STYLE_STORAGE_PATH_INVALID");
  }
  context(parts[0], ownerId);
  context(parts[1], projectId);
  context(parts[2], kind);
  context(parts[3], parentId);
}

export function assertSceneImagePath(path: unknown, projectId: string, planId: string, sceneId: string, jobId: string): asserts path is string {
  const parts = segments(path);
  if (parts.length !== 5 || parts[1] !== "scene-images") throw new Error("SCENE_IMAGE_STORAGE_PATH_INVALID");
  context(parts[0], projectId);
  context(parts[2], planId);
  context(parts[3], sceneId);
  context(parts[4], jobId + ".jpg");
}
