import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const schemaPath = path.join(planDir, "schema-drafts", "P1-GraphCore.schema.json");

const supportedKeywords = [
  "$ref",
  "oneOf",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minLength",
  "minItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "format:date-time",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/$defs/")) {
    throw new Error(`Unsupported ref: ${ref}`);
  }
  const defName = ref.slice("#/$defs/".length);
  const resolved = root.$defs?.[defName];
  if (!resolved) {
    throw new Error(`Missing ref target: ${ref}`);
  }
  return { defName, schema: resolved };
}

function chooseType(schema) {
  if (schema.type) {
    return asArray(schema.type).find((item) => item !== "null") ?? "null";
  }
  if (schema.properties || schema.required || schema.additionalProperties !== undefined) return "object";
  if (schema.items) return "array";
  if (schema.enum) return typeof schema.enum[0];
  if (schema.const !== undefined) return typeof schema.const;
  return "object";
}

function sampleFor(root, schema, trail = []) {
  if (schema.$ref) {
    const { defName, schema: resolved } = resolveRef(root, schema.$ref);
    if (trail.includes(defName)) {
      return `${defName}_ref`;
    }
    return sampleFor(root, resolved, [...trail, defName]);
  }

  if (schema.const !== undefined) return cloneJson(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return cloneJson(schema.enum[0]);

  const type = chooseType(schema);

  if (type === "object") {
    const output = {};
    const properties = schema.properties ?? {};
    for (const propertyName of schema.required ?? []) {
      const propertySchema = properties[propertyName];
      output[propertyName] = propertySchema
        ? sampleFor(root, propertySchema, trail)
        : `${propertyName}_value`;
    }
    return output;
  }

  if (type === "array") {
    const minItems = schema.minItems ?? 0;
    const itemCount = Math.max(minItems, 0);
    const items = [];
    for (let index = 0; index < itemCount; index += 1) {
      items.push(sampleFor(root, schema.items ?? { type: "string" }, trail));
    }
    return items;
  }

  if (type === "string") {
    return schema.format === "date-time" ? "2026-07-05T00:00:00+08:00" : "sample";
  }

  if (type === "integer") {
    return Number.isInteger(schema.minimum) ? schema.minimum : 0;
  }

  if (type === "number") {
    return typeof schema.minimum === "number" ? schema.minimum : 0.5;
  }

  if (type === "boolean") return false;
  if (type === "null") return null;
  return "sample";
}

function typeMatches(type, value) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

function validate(root, schema, value, instancePath = "$") {
  if (schema.$ref) {
    return validate(root, resolveRef(root, schema.$ref).schema, value, instancePath);
  }

  const errors = [];

  if (schema.oneOf) {
    const matches = schema.oneOf
      .map((candidate) => validate(root, candidate, value, instancePath))
      .filter((candidateErrors) => candidateErrors.length === 0);
    if (matches.length !== 1) {
      errors.push(`${instancePath}: expected exactly one oneOf match, got ${matches.length}`);
    }
  }

  if (schema.type) {
    const allowedTypes = asArray(schema.type);
    if (!allowedTypes.some((type) => typeMatches(type, value))) {
      errors.push(`${instancePath}: expected type ${allowedTypes.join("|")}`);
      return errors;
    }
  }

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${instancePath}: const mismatch`);
  }

  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(`${instancePath}: enum mismatch`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${instancePath}: string shorter than minLength ${schema.minLength}`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      errors.push(`${instancePath}: invalid date-time`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${instancePath}: number below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${instancePath}: number above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${instancePath}: array shorter than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) {
        errors.push(`${instancePath}: array items are not unique`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(root, schema.items, item, `${instancePath}[${index}]`));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = schema.properties ?? {};
    for (const requiredName of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, requiredName)) {
        errors.push(`${instancePath}: missing required property ${requiredName}`);
      }
    }

    for (const [propertyName, propertyValue] of Object.entries(value)) {
      if (properties[propertyName]) {
        errors.push(...validate(root, properties[propertyName], propertyValue, `${instancePath}.${propertyName}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${instancePath}: unexpected additional property ${propertyName}`);
      } else if (isPlainObject(schema.additionalProperties)) {
        errors.push(
          ...validate(root, schema.additionalProperties, propertyValue, `${instancePath}.${propertyName}`)
        );
      }
    }
  }

  return errors;
}

function makeTopLevelPositiveCases(schema) {
  return schema.oneOf.map((entry) => {
    const defName = entry.$ref.slice("#/$defs/".length);
    return {
      id: `positive_${defName}`,
      def_name: defName,
      value: sampleFor(schema, entry),
      expect_valid: true,
    };
  });
}

function makeTopLevelNegativeCases(schema, positiveCases) {
  const cases = [];

  for (const positiveCase of positiveCases) {
    const def = schema.$defs[positiveCase.def_name];
    const required = def.required ?? [];
    if (required.length > 0) {
      const missingRequired = cloneJson(positiveCase.value);
      delete missingRequired[required[0]];
      cases.push({
        id: `negative_${positiveCase.def_name}_missing_${required[0]}`,
        def_name: positiveCase.def_name,
        value: missingRequired,
        expect_valid: false,
      });
    }

    const extraProperty = cloneJson(positiveCase.value);
    extraProperty.__unexpected = true;
    cases.push({
      id: `negative_${positiveCase.def_name}_additional_property`,
      def_name: positiveCase.def_name,
      value: extraProperty,
      expect_valid: false,
    });

    if (Object.prototype.hasOwnProperty.call(positiveCase.value, "schema")) {
      const wrongConst = cloneJson(positiveCase.value);
      wrongConst.schema = "WrongSchema.v999";
      cases.push({
        id: `negative_${positiveCase.def_name}_wrong_schema_const`,
        def_name: positiveCase.def_name,
        value: wrongConst,
        expect_valid: false,
      });
    }
  }

  cases.push({
    id: "negative_unknown_top_level_object",
    def_name: null,
    value: { schema: "Unknown.v1", unknown_id: "x" },
    expect_valid: false,
  });

  return cases;
}

function makeNestedBoundaryCases(schema) {
  const cases = [];

  const boundaryFlags = sampleFor(schema, { $ref: "#/$defs/BoundaryFlags" });
  cases.push({
    id: "positive_boundary_flags_all_false",
    schema_node: { $ref: "#/$defs/BoundaryFlags" },
    value: boundaryFlags,
    expect_valid: true,
  });

  const boundaryFlagsBad = cloneJson(boundaryFlags);
  boundaryFlagsBad.relationship_state_write_allowed = true;
  cases.push({
    id: "negative_boundary_flags_relationship_write_true",
    schema_node: { $ref: "#/$defs/BoundaryFlags" },
    value: boundaryFlagsBad,
    expect_valid: false,
  });

  const particle = sampleFor(schema, { $ref: "#/$defs/ParticleProjectionEntry" });
  cases.push({
    id: "positive_particle_projection_write_back_false",
    schema_node: { $ref: "#/$defs/ParticleProjectionEntry" },
    value: particle,
    expect_valid: true,
  });

  const particleBad = cloneJson(particle);
  particleBad.write_back_allowed = true;
  cases.push({
    id: "negative_particle_projection_write_back_true",
    schema_node: { $ref: "#/$defs/ParticleProjectionEntry" },
    value: particleBad,
    expect_valid: false,
  });

  const objectRefBad = sampleFor(schema, { $ref: "#/$defs/ObjectRef" });
  objectRefBad.object_type = "UnknownObject";
  cases.push({
    id: "negative_object_ref_unknown_object_type",
    schema_node: { $ref: "#/$defs/ObjectRef" },
    value: objectRefBad,
    expect_valid: false,
  });

  return cases;
}

const result = {
  validator: "validate-p1-json-schema-contract.mjs",
  schema_path: schemaPath,
  schema_file_exists: fs.existsSync(schemaPath),
  json_parse: false,
  in_memory_only: true,
  writes_fixture_artifacts: false,
  supported_keywords: supportedKeywords,
  top_level_positive_cases_tested: 0,
  top_level_negative_cases_tested: 0,
  nested_boundary_cases_tested: 0,
  positive_failures: [],
  negative_unexpected_passes: [],
  unexpected_validator_errors: [],
  validation_status: "FAIL_P1_JSON_SCHEMA_CONTRACT",
};

if (result.schema_file_exists) {
  let schema = null;
  try {
    schema = readJson(schemaPath);
    result.json_parse = true;
  } catch (error) {
    result.parse_error = error.message;
  }

  if (schema) {
    const positiveCases = makeTopLevelPositiveCases(schema);
    const negativeCases = makeTopLevelNegativeCases(schema, positiveCases);
    const nestedBoundaryCases = makeNestedBoundaryCases(schema);

    result.top_level_positive_cases_tested = positiveCases.length;
    result.top_level_negative_cases_tested = negativeCases.length;
    result.nested_boundary_cases_tested = nestedBoundaryCases.length;

    for (const testCase of positiveCases) {
      try {
        const errors = validate(schema, schema, testCase.value);
        if (errors.length > 0) {
          result.positive_failures.push({
            id: testCase.id,
            def_name: testCase.def_name,
            errors,
          });
        }
      } catch (error) {
        result.unexpected_validator_errors.push({ id: testCase.id, error: error.message });
      }
    }

    for (const testCase of negativeCases) {
      try {
        const errors = validate(schema, schema, testCase.value);
        if (errors.length === 0) {
          result.negative_unexpected_passes.push({
            id: testCase.id,
            def_name: testCase.def_name,
          });
        }
      } catch (error) {
        result.unexpected_validator_errors.push({ id: testCase.id, error: error.message });
      }
    }

    for (const testCase of nestedBoundaryCases) {
      try {
        const errors = validate(schema, testCase.schema_node, testCase.value);
        const passed = errors.length === 0;
        if (testCase.expect_valid && !passed) {
          result.positive_failures.push({
            id: testCase.id,
            def_name: null,
            errors,
          });
        }
        if (!testCase.expect_valid && passed) {
          result.negative_unexpected_passes.push({
            id: testCase.id,
            def_name: null,
          });
        }
      } catch (error) {
        result.unexpected_validator_errors.push({ id: testCase.id, error: error.message });
      }
    }
  }
}

const passed =
  result.schema_file_exists &&
  result.json_parse &&
  result.top_level_positive_cases_tested > 0 &&
  result.top_level_negative_cases_tested > 0 &&
  result.nested_boundary_cases_tested > 0 &&
  result.positive_failures.length === 0 &&
  result.negative_unexpected_passes.length === 0 &&
  result.unexpected_validator_errors.length === 0;

result.validation_status = passed
  ? "PASS_P1_JSON_SCHEMA_CONTRACT"
  : "FAIL_P1_JSON_SCHEMA_CONTRACT";

console.log(JSON.stringify(result, null, 2));

if (!passed) {
  process.exitCode = 1;
}
