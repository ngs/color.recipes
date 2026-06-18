// Build-time read pipeline (SPEC §2, §4): aggregate schemes/*.json into a single
// static index plus a tag index. Output is served statically; there is no runtime
// GitHub read API. Run via `npm run build:index` (invoked by dev/build).

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { validateScheme, slugify } from "../src/validate.ts";
import { hexToRgb } from "../src/color.ts";
import type { IndexedScheme, SchemeIndex } from "../src/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemesDir = join(root, "schemes");
const outFile = join(root, "public", "index.json");
const ogDir = join(root, "public", "og");

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Open Graph image: the palette as vertical bands (no text — the name is in og:title).
function writeOgImage(scheme: IndexedScheme): void {
  const png = new PNG({ width: OG_WIDTH, height: OG_HEIGHT });
  const colors = scheme.colors.map(hexToRgb);
  const bandWidth = OG_WIDTH / colors.length;
  for (let x = 0; x < OG_WIDTH; x++) {
    const { r, g, b } = colors[Math.min(colors.length - 1, Math.floor(x / bandWidth))];
    for (let y = 0; y < OG_HEIGHT; y++) {
      const i = (y * OG_WIDTH + x) << 2;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(join(ogDir, `${scheme.slug}.png`), PNG.sync.write(png));
}

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

mkdirSync(ogDir, { recursive: true });
for (const scheme of index.schemes) writeOgImage(scheme);

console.log(
  `build-index: ${index.schemes.length} scheme(s), ${Object.keys(index.tags).length} tag(s) -> public/index.json + ${index.schemes.length} OG image(s)`,
);
