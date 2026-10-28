import { supabase } from "./supabase/client";

/** Budget authorization is not an account-wide quota estimate. Fail closed. */
export const IMAGE_BUDGET_MESSAGE =
  "Scene image rendering is paused to protect Cloudflare neurons. Your saved images and motion remain available. No image generation was submitted.";

export async function requireImageBudget(projectId: string): Promise<void> {
  const result = await supabase.functions.invoke("beatvision-generation", {
    body: { action: "image_capability", projectId },
  });
  if (result.error || result.data?.image_generation_authorized !== true) {
    throw new Error(IMAGE_BUDGET_MESSAGE);
  }
}
