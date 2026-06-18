// CI validation (SPEC §5, validate.yml). Validates every schemes/*.json against
// the canonical JSON Schema (schema/scheme.schema.json) using ajv — the authoritative
// check. Node allows ajv's code generation, so this uses the real schema directly;
// the runtime validators in src/validate.ts mirror these same rules.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemesDir = join(root, "schemes");
const schemaPath = join(root, "schema", "scheme.schema.json");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const files = readdirSync(schemesDir).filter((f) => f.endsWith(".json"));
let failures = 0;

for (const file of files) {
  const path = join(schemesDir, file);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`✗ ${file}: invalid JSON (${(e as Error).message})`);
    failures++;
    continue;
  }
  if (validate(data)) {
    console.log(`✓ ${file}`);
  } else {
    failures++;
    console.error(`✗ ${file}`);
    for (const err of validate.errors ?? []) {
      console.error(`    ${err.instancePath || "/"} ${err.message}`);
    }
  }
}

console.log(`\n${files.length - failures}/${files.length} valid`);
if (failures) process.exit(1);
