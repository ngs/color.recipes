// Shared scheme validation (SPEC §6, §7).
//
// This mirrors schema/scheme.schema.json, which is the canonical contract and is
// enforced on committed data in CI (scripts/validate-schemes.ts via ajv). This
// module is imported by BOTH the browser client and the Worker, so it must stay
// dependency-free and avoid runtime code generation: the Workers runtime forbids
// `eval`/`new Function`, which rules out running ajv directly there.
//
// Keep the rules below in sync with scheme.schema.json.

export interface Scheme {
  version: 1;
  name: string;
  tags: string[];
  colors: string[];
  source: "ai" | "manual";
  createdAt: string;
}

/** The subset the AI is asked to return (SPEC §7); the app fills the rest. */
export type AiInput = Pick<Scheme, "name" | "tags" | "colors">;

export const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const NAME_MAX = 80;
export const TAG_MAX = 32;
export const TAGS_MAX = 16;
export const COLORS_MIN = 2;
export const COLORS_MAX = 12;

export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err {
  ok: false;
  errors: string[];
}
export type Result<T> = Ok<T> | Err;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkName(name: unknown, errors: string[]): void {
  if (typeof name !== "string" || name.length < 1 || name.length > NAME_MAX) {
    errors.push(`"name" must be a non-empty string (max ${NAME_MAX} chars)`);
  }
}

function checkTags(tags: unknown, errors: string[]): void {
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > TAGS_MAX) {
    errors.push(`"tags" must be an array of 1-${TAGS_MAX} items`);
    return;
  }
  for (const tag of tags) {
    if (typeof tag !== "string" || !TAG_RE.test(tag) || tag.length > TAG_MAX) {
      errors.push(`tag ${JSON.stringify(tag)} must match ${TAG_RE} (max ${TAG_MAX} chars)`);
    }
  }
}

function checkColors(colors: unknown, errors: string[]): void {
  if (!Array.isArray(colors) || colors.length < COLORS_MIN || colors.length > COLORS_MAX) {
    errors.push(`"colors" must be an array of ${COLORS_MIN}-${COLORS_MAX} hex strings`);
    return;
  }
  for (const c of colors) {
    if (typeof c !== "string" || !HEX_RE.test(c)) {
      errors.push(`color ${JSON.stringify(c)} must be #RRGGBB`);
    }
  }
}

/** Validate the AI-returned subset (name/tags/colors). */
export function validateAiInput(input: unknown): Result<AiInput> {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["expected a JSON object"] };
  }
  checkName(input.name, errors);
  checkTags(input.tags, errors);
  checkColors(input.colors, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: (input.name as string).trim(),
      tags: input.tags as string[],
      colors: (input.colors as string[]).map((c) => c.toLowerCase()),
    },
  };
}

/** Validate a complete scheme object (the shape stored in schemes/*.json). */
export function validateScheme(input: unknown): Result<Scheme> {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["expected a JSON object"] };
  }
  if (input.version !== 1) errors.push(`"version" must be 1`);
  checkName(input.name, errors);
  checkTags(input.tags, errors);
  checkColors(input.colors, errors);
  if (input.source !== "ai" && input.source !== "manual") {
    errors.push(`"source" must be "ai" or "manual"`);
  }
  if (typeof input.createdAt !== "string" || !DATE_RE.test(input.createdAt)) {
    errors.push(`"createdAt" must be a YYYY-MM-DD date`);
  }
  // Reject unknown keys (mirrors additionalProperties: false).
  const allowed = new Set(["version", "name", "tags", "colors", "source", "createdAt"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors.push(`unexpected property ${JSON.stringify(key)}`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: input as unknown as Scheme };
}

// GitHub repository name rules: letters, digits, '-', '_', '.', max 100 chars,
// and not "." or "..". Used when forking under a user-chosen name.
export const REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;
export const REPO_NAME_MAX = 100;

export function validateRepoName(input: unknown): Result<string> {
  if (typeof input !== "string") return { ok: false, errors: ["repository name must be a string"] };
  const name = input.trim();
  const errors: string[] = [];
  if (!name) {
    errors.push("repository name is required");
  } else {
    if (name.length > REPO_NAME_MAX) errors.push(`repository name must be at most ${REPO_NAME_MAX} characters`);
    if (name === "." || name === "..") errors.push('repository name cannot be "." or ".."');
    if (!REPO_NAME_RE.test(name)) errors.push("only letters, digits, '-', '_' and '.' are allowed");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: name };
}

/** Filename-safe slug derived from a scheme name (SPEC §6). */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "scheme";
}
