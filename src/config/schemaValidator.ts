type JsonSchema = {
  type?: string;
  additionalProperties?: boolean | JsonSchema;
  required?: readonly string[];
  properties?: Readonly<Record<string, JsonSchema>>;
  items?: JsonSchema;
  enum?: readonly unknown[];
  const?: unknown;
  minLength?: number;
  allOf?: readonly JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
};

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function pathFor(path: string, segment: string): string {
  return path === "$" ? `$.${segment}` : `${path}.${segment}`;
}

function validate(schema: JsonSchema, value: unknown, path: string, errors: string[], collectErrors = true): boolean {
  const localErrors: string[] = [];
  const target = collectErrors ? errors : localErrors;

  if (schema.const !== undefined && value !== schema.const) target.push(`${path} must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) target.push(`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`);

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

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validate(schema.items as JsonSchema, item, `${path}[${index}]`, target));
  }

  const isObjectSchema = schema.type === "object" || schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined;
  if (isObjectSchema && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) target.push(`${pathFor(path, required)} is required`);
    }

    const properties = schema.properties ?? {};
    for (const [key, nestedValue] of Object.entries(record)) {
      const nestedSchema = properties[key];
      if (nestedSchema) validate(nestedSchema, nestedValue, pathFor(path, key), target);
      else if (schema.additionalProperties === false) target.push(`${pathFor(path, key)} is not allowed`);
      else if (typeof schema.additionalProperties === "object") validate(schema.additionalProperties, nestedValue, pathFor(path, key), target);
    }
  }

  for (const nested of schema.allOf ?? []) validate(nested, value, path, target);
  if (schema.if && validate(schema.if, value, path, [], false) && schema.then) validate(schema.then, value, path, target);

  return target.length === 0;
}

export function validateJsonSchema(schema: JsonSchema, value: unknown): string[] {
  const errors: string[] = [];
  validate(schema, value, "$", errors);
  return errors;
}
