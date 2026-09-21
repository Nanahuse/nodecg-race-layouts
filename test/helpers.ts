import * as fs from "node:fs";
import * as path from "node:path";

import Ajv, { type ValidateFunction } from "ajv";

import type { ReplicantName } from "../src/replicants/names";

const SCHEMAS_DIR = path.resolve(process.cwd(), "schemas");

export function loadSchema(name: ReplicantName): Record<string, unknown> {
  const filePath = path.join(SCHEMAS_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

const ajv = new Ajv({ allErrors: true, strict: false });

export function compileSchema(name: ReplicantName): ValidateFunction {
  return ajv.compile(loadSchema(name));
}

export function isValid(name: ReplicantName, value: unknown): boolean {
  const validate = compileSchema(name);
  return validate(value) as boolean;
}
