import * as fs from "node:fs";
import * as path from "node:path";

import { createGenerator, type Config } from "ts-json-schema-generator";

import { MAX_COMMENTATORS } from "../src/domain";
import { REPLICANT_NAMES } from "../src/replicants/names";
import { REPLICANT_SCHEMA_TYPES } from "../src/replicants/schema-types";

const JSON_SCHEMA_DRAFT_07 = "http://json-schema.org/draft-07/schema#";
const ROOT_DIR = process.cwd();
const SCHEMAS_DIR = path.join(ROOT_DIR, "schemas");
const ENTRY_POINT = path.join(ROOT_DIR, "src", "replicants", "value-types.ts");

type JsonObject = Record<string, unknown>;

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

/**
 * Encode domain constraints that cannot be expressed in the TypeScript type
 * (at most 3, unique commentators) into the generated schema so the schema and
 * the runtime validation agree.
 */
function applyDomainConstraints(node: unknown, parentKey?: string): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      applyDomainConstraints(item);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }

  const object = node as JsonObject;
  if (parentKey === "commentatorPlayerIds" || parentKey === "commentators") {
    object.maxItems = MAX_COMMENTATORS;
    object.uniqueItems = true;
  }

  for (const [key, value] of Object.entries(object)) {
    applyDomainConstraints(value, key);
  }
}

function buildSchemas(): Map<string, JsonObject> {
  const config: Config = {
    path: ENTRY_POINT,
    tsconfig: path.join(ROOT_DIR, "tsconfig.json"),
    type: "*",
    expose: "export",
    topRef: false,
    jsDoc: "none",
    skipTypeCheck: false,
    additionalProperties: false,
    sortProps: true,
  };

  const generator = createGenerator(config);
  const schemas = new Map<string, JsonObject>();

  for (const name of REPLICANT_NAMES) {
    const typeName = REPLICANT_SCHEMA_TYPES[name];
    const schema = generator.createSchema(typeName) as JsonObject;
    schema.$schema = JSON_SCHEMA_DRAFT_07;
    schema.title = name;
    applyDomainConstraints(schema);
    schemas.set(name, schema);
  }

  return schemas;
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  const schemas = buildSchemas();

  if (!fs.existsSync(SCHEMAS_DIR)) {
    fs.mkdirSync(SCHEMAS_DIR, { recursive: true });
  }

  let hasDrift = false;

  for (const [name, schema] of schemas) {
    const filePath = path.join(SCHEMAS_DIR, `${name}.json`);
    const next = `${stableStringify(schema)}\n`;
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;

    if (checkOnly) {
      if (current !== next) {
        hasDrift = true;
        console.error(
          current === null
            ? `Missing schema: schemas/${name}.json`
            : `Out of date schema: schemas/${name}.json`,
        );
      }
      continue;
    }

    fs.writeFileSync(filePath, next, "utf-8");
    console.log(`Wrote schemas/${name}.json`);
  }

  if (checkOnly) {
    if (hasDrift) {
      console.error("Schemas are out of date. Run `npm run schema:generate`.");
      process.exit(1);
    }
    console.log(`Schemas are up to date (${schemas.size} files).`);
  }
}

main();
