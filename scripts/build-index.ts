// Build-time read pipeline (SPEC §2, §4): aggregate schemes/*.json into a single
// static index plus a tag index. Output is served statically; there is no runtime
// GitHub read API. Run via `npm run build:index` (invoked by dev/build).

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScheme, slugify } from "../src/validate.ts";
import type { IndexedScheme, SchemeIndex } from "../src/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemesDir = join(root, "schemes");
const outFile = join(root, "public", "index.json");

function build(): SchemeIndex {
  const files = readdirSync(schemesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const schemes: IndexedScheme[] = [];
  const tags: Record<string, number> = {};
  const errors: string[] = [];

  for (const file of files) {
    const slug = basename(file, ".json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(schemesDir, file), "utf8"));
    } catch (e) {
      errors.push(`${file}: invalid JSON (${(e as Error).message})`);
      continue;
    }
    const result = validateScheme(parsed);
    if (!result.ok) {
      errors.push(`${file}: ${result.errors.join("; ")}`);
      continue;
    }
    const expected = slugify(result.value.name);
    if (slug !== expected) {
      // Not fatal (collision suffixes are allowed), but worth surfacing.
      console.warn(`  note: ${file} slug "${slug}" != slugify(name) "${expected}"`);
    }
    schemes.push({ ...result.value, slug });
    for (const tag of result.value.tags) {
      tags[tag] = (tags[tag] ?? 0) + 1;
    }
  }

  if (errors.length) {
    console.error("build-index: invalid scheme(s):");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  return { version: 1, schemes, tags };
}

const index = build();
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(index) + "\n");
console.log(
  `build-index: ${index.schemes.length} scheme(s), ${Object.keys(index.tags).length} tag(s) -> public/index.json`,
);
