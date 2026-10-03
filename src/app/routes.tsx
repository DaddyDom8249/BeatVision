export const routes = {
  dashboard: "/",
  createProject: "/projects/new",
  project: "/projects/:projectId",
  song: "/projects/:projectId/song",
  world: "/projects/:projectId/world",
  style: "/projects/:projectId/style",
  visualPlan: "/projects/:projectId/visual-plan",
  story: "/projects/:projectId/story",
  scenes: "/projects/:projectId/scenes",
  motion: "/projects/:projectId/motion",
  video: "/projects/:projectId/video",
  settings: "/settings",
} as const;
