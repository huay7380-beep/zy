import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../schema-drafts/P1-GraphCore.schema.json");

const requiredTopLevelDefs = [
  "SourceArchive",
  "SourceEpisode",
  "EvidenceAnchor",
  "RawEvent",
  "SemanticEvent",
  "NestedEvent",
  "ConflictSet",
  "TagDefinition",
  "TagAssignment",
  "PersonIndexEntry",
  "TimelineIndexEntry",
  "EventIndexEntry",
  "SourceIndexEntry",
  "TagIndexEntry",
  "FeatureIndexEntry",
  "EvidenceIndexEntry",
  "NarrativeIndexEntry",
  "TrajectoryRecord",
  "PhaseSegment",
  "TurningPoint",
  "PatternClaim",
  "ContextFrame",
  "SourcePerspective",
  "CausalHypothesis",
  "RetrievalHitPackage",
  "ContextSnapshotRankingPolicy",
  "ContextSnapshotRankingDecision",
  "SummaryShard",
  "ContextSnapshot",
  "NarrativeContextSnapshot",
  "WeightProfile",
  "ConfirmationGate",
  "ParticleProjectionEntry"
];

const narrativeDefs = [
  "TrajectoryRecord",
  "PhaseSegment",
  "TurningPoint",
  "PatternClaim",
  "ContextFrame",
  "SourcePerspective",
  "CausalHypothesis"
];

const intentionallyExternalObjectRefs = new Set(["AtomicFact", "Signal"]);

function collectRefs(node, refs = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
    return refs;
  }
  if (!node || typeof node !== "object") return refs;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) {
      refs.add(value.slice("#/$defs/".length));
    }
    collectRefs(value, refs);
  }
  return refs;
}

function requiredFields(schema, defName) {
  return Array.isArray(schema.$defs?.[defName]?.required)
    ? schema.$defs[defName].required
    : [];
}

function propertyAt(schema, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), schema);
}

function validate() {
  const result = {
    validator: "validate-p1-schema.mjs",
    schema_path: schemaPath,
    schema_file_exists: existsSync(schemaPath),
    json_parse: false,
    schema_draft_2020_12: false,
    has_id: false,
    has_oneOf: false,
    has_defs: false,
    defs_count: 0,
    top_level_oneOf_count: 0,
    missing_top_level_defs: [],
    duplicate_top_level_refs: [],
    recursive_ref_count: 0,
    missing_recursive_refs: [],
    object_ref_enum_count: 0,
    missing_object_defs_excluding_atomic_signal: [],
    intentionally_external_object_refs: [...intentionallyExternalObjectRefs],
    missing_narrative_defs: [],
    narrative_missing_required_evidence: [],
    narrative_missing_required_boundary: [],
    boundary_flags_const_false: false,
    particle_write_back_const_false: false,
    validation_status: "FAIL"
  };

  if (!result.schema_file_exists) return result;

  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    result.json_parse = true;
  } catch (error) {
    result.parse_error = error.message;
    return result;
  }

  const defs = schema.$defs && typeof schema.$defs === "object" ? schema.$defs : {};
  const defNames = new Set(Object.keys(defs));
  const topRefs = Array.isArray(schema.oneOf)
    ? schema.oneOf.map((entry) => entry?.$ref?.replace("#/$defs/", "")).filter(Boolean)
    : [];
  const topRefCounts = new Map();
  for (const ref of topRefs) topRefCounts.set(ref, (topRefCounts.get(ref) || 0) + 1);

  const objectRefEnum = defs.ObjectRef?.properties?.object_type?.enum || [];
  const recursiveRefs = [...collectRefs(schema)].sort();
  const missingRecursiveRefs = recursiveRefs.filter((ref) => !defNames.has(ref));
  const missingObjectDefs = objectRefEnum.filter(
    (name) => !defNames.has(name) && !intentionallyExternalObjectRefs.has(name)
  );
  const missingNarrativeDefs = narrativeDefs.filter((name) => !defNames.has(name));
  const narrativeMissingEvidence = narrativeDefs.filter((name) => {
    const required = requiredFields(schema, name);
    return name === "SourcePerspective"
      ? !required.includes("applies_to_evidence_anchor_ids")
      : !required.includes("evidence_anchor_ids");
  });
  const narrativeMissingBoundary = narrativeDefs.filter(
    (name) => !requiredFields(schema, name).includes("boundary_flags")
  );

  result.schema_draft_2020_12 = schema.$schema === "https://json-schema.org/draft/2020-12/schema";
  result.has_id = typeof schema.$id === "string" && schema.$id.length > 0;
  result.has_oneOf = topRefs.length > 0;
  result.has_defs = defNames.size > 0;
  result.defs_count = defNames.size;
  result.top_level_oneOf_count = topRefs.length;
  result.missing_top_level_defs = requiredTopLevelDefs.filter((name) => !defNames.has(name));
  result.duplicate_top_level_refs = [...topRefCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ref]) => ref);
  result.recursive_ref_count = recursiveRefs.length;
  result.missing_recursive_refs = missingRecursiveRefs;
  result.object_ref_enum_count = objectRefEnum.length;
  result.missing_object_defs_excluding_atomic_signal = missingObjectDefs;
  result.missing_narrative_defs = missingNarrativeDefs;
  result.narrative_missing_required_evidence = narrativeMissingEvidence;
  result.narrative_missing_required_boundary = narrativeMissingBoundary;
  result.boundary_flags_const_false =
    propertyAt(schema, ["$defs", "BoundaryFlags", "properties", "relationship_state_write_allowed", "const"]) === false &&
    propertyAt(schema, ["$defs", "BoundaryFlags", "properties", "identity_merge_allowed", "const"]) === false &&
    propertyAt(schema, ["$defs", "BoundaryFlags", "properties", "external_action_allowed", "const"]) === false &&
    propertyAt(schema, ["$defs", "BoundaryFlags", "properties", "learning_weight_promotion_allowed", "const"]) === false;
  result.particle_write_back_const_false =
    propertyAt(schema, ["$defs", "ParticleProjectionEntry", "properties", "write_back_allowed", "const"]) === false;

  const failed =
    !result.schema_draft_2020_12 ||
    !result.has_id ||
    !result.has_oneOf ||
    !result.has_defs ||
    result.missing_top_level_defs.length > 0 ||
    result.duplicate_top_level_refs.length > 0 ||
    result.missing_recursive_refs.length > 0 ||
    result.missing_object_defs_excluding_atomic_signal.length > 0 ||
    result.missing_narrative_defs.length > 0 ||
    result.narrative_missing_required_evidence.length > 0 ||
    result.narrative_missing_required_boundary.length > 0 ||
    !result.boundary_flags_const_false ||
    !result.particle_write_back_const_false;

  result.validation_status = failed ? "FAIL" : "PASS";
  return result;
}

const result = validate();
console.log(JSON.stringify(result, null, 2));
if (result.validation_status !== "PASS") process.exitCode = 1;
