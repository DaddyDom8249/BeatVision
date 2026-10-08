/**
 * Safe normalization helper for structured creative data.
 * Converts strings, arrays, objects, and JSON strings into human-readable text.
 * Prevents literal "[object Object]" leaking into UI fields, forms, or database records.
 */

export function formatCreativeText(value: unknown, joinSeparator = "; "): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") {
      return "";
    }

    if (trimmed.includes("[object Object]")) {
      const cleaned = trimmed.replace(/\[object Object\]/g, "").replace(/\s*;\s*;\s*/g, "; ").trim();
      return cleaned.replace(/^;\s*|\s*;$/g, "");
    }

    // Try parsing stringified JSON
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        return formatCreativeText(parsed, joinSeparator);
      } catch {
        // Fallback to literal string if JSON parse fails
      }
    }

    return trimmed;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatCreativeText(item, joinSeparator))
      .filter((item) => Boolean(item) && item !== "[object Object]");

    return items.join(joinSeparator);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    // Common single-value object wrappers
    if (typeof record.rule === "string" && record.rule.trim()) {
      return formatCreativeText(record.rule, joinSeparator);
    }
    if (typeof record.description === "string" && record.description.trim()) {
      return formatCreativeText(record.description, joinSeparator);
    }
    if (typeof record.text === "string" && record.text.trim()) {
      return formatCreativeText(record.text, joinSeparator);
    }
    if (typeof record.symbol === "string" && record.symbol.trim()) {
      return formatCreativeText(record.symbol, joinSeparator);
    }

    // Key-value object mapping
    const entries = Object.entries(record)
      .map(([key, val]) => {
        const formattedKey = key.replace(/_/g, " ").trim();
        const formattedVal = formatCreativeText(val, ", ");
        if (!formattedVal || formattedVal === "[object Object]") return "";
        return `${formattedKey}: ${formattedVal}`;
      })
      .filter(Boolean);

    return entries.join(joinSeparator);
  }

  return "";
}

/**
 * Normalizes an array of items (e.g. continuity_rules or visual_rules) into readable multiline text.
 */
export function formatCreativeLines(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") return "";
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return formatCreativeLines(parsed);
      } catch {
        // Fall through
      }
    }
    return trimmed
      .split("\n")
      .map((line) => formatCreativeText(line))
      .filter((line) => Boolean(line) && line !== "[object Object]")
      .join("\n");
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => formatCreativeText(item))
      .filter((item) => Boolean(item) && item !== "[object Object]")
      .join("\n");
  }

  if (typeof value === "object") {
    const formatted = formatCreativeText(value, "\n");
    return formatted.replace(/;\s*/g, "\n");
  }

  return "";
}

/**
 * Normalizes a record (e.g. character or environment sheet) so all properties are clean strings.
 */
export function formatCreativeRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = formatCreativeText(val);
  }
  return result;
}
