import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { WorldReport } from "../types/world";
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
  "id,project_id,world_report_id,style_bible_id,name,status,sheet,approved_at,created_at,updated_at";

const characterAssetFields =
  "id,project_id,world_report_id,character_id,kind,label,storage_path,status,metadata,approved_at,supersedes_asset_id,created_at";

const environmentFields =
  "id,project_id,world_report_id,style_bible_id,name,status,sheet,approved_at,created_at,updated_at";

const environmentAssetFields =
  "id,project_id,world_report_id,environment_id,kind,label,storage_path,status,metadata,approved_at,supersedes_asset_id,created_at";

function asLines(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typeof item === "string" ? item : JSON.stringify(item)])
      )
    : {};
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

export function useStyleStudio(projectId: string) {
  const [world, setWorld] = useState<WorldReport | null>(null);
  const [styleBible, setStyleBible] = useState<StyleBible | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterAssets, setCharacterAssets] = useState<CharacterAsset[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentAssets, setEnvironmentAssets] = useState<EnvironmentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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

    const [styleResult, characterResult, characterAssetResult, environmentResult, environmentAssetResult] =
      await Promise.all([
        supabase.from("style_bibles").select(styleFields).eq("project_id", projectId).maybeSingle(),
        supabase.from("characters").select(characterFields).eq("project_id", projectId).order("created_at", { ascending: true }),
        supabase.from("character_assets").select(characterAssetFields).eq("project_id", projectId).order("created_at", { ascending: true }),
        supabase.from("environments").select(environmentFields).eq("project_id", projectId).order("created_at", { ascending: true }),
        supabase.from("environment_assets").select(environmentAssetFields).eq("project_id", projectId).order("created_at", { ascending: true }),
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

    setStyleBible((styleResult.data ?? null) as StyleBible | null);
    setCharacters((characterResult.data ?? []) as Character[]);
    setEnvironments((environmentResult.data ?? []) as Environment[]);
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

  useEffect(() => { void load(); }, [load]);

  const createStyleBible = useCallback(async () => {
    if (!world || world.status !== "completed" || !world.confirmed_at) throw new Error("Confirm the Visual World Report before creating the Style Bible.");
    setWorking(true); setError(null);
    try {
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
      if (result.error) throw result.error;
      setStyleBible(result.data as StyleBible);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to create Style Bible.";
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
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", styleBible.id)
        .eq("status", "draft")
        .select(styleFields)
        .single();
      if (result.error) throw result.error;
      setStyleBible(result.data as StyleBible);
      return result.data as StyleBible;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to lock Style Bible.";
      setError(message);
      throw e;
    } finally {
      setWorking(false);
    }
  }, [styleBible]);

  const saveCharacter = useCallback(async (id: string | null, input: { name: string; sheet: Record<string, string> }) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    if (styleBible.status === "approved") throw new Error("The Style Bible is locked and cannot be edited.");
    if (!world?.id) throw new Error("Confirmed World Report not available.");
    const worldReportId = world.id;
    setWorking(true); setError(null);
    try {
      const base = { name: input.name.trim(), sheet: input.sheet };
      const result = id
        ? await supabase.from("characters").update(base).eq("id", id).select(characterFields).single()
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
      const message = e instanceof Error ? e.message : "Unable to save character.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, world, styleBible, load]);

  const saveEnvironment = useCallback(async (id: string | null, input: { name: string; sheet: Record<string, string> }) => {
    if (!styleBible) throw new Error("Create the Style Bible first.");
    if (styleBible.status === "approved") throw new Error("The Style Bible is locked and cannot be edited.");
    if (!world?.id) throw new Error("Confirmed World Report not available.");
    const worldReportId = world.id;
    setWorking(true); setError(null);
    try {
      const base = { name: input.name.trim(), sheet: input.sheet };
      const result = id
        ? await supabase.from("environments").update(base).eq("id", id).select(environmentFields).single()
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
      const message = e instanceof Error ? e.message : "Unable to save environment.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, world, styleBible, load]);

  const uploadAsset = useCallback(async (kind: "character" | "environment", parentId: string, file: File, label: string) => {
    const userId = await getUserId();
    if (!styleBible || styleBible.status === "approved" || !world?.confirmed_at) throw new Error("The Style Bible must be editable before adding assets.");
    setWorking(true); setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const root = kind === "character" ? "characters" : "environments";
      const path = `${userId}/${projectId}/${root}/${parentId}/${crypto.randomUUID()}-${safeName"}`;
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
      const message = e instanceof Error ? e.message : "Unable to add asset.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, styleBible, world, load]);

  const approveAsset = useCallback(async (kind: "character" | "environment", assetId: string) => {
    if (!styleBible || styleBible.status === "approved") throw new Error("The Style Bible is locked.");
    setWorking(true); setError(null);
    try {
      const table = kind === "character" ? "character_assets" : "environment_assets";
      const result = await supabase.from(table).update({
        status: "approved",
        approved_at: new Date().toISOString(),
      }).eq("id", assetId).select("*").single();
      if (result.error) throw result.error;
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to approve asset.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [load, styleBible]);

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
    uploadAsset,
    approveAsset,
    reload: load,
    asLines,
    asRecord,
    asReferenceAssets,
  };
}
