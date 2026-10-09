import type { WorldReport } from "../../types/world";
import { formatCreativeText, formatCreativeLines } from "../formatCreativeText";

type DraftKind = "character" | "environment";
type Sheet = Record<string, string>;
type WorldEnvironment = Record<string, unknown>;

/**
 * Supply only facts explicitly present in the confirmed World.
 * These values are editor suggestions until the creator saves the draft sheet.
 * Never apply these suggestions to an already-approved sheet.
 */
export function worldSheetSuggestions(world: WorldReport, kind: DraftKind, name: string): Sheet {
  const rules = formatCreativeLines(world.continuity_rules).join("\n");
  if (kind === "character") {
    const raw = world.raw_report && typeof world.raw_report === "object" && !Array.isArray(world.raw_report)
      ? world.raw_report as Record<string, unknown> : {};
    const output = raw.model_output && typeof raw.model_output === "object" && !Array.isArray(raw.model_output)
      ? raw.model_output as Record<string, unknown> : {};
    const mainCharacters = Array.isArray(raw.main_characters)
      ? raw.main_characters : Array.isArray(output.main_characters) ? output.main_characters : [];
    const found = mainCharacters.find((item) => item && typeof item === "object" &&
      String((item as WorldEnvironment).name ?? "").trim().toLowerCase() === name.trim().toLowerCase());
    const source = found && typeof found === "object" ? found as WorldEnvironment : {};
    const immutable = world.immutable_continuity && typeof world.immutable_continuity === "object"
      ? world.immutable_continuity as WorldEnvironment : {};
    const movement = world.movement && typeof world.movement === "object"
      ? world.movement as WorldEnvironment : {};
    const isPrimary = name.trim().toLowerCase() === "central figure";
    return {
      identity: formatCreativeText(source.identity),
      appearance: formatCreativeText(source.appearance),
      wardrobe: formatCreativeText(source.wardrobe ?? (isPrimary ? immutable.central_figure_clothing : "")),
      behavior: formatCreativeText(source.behavior ?? (isPrimary ? movement.subject_behavior : "")),
      continuity: formatCreativeText(source.continuity) || (isPrimary ? rules : ""),
    };
  }

  const entries = Array.isArray(world.environments) ? world.environments : [];
  const matching = entries.find((item) => {
    const itemName = typeof item === "string" ? item : item && typeof item === "object"
      ? String((item as WorldEnvironment).setting ?? (item as WorldEnvironment).name ?? "") : "";
    return itemName.trim().toLowerCase() === name.trim().toLowerCase();
  });
  const record = matching && typeof matching === "object" ? matching as WorldEnvironment : {};
  const description = formatCreativeText(record.description);
  // Never infer specific architecture, costume, or appearance from mood.
  // Surface imagery is used only when the World literally names such imagery.
  const surfaceDescription = /concrete|graffiti|textures?|geometric shapes|surfaces?/i.test(description)
    ? description : "";
  return {
    purpose: formatCreativeText(record.purpose) || description,
    layout: formatCreativeText(record.layout ?? record.composition) || description,
    architecture: formatCreativeText(record.architecture ?? record.structure),
    surfaces: formatCreativeText(record.surfaces ?? record.props) || surfaceDescription,
    lighting: formatCreativeText(record.lighting) || formatCreativeText(world.color_lighting),
    atmosphere: formatCreativeText(record.atmosphere) || formatCreativeText(world.atmosphere),
    continuity: formatCreativeText(record.continuity) || rules,
  };
}

/** Add World-supported suggestions to missing editor fields, without overwriting edits. */
export function suggestMissingWorldFields(
  current: Sheet,
  world: WorldReport,
  kind: DraftKind,
  name: string,
  status: "draft" | "approved",
): { sheet: Sheet; suggestedFields: string[] } {
  if (status !== "draft") return { sheet: { ...current }, suggestedFields: [] };
  const suggestions = worldSheetSuggestions(world, kind, name);
  const sheet = { ...current };
  const suggestedFields: string[] = [];
  for (const [key, proposed] of Object.entries(suggestions)) {
    if (!sheet[key]?.trim() && proposed.trim()) {
      sheet[key] = proposed;
      suggestedFields.push(key);
    }
  }
  return { sheet, suggestedFields };
}
