import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { suggestMissingWorldFields } from "../lib/style/worldSheetSuggestions";
import type { StyleDraftKind } from "../lib/style/generatedStyleDraft";
import { mergeGeneratedStyleDraft } from "../lib/style/generatedStyleDraft";
import type { WorldReport } from "../types/world";
import {
  formatCreativeText,
  formatCreativeLines,
  formatCreativeRecord,
  mergeCreativeSheet,
  recoverWorldContinuity,
  getCreativeErrorMessage,
} from "../lib/formatCreativeText";
import type {
  Character,
  CharacterAsset,
  Environment,
  EnvironmentAsset,
  StyleBible,
} from "../types/style";

const styleFields =
  "id,project_id,world_report_id,status,world_basis,visual_language,cinematography,color_lighting,atmosphere,movement,continuity_rules,visual_rules,reference_assets,approved_at,created_at,updated_at";

const characterFields =
  "id,project_id,world_report_id,style_bible_id,name,status,sheet,supersedes_character_id,revision_number,approved_at,created_at,updated_at";

const characterAssetFields =
  "id,project_id,world_report_id,character_id,kind,label,storage_path,status,metadata,approved_at,supersedes_asset_id,created_at";

const environmentFields =
  "id,project_id,world_report_id,style_bible_id,name,status,sheet,supersedes_environment_id,revision_number,approved_at,created_at,updated_at";

const environmentAssetFields =
  "id,project_id,world_report_id,environment_id,kind,label,storage_path,status,metadata,approved_at,supersedes_asset_id,created_at";

function asLines(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): Record<string, string> {
  return formatCreativeRecord(value);
}

function asReferenceAssets(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "url" in item) return String((item as { url?: unknown }).url ?? "");
        return JSON.stringify(item);
      }).filter(Boolean)
    : [];
}

async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

async function signAssetUrls<T extends { storage_path: string }>(rows: T[], withAsset: (row: T, url: string | null) => T) {
  return Promise.all(rows.map(async (row) => {
    const { data } = await supabase.storage.from("visual-assets").createSignedUrl(row.storage_path, 3600);
    return withAsset(row, data?.signedUrl ?? null);
  }));
}

function materializeWorldDrafts(world: WorldReport, projectId: string, styleBibleId: string) {
  const immutable = world.immutable_continuity && typeof world.immutable_continuity === "object"
    ? world.immutable_continuity as Record<string, unknown>
    : {};
  const continuityText = formatCreativeLines(world.continuity_rules).join("; ");

  const clothing = typeof immutable.central_figure_clothing === "string" ? immutable.central_figure_clothing : "";
  const keyProp = typeof immutable.key_prop === "string" ? immutable.key_prop : "";
  const windowLocation = typeof immutable.location_of_window === "string" ? immutable.location_of_window : "";

  const raw = world.raw_report && typeof world.raw_report === "object"
    ? world.raw_report as Record<string, unknown>
    : {};
  const characterNames = new Set<string>();
  const modelOutput = raw.model_output && typeof raw.model_output === "object"
    ? raw.model_output as Record<string, unknown>
    : {};
  const movement = modelOutput.movement && typeof modelOutput.movement === "object"
    ? modelOutput.movement as Record<string, unknown>
    : {};
  const subjectBehavior = typeof movement.subject_behavior === "string" ? movement.subject_behavior : "";
  const motifs = Array.isArray(modelOutput.motifs)
    ? modelOutput.motifs.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const value = item as Record<string, unknown>;
          return typeof value.symbol === "string" ? value.symbol : "";
        }
        return "";
      }).filter(Boolean)
    : [];
  const mainCharacters = Array.isArray(raw.main_characters)
    ? raw.main_characters
    : Array.isArray(modelOutput.main_characters) ? modelOutput.main_characters : [];

  const characters = mainCharacters
    .map((item) => {
      if (typeof item === "string") return { name: item.trim(), sheet: {} as Record<string, string> };
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!name) return null;
      const sheet: Record<string, string> = {};
      for (const [key, fieldValue] of Object.entries(value)) {
        if (key !== "name") sheet[key] = formatCreativeText(fieldValue);
      }
      return { name, sheet };
    })
    .filter((item): item is { name: string; sheet: Record<string, string> } => Boolean(item?.name));

  if (!characters.length && (clothing || keyProp || windowLocation || subjectBehavior || motifs.length)) {
    characters.push({
      name: "Central Figure",
      sheet: {
        identity: "Primary subject derived from the confirmed World Report; refine before approval.",
        wardrobe: clothing,
        behavior: subjectBehavior,
        continuity: [keyProp && `Key prop: ${keyProp}`, clothing && `Central figure clothing: ${clothing}`, windowLocation && `Window location: ${windowLocation}`, motifs.length && `World motifs: ${motifs.join(", ")}`, continuityText].filter(Boolean).join("; "),
      },
    });
  }

  const environmentDrafts = Array.isArray(world.environments)
    ? world.environments.map((item) => {
        if (typeof item === "string") return { name: item.trim(), description: "" };
        if (item && typeof item === "object") {
          const value = item as Record<string, unknown>;
          return {
            name: typeof value.setting === "string" ? value.setting.trim() : typeof value.name === "string" ? value.name.trim() : "",
            description: typeof value.description === "string" ? value.description : "",
          };
        }
        return { name: "", description: "" };
      }).filter((item) => item.name)
    : [];

  return {
    characters: characters.filter((item) => {
      if (characterNames.has(item.name.toLowerCase())) return false;
      characterNames.add(item.name.toLowerCase());
      return true;
    }).map((item) => ({
      ...item,
      project_id: projectId,
      world_report_id: world.id,
      style_bible_id: styleBibleId,
      status: "draft",
    })),
    environments: [...new Map(environmentDrafts.map((item) => [item.name.toLowerCase(), item])).values()].map((item) => ({
      project_id: projectId,
      world_report_id: world.id,
      style_bible_id: styleBibleId,
      name: item.name,
      status: "draft",
      sheet: {
        purpose: item.description,
        layout: item.description,
        lighting: formatCreativeText(world.color_lighting),
        atmosphere: formatCreativeText(world.atmosphere),
        continuity: [continuityText, keyProp && `Key prop: ${keyProp}`, clothing && `Central figure clothing: ${clothing}`, windowLocation && `Window location: ${windowLocation}`].filter(Boolean).join("; "),
      },
    })),
  };
}

async function ensureWorldDrafts(world: WorldReport, projectId: string, styleBible: StyleBible) {
  const [existingCharacters, existingEnvironments] = await Promise.all([
    supabase.from("characters").select("id,name").eq("project_id", projectId).eq("world_report_id", world.id).eq("style_bible_id", styleBible.id),
    supabase.from("environments").select("id,name").eq("project_id", projectId).eq("world_report_id", world.id).eq("style_bible_id", styleBible.id),
  ]);
  if (existingCharacters.error) throw existingCharacters.error;
  if (existingEnvironments.error) throw existingEnvironments.error;

  const drafts = materializeWorldDrafts(world, projectId, styleBible.id);
  const characterNames = new Set((existingCharacters.data ?? []).map((row) => row.name.toLowerCase()));
  const environmentNames = new Set((existingEnvironments.data ?? []).map((row) => row.name.toLowerCase()));

  const missingCharacters = drafts.characters.filter((row) => !characterNames.has(row.name.toLowerCase()));
  const missingEnvironments = drafts.environments.filter((row) => !environmentNames.has(row.name.toLowerCase()));

  if (missingCharacters.length) {
    const result = await supabase.from("characters").insert(missingCharacters);
    if (result.error) throw result.error;
  }
  if (missingEnvironments.length) {
    const result = await supabase.from("environments").insert(missingEnvironments);
    if (result.error) throw result.error;
  }
}

export function useStyleStudio(projectId: string) {
  const [world, setWorld] = useState<WorldReport | null>(null);
  const [styleBible, setStyleBible] = useState<StyleBible | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterAssets, setCharacterAssets] = useState<CharacterAsset[]>([]);
  const rawCharacterSheets = useRef(new Map<string, unknown>());
  const rawEnvironmentSheets = useRef(new Map<string, unknown>());
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentAssets, setEnvironmentAssets] = useState<EnvironmentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const hasStartedLoad = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Retain mounted editor forms on save/upload/approval refreshes.
    // The first load owns the page-level spinner; subsequent loads are background refreshes.
    if (!hasStartedLoad.current) {
      hasStartedLoad.current = true;
      setLoading(true);
    }
    setError(null);

    const projectResult = await supabase
      .from("projects")
      .select("world_report_id")
      .eq("id", projectId)
      .single();

    if (projectResult.error) {
      setError(projectResult.error.message);
      setLoading(false);
      return;
    }

    if (!projectResult.data.world_report_id) {
      setWorld(null);
      setStyleBible(null);
      setCharacters([]);
      setCharacterAssets([]);
      setEnvironments([]);
      setEnvironmentAssets([]);
      setLoading(false);
      return;
    }

    const worldResult = await supabase
      .from("world_reports")
      .select("*")
      .eq("id", projectResult.data.world_report_id)
      .eq("project_id", projectId)
      .single();

    if (worldResult.error) {
      setError(worldResult.error.message);
      setLoading(false);
      return;
    }

    const currentWorld = worldResult.data as WorldReport;
    setWorld(currentWorld);

    if (currentWorld.status !== "completed" || !currentWorld.confirmed_at) {
      setStyleBible(null);
      setCharacters([]);
      setCharacterAssets([]);
      setEnvironments([]);
      setEnvironmentAssets([]);
      setLoading(false);
      return;
    }

    const styleResult = await supabase
      .from("style_bibles")
      .select(styleFields)
      .eq("project_id", projectId)
      .maybeSingle();

    if (styleResult.error) {
      setError(styleResult.error.message);
      setLoading(false);
      return;
    }

    let currentStyleBible = (styleResult.data ?? null) as StyleBible | null;
    if (currentStyleBible) {
      try {
        // The existing Ghast draft stored "[object Object]" instead of rules.
        // Only recover drafts whose entire array contains these invalid values.
        const existingRules = currentStyleBible.continuity_rules;
        if (currentStyleBible.status === "draft" &&
            Array.isArray(existingRules) && existingRules.length > 0 &&
            existingRules.every((item) => item === "[object Object]")) {
          const recovered = recoverWorldContinuity(existingRules, currentWorld.continuity_rules);
          if (recovered.length) {
            const repair = await supabase.from("style_bibles")
              .update({ continuity_rules: recovered })
              .eq("id", currentStyleBible.id)
              .eq("status", "draft")
              .select(styleFields).single();
            if (repair.error) throw repair.error;
            currentStyleBible = repair.data as StyleBible;
          }
        }
        await ensureWorldDrafts(currentWorld, projectId, currentStyleBible);
      } catch (e) {
        setError(getCreativeErrorMessage(e, "Unable to load World-derived drafts."));
        setLoading(false);
        return;
      }
    }

    const [characterResult, characterAssetResult, environmentResult, environmentAssetResult] =
      await Promise.all([
        supabase.from("characters").select(characterFields).eq("project_id", projectId).eq("world_report_id", currentWorld.id).eq("style_bible_id", currentStyleBible?.id ?? "").order("created_at", { ascending: true }),
        supabase.from("character_assets").select(characterAssetFields).eq("project_id", projectId).eq("world_report_id", currentWorld.id).order("created_at", { ascending: true }),
        supabase.from("environments").select(environmentFields).eq("project_id", projectId).eq("world_report_id", currentWorld.id).eq("style_bible_id", currentStyleBible?.id ?? "").order("created_at", { ascending: true }),
        supabase.from("environment_assets").select(environmentAssetFields).eq("project_id", projectId).eq("world_report_id", currentWorld.id).order("created_at", { ascending: true }),
      ]);

    const firstError =
      styleResult.error ??
      characterResult.error ??
      characterAssetResult.error ??
      environmentResult.error ??
      environmentAssetResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    rawCharacterSheets.current = new Map((characterResult.data ?? []).map((row) => [row.id, row.sheet]));
    rawEnvironmentSheets.current = new Map((environmentResult.data ?? []).map((row) => [row.id, row.sheet]));
    setStyleBible(currentStyleBible);
    const characterRows = characterResult.data ?? [];
    const characterParent = new Map(characterRows.map((row) => [row.id, row.supersedes_character_id as string | null]));
    const characterAncestors = (id: string) => {
      const ids: string[] = [];
      let parent = characterParent.get(id) ?? null;
      while (parent && !ids.includes(parent)) {
        ids.push(parent);
        parent = characterParent.get(parent) ?? null;
      }
      return ids;
    };
    const supersededCharacterIds = new Set(characterRows
      .filter((row) => row.status === "approved" && row.supersedes_character_id)
      .map((row) => row.supersedes_character_id));
    setCharacters(characterRows.filter((row) => !supersededCharacterIds.has(row.id)).map((row) => {
      const proposal = suggestMissingWorldFields(
        formatCreativeRecord(row.sheet), currentWorld, "character", row.name, row.status,
      );
      return { ...row, sheet: proposal.sheet, suggested_world_fields: proposal.suggestedFields, revision_ancestor_ids: characterAncestors(row.id) };
    }) as Character[]);
    const environmentRows = environmentResult.data ?? [];
    const environmentParent = new Map(environmentRows.map((row) => [row.id, row.supersedes_environment_id as string | null]));
    const environmentAncestors = (id: string) => {
      const ids: string[] = [];
      let parent = environmentParent.get(id) ?? null;
      while (parent && !ids.includes(parent)) {
        ids.push(parent);
        parent = environmentParent.get(parent) ?? null;
      }
      return ids;
    };
    const supersededEnvironmentIds = new Set(environmentRows
      .filter((row) => row.status === "approved" && row.supersedes_environment_id)
      .map((row) => row.supersedes_environment_id));
    setEnvironments(environmentRows.filter((row) => !supersededEnvironmentIds.has(row.id)).map((row) => {
      const proposal = suggestMissingWorldFields(
        formatCreativeRecord(row.sheet), currentWorld, "environment", row.name, row.status,
      );
      return { ...row, sheet: proposal.sheet, suggested_world_fields: proposal.suggestedFields, revision_ancestor_ids: environmentAncestors(row.id) };
    }) as Environment[]);
    setCharacterAssets(await signAssetUrls(
      (characterAssetResult.data ?? []) as CharacterAsset[],
      (row, url) => ({ ...row, signed_url: url })
    ));
    setEnvironmentAssets(await signAssetUrls(
      (environmentAssetResult.data ?? []) as EnvironmentAsset[],
      (row, url) => ({ ...row, signed_url: url })
    ));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load().catch((cause: unknown) => {
      setError(getCreativeErrorMessage(cause, "Unable to refresh the Style Studio."));
      setLoading(false);
    });
  }, [load]);

  const createStyleBible = useCallback(async () => {
    if (!world || world.status !== "completed" || !world.confirmed_at) throw new Error("Confirm the Visual World Report before creating the Style Bible.");
    setWorking(true); setError(null);
    try {
      // Read before inserting: a previous creator approval is authoritative.
      // IMPORTANT: fail closed on read errors; null data alone means absent.
      const existing = await supabase.from("style_bibles")
        .select(styleFields).eq("project_id", projectId).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        if (existing.data.world_report_id !== world.id) {
          throw new Error("Style Bible belongs to a different World revision. Refresh the project instead of creating another.");
        }
        setStyleBible(existing.data as StyleBible);
        return existing.data as StyleBible;
      }

      const payload = {
        project_id: projectId,
        world_report_id: world.id,
        world_basis: {
          mood: world.mood,
          emotional_arc: world.emotional_arc,
          visual_language: world.visual_language,
          cinematography: world.cinematography,
          environments: world.environments,
          color_lighting: world.color_lighting,
          motifs: world.motifs,
          atmosphere: world.atmosphere,
          movement: world.movement,
          continuity_rules: world.continuity_rules,
          immutable_continuity: world.immutable_continuity,
        },
        visual_language: world.visual_language ?? {},
        cinematography: world.cinematography ?? {},
        color_lighting: world.color_lighting ?? {},
        atmosphere: world.atmosphere ?? {},
        movement: world.movement ?? {},
        continuity_rules: world.continuity_rules ?? [],
        visual_rules: [],
        reference_assets: [],
      };
      const result = await supabase.from("style_bibles").insert(payload).select(styleFields).single();
      if (result.error) {
        // A simultaneous creator action may have inserted the single allowed row.
        // Only a confirmed unique-key collision is safe to recover from.
        if (result.error.code === "23505") {
          const retry = await supabase.from("style_bibles")
            .select(styleFields).eq("project_id", projectId).maybeSingle();
          if (retry.error) throw retry.error;
          if (retry.data?.world_report_id === world.id) {
            setStyleBible(retry.data as StyleBible);
            return retry.data as StyleBible;
          }
        }
        throw result.error;
      }
      if (!result.data) throw new Error("Style Bible creation returned no record. Refresh and verify the project.");
      setStyleBible(result.data as StyleBible);
      return result.data as StyleBible;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to create Style Bible.");
      setError(message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [projectId, world]);

  const saveStyleBible = useCallback(async (draft: Pick<StyleBible, "visual_rules" | "reference_assets" | "continuity_rules">) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    if (styleBible.status === "approved") throw new Error("The Style Bible is locked and cannot be edited.");
    setWorking(true); setError(null);
    try {
      const result = await supabase
        .from("style_bibles")
        .update(draft)
        .eq("id", styleBible.id)
        .eq("status", "draft")
        .select(styleFields)
        .single();
      if (result.error) throw result.error;
      setStyleBible(result.data as StyleBible);
    } catch (e) {
      setError(getCreativeErrorMessage(e, "Unable to save Style Bible."));
      throw e;
    } finally {
      setWorking(false);
    }
  }, [styleBible]);

  const approveStyleBible = useCallback(async () => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    if (styleBible.status === "approved") return styleBible;
    setWorking(true); setError(null);
    try {
      const result = await supabase
        .from("style_bibles")
        .update({ status: "approved" })
        .eq("id", styleBible.id)
        .eq("status", "draft")
        .select(styleFields)
        .single();
      if (result.error) throw result.error;
      setStyleBible(result.data as StyleBible);
      return result.data as StyleBible;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to lock Style Bible.");
      setError(message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [styleBible]);

  const saveCharacter = useCallback(async (id: string | null, input: { name: string; sheet: Record<string, string> }) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    if (!world?.id) throw new Error("Confirmed World Report not available.");
    const worldReportId = world.id;
    if (id && characters.some((row) => row.id === id && row.status === "approved")) {
      throw new Error("Approved character sheets are immutable.");
    }
    setWorking(true); setError(null);
    try {
      const base = {
        name: input.name.trim(),
        sheet: id ? mergeCreativeSheet(rawCharacterSheets.current.get(id), input.sheet) : input.sheet,
      };
      const result = id
        ? await supabase.from("characters").update(base).eq("id", id).eq("status", "draft").select(characterFields).single()
        : await supabase.from("characters").insert({
            ...base,
            project_id: projectId,
            world_report_id: worldReportId,
            style_bible_id: styleBible.id,
          }).select(characterFields).single();
      if (result.error) throw result.error;
      await load();
      return result.data as Character;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to save character.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, world, styleBible, characters, load]);

  const approveCharacter = useCallback(async (id: string) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc("approve_character", { p_character_id: id });
      if (result.error) throw result.error;
      await load();
      return result.data as Character;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to approve character.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [load, styleBible]);

  const saveEnvironment = useCallback(async (id: string | null, input: { name: string; sheet: Record<string, string> }) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    if (!world?.id) throw new Error("Confirmed World Report not available.");
    const worldReportId = world.id;
    if (id && environments.some((row) => row.id === id && row.status === "approved")) {
      throw new Error("Approved environment sheets are immutable.");
    }
    setWorking(true); setError(null);
    try {
      const base = {
        name: input.name.trim(),
        sheet: id ? mergeCreativeSheet(rawEnvironmentSheets.current.get(id), input.sheet) : input.sheet,
      };
      const result = id
        ? await supabase.from("environments").update(base).eq("id", id).eq("status", "draft").select(environmentFields).single()
        : await supabase.from("environments").insert({
            ...base,
            project_id: projectId,
            world_report_id: worldReportId,
            style_bible_id: styleBible.id,
          }).select(environmentFields).single();
      if (result.error) throw result.error;
      await load();
      return result.data as Environment;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to save environment.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, world, styleBible, environments, load]);

  const approveEnvironment = useCallback(async (id: string) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc("approve_environment", { p_environment_id: id });
      if (result.error) throw result.error;
      await load();
      return result.data as Environment;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to approve environment.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [load, styleBible]);

  const uploadAsset = useCallback(async (kind: "character" | "environment", parentId: string, file: File, label: string) => {
    const userId = await getUserId();
    if (!styleBible || !world?.confirmed_at) throw new Error("The confirmed World and Style Bible are required before adding assets.");
    setWorking(true); setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const root = kind === "character" ? "characters" : "environments";
      const path = `${userId}/${projectId}/${root}/${parentId}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage.from("visual-assets").upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upload.error) throw upload.error;

      const table = kind === "character" ? "character_assets" : "environment_assets";
      const payload = {
        project_id: projectId,
        world_report_id: world.id,
        [kind === "character" ? "character_id" : "environment_id"]: parentId,
        kind: "reference",
        label: label.trim() || file.name,
        storage_path: path,
        status: "draft",
        metadata: { original_name: file.name, mime_type: file.type, size: file.size },
      };
      const result = await supabase.from(table).insert(payload).select("*").single();
      if (result.error) throw result.error;
      await load();
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to add asset.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, styleBible, world, load]);

  const approveAsset = useCallback(async (kind: "character" | "environment", assetId: string) => {
    // A locked Style Bible remains immutable, but new reference assets are
    // separate draft records with their own explicit approval lifecycle.
    if (!styleBible || !world?.confirmed_at) throw new Error("A confirmed World and Style Bible are required.");
    setWorking(true); setError(null);
    try {
      const table = kind === "character" ? "character_assets" : "environment_assets";
      const result = await supabase.from(table).update({
        // The Phase 3 approval trigger is authoritative for approved_at.
        status: "approved",
      }).eq("id", assetId).eq("status", "draft").select("*").single();
      if (result.error) throw result.error;
      await load();
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to approve asset.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [load, styleBible, world]);

  const generateDescription = useCallback(async (kind: StyleDraftKind, recordId: string) => {
    if (!styleBible || !world?.confirmed_at) {
      throw new Error("The confirmed World and Style Bible are required before generating descriptions.");
    }
    setWorking(true); setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("beatvision-style-draft", {
        body: { projectId, kind, recordId },
      });
      const remoteMessage = data && typeof data === "object" && data.error &&
        typeof data.error === "object" && typeof data.error.message === "string"
        ? data.error.message : null;
      if (invokeError) throw new Error(remoteMessage || invokeError.message || "Description generation failed.");
      if (!data?.draft || typeof data.draft !== "object" || Array.isArray(data.draft)) {
        throw new Error("Description generation returned an invalid draft.");
      }
      return data.draft as Record<string, unknown>;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to generate description.");
      setError(message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [projectId, styleBible, world]);

  const createRevision = useCallback(async (
    kind: StyleDraftKind,
    recordId: string,
    proposal: Record<string, unknown>,
  ) => {
    if (!styleBible || !world?.confirmed_at) {
      throw new Error("The confirmed World and Style Bible are required before creating a revision.");
    }
    const source = kind === "character"
      ? characters.find((row) => row.id === recordId)
      : environments.find((row) => row.id === recordId);
    if (!source || source.status !== "approved") throw new Error("Only an approved sheet can create a revision.");

    const raw = kind === "character"
      ? rawCharacterSheets.current.get(recordId)
      : rawEnvironmentSheets.current.get(recordId);
    const current = formatCreativeRecord(raw);
    const proposedSheet = mergeGeneratedStyleDraft(current, proposal, kind);
    const sheet = mergeCreativeSheet(raw, proposedSheet);
    const functionName = kind === "character" ? "create_character_revision" : "create_environment_revision";
    const idName = kind === "character" ? "p_character_id" : "p_environment_id";

    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc(functionName, { [idName]: recordId, p_sheet: sheet });
      if (result.error) throw result.error;
      await load();
      return result.data;
    } catch (e) {
      const message = getCreativeErrorMessage(e, "Unable to create revision.");
      setError(message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [styleBible, world, characters, environments, load]);

  return {
    world,
    styleBible,
    characters,
    characterAssets,
    environments,
    environmentAssets,
    loading,
    working,
    error,
    locked: styleBible?.status === "approved",
    createStyleBible,
    saveStyleBible,
    approveStyleBible,
    saveCharacter,
    saveEnvironment,
    approveCharacter,
    approveEnvironment,
    uploadAsset,
    approveAsset,
    generateDescription,
    createRevision,
    reload: load,
    asLines,
    asRecord,
    asReferenceAssets,
  };
}
