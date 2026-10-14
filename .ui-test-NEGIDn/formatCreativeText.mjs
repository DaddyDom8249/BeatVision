/**
 * Human-readable, lossless display of World-derived JSONB fields.
 * The canonical World data stays structured; only draft editor values are flattened.
 */
export function formatCreativeText(value) {
    if (value == null)
        return "";
    if (typeof value === "string") {
        const input = value.trim();
        if (!input || input === "[object Object]")
            return "";
        if ((input.startsWith("{") && input.endsWith("}")) ||
            (input.startsWith("[") && input.endsWith("]"))) {
            try {
                return formatCreativeText(JSON.parse(input));
            }
            catch {
                // Creator-authored strings need not be valid JSON.
            }
        }
        return value;
    }
    if (Array.isArray(value))
        return value.map(formatCreativeText).filter(Boolean).join("\n");
    if (typeof value === "object") {
        const record = value;
        const keys = Object.keys(record);
        if (keys.length === 1 && ["rule", "text", "description", "url", "path"].includes(keys[0])) {
            return formatCreativeText(record[keys[0]]);
        }
        return keys.map((key) => {
            const text = formatCreativeText(record[key]);
            return text ? key.replace(/_/g, " ") + ": " + text : "";
        }).filter(Boolean).join("\n");
    }
    return String(value);
}
export function formatCreativeLines(value) {
    if (Array.isArray(value))
        return value.flatMap((item) => formatCreativeText(item).split("\n")).map((line) => line.trim()).filter(Boolean);
    return formatCreativeText(value).split("\n").map((line) => line.trim()).filter(Boolean);
}
export function formatCreativeRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value)
        .map(([key, fieldValue]) => [key, formatCreativeText(fieldValue)]));
}
/** Draft-only recovery: never throw away valid creator-authored rules. */
export function recoverWorldContinuity(draft, worldRules) {
    const existing = Array.isArray(draft) ? draft : [];
    if (existing.length && existing.every((item) => item === "[object Object]")) {
        return formatCreativeLines(worldRules);
    }
    return formatCreativeLines(draft);
}
export function getCreativeErrorMessage(error, fallback) {
    if (error && typeof error === "object") {
        const record = error;
        for (const key of ["message", "error_description", "details", "hint", "code"]) {
            if (typeof record[key] === "string" && record[key].trim())
                return record[key].trim();
        }
    }
    return error instanceof Error ? error.message : fallback;
}
/** Preserve nested JSONB values whenever the creator did not change that field. */
export function mergeCreativeSheet(original, edited) {
    const source = original && typeof original === "object" && !Array.isArray(original)
        ? original : {};
    const result = { ...source };
    for (const [field, value] of Object.entries(edited)) {
        result[field] = Object.prototype.hasOwnProperty.call(source, field) &&
            formatCreativeText(source[field]) === value
            ? source[field] : value;
    }
    return result;
}
