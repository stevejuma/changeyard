type JsonSchema = {
  type?: string;
  additionalProperties?: boolean | JsonSchema;
  pattern?: string;
  required?: readonly string[];
  properties?: Readonly<Record<string, JsonSchema>>;
  items?: JsonSchema;
  enum?: readonly unknown[];
  const?: unknown;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  allOf?: readonly JsonSchema[];
  anyOf?: readonly JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
};

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function pathFor(path: string, segment: string): string {
  return path === "$" ? `$.${segment}` : `${path}.${segment}`;
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function suggestKeys(allowed: string[], provided: string): string {
  const near = allowed
    .map((candidate) => ({ candidate, distance: levenshtein(candidate, provided) }))
    .filter((entry) => entry.distance <= 3)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 3)
    .map((entry) => entry.candidate);
  if (!near.length) return "";
  return ` Did you mean: ${near.join(", ")}?`;
}

function suggestEnum(allowed: readonly unknown[], provided: unknown): string {
  if (typeof provided !== "string") return "";
  const near = allowed
    .filter((entry) => typeof entry === "string")
    .map((entry) => ({ candidate: entry as string, distance: levenshtein(entry as string, provided) }))
    .filter((entry) => entry.distance <= 3)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 3)
    .map((entry) => entry.candidate);
  if (!near.length) return "";
  return ` Did you mean: ${near.join(", ")}?`;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validate(schema: JsonSchema, value: unknown, path: string, errors: string[], collectErrors = true): boolean {
  const localErrors: string[] = [];
  const target = collectErrors ? errors : localErrors;
  if (schema.const !== undefined && value !== schema.const) {
    target.push(`${path} must be ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    target.push(`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}, got ${JSON.stringify(value)}${suggestEnum(schema.enum, value)}`);
  }

  if (value === undefined) {
    if (schema.type && schema.type !== "object" && schema.type !== "array") return false;
    return true;
  }

  if (schema.type) {
    const actual = typeOf(value);
    if (actual !== schema.type) {
      target.push(`${path} must be ${schema.type}, got ${actual}`);
      return collectErrors ? false : target.length === 0;
    }
  }

  if (schema.type === "string" && typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength) {
    target.push(`${path} must have length at least ${schema.minLength}`);
  }

  if (schema.type === "string" && typeof value === "string" && schema.maxLength !== undefined && value.length > schema.maxLength) {
    target.push(`${path} must have length at most ${schema.maxLength}`);
  }

  if (schema.type === "string" && typeof value === "string" && schema.pattern !== undefined) {
    try {
      const pattern = new RegExp(schema.pattern);
      if (!pattern.test(value)) target.push(`${path} does not match required pattern ${JSON.stringify(schema.pattern)}`);
    } catch {
      target.push(`${path} has an invalid schema pattern ${JSON.stringify(schema.pattern)}`);
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.minItems !== undefined && value.length < schema.minItems) {
    target.push(`${path} must include at least ${schema.minItems} item(s)`);
  }

  if (schema.type === "array" && Array.isArray(value) && schema.maxItems !== undefined && value.length > schema.maxItems) {
    target.push(`${path} must include at most ${schema.maxItems} item(s)`);
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validate(schema.items as JsonSchema, item, `${path}[${index}]`, target));
  }

  const isObjectSchema = schema.type === "object" || schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined;
  if (isObjectSchema && isObjectLike(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) target.push(`${pathFor(path, required)} is required`);
    }

    const properties = schema.properties ?? {};
    const propertyKeys = Object.keys(properties);
    for (const [key, nestedValue] of Object.entries(record)) {
      const nestedSchema = properties[key];
      if (nestedSchema) validate(nestedSchema, nestedValue, pathFor(path, key), target);
      else if (schema.additionalProperties === false) {
        target.push(`${pathFor(path, key)} is not allowed.${suggestKeys(propertyKeys, key)}`);
      } else if (typeof schema.additionalProperties === "object") {
        validate(schema.additionalProperties, nestedValue, pathFor(path, key), target);
      }
    }
  }

  for (const nested of schema.allOf ?? []) validate(nested, value, path, target);
  if (schema.anyOf?.length) {
    const matched = schema.anyOf.some((nested) => validate(nested, value, path, [], false));
    if (!matched) target.push(`${path} must match at least one allowed schema`);
  }
  if (schema.if) {
    const ifResult = validate(schema.if, value, path, [], false);
    if (ifResult && schema.then) validate(schema.then, value, path, target);
    if (!ifResult && schema.else) validate(schema.else, value, path, target);
  }

  return target.length === 0;
}

export function validateJsonSchema(schema: JsonSchema, value: unknown): string[] {
  const errors: string[] = [];
  validate(schema, value, "$", errors);
  return errors;
}
