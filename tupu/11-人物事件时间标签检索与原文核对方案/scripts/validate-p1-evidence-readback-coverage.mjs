import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../schema-drafts/P1-GraphCore.schema.json");

const directEvidenceRequirements = {
  RawEvent: "evidence_anchor_ids",
  SemanticEvent: "evidence_anchor_ids",
  NestedEvent: "evidence_anchor_ids",
  TagAssignment: "evidence_anchor_ids",
  PersonIndexEntry: "evidence_anchor_ids",
  TimelineIndexEntry: "evidence_anchor_ids",
  EventIndexEntry: "evidence_anchor_ids",
  SourceIndexEntry: "evidence_anchor_ids",
  TagIndexEntry: "evidence_anchor_ids",
  FeatureIndexEntry: "evidence_anchor_ids",
  NarrativeIndexEntry: "evidence_anchor_ids",
  TrajectoryRecord: "evidence_anchor_ids",
  PhaseSegment: "evidence_anchor_ids",
  TurningPoint: "evidence_anchor_ids",
  PatternClaim: "evidence_anchor_ids",
  ContextFrame: "evidence_anchor_ids",
  SourcePerspective: "applies_to_evidence_anchor_ids",
  CausalHypothesis: "evidence_anchor_ids",
  RetrievalHitPackage: "evidence_anchor_ids",
  SummaryShard: "evidence_anchor_ids",
  ContextSnapshot: "evidence_anchor_ids",
  NarrativeContextSnapshot: "evidence_anchor_ids",
  ConfirmationGate: "evidence_anchor_ids",
};

const boundaryFlagRequirements = [
  "TrajectoryRecord",
  "PhaseSegment",
  "TurningPoint",
  "PatternClaim",
  "ContextFrame",
  "SourcePerspective",
  "CausalHypothesis",
  "RetrievalHitPackage",
  "ContextSnapshot",
  "NarrativeContextSnapshot",
];

const minimumParticleTypes = [
  "SourceParticle",
  "PersonParticle",
  "EventParticle",
  "TagParticle",
  "EvidenceParticle",
  "ConflictParticle",
  "TrajectoryParticle",
  "PhaseParticle",
  "PatternParticle",
  "ContextParticle",
  "WeightParticle",
  "GateParticle",
];

function requiredFields(schema, defName) {
  return Array.isArray(schema.$defs?.[defName]?.required)
    ? schema.$defs[defName].required
    : [];
}

function properties(schema, defName) {
  return schema.$defs?.[defName]?.properties || {};
}

function hasRequired(schema, defName, field) {
  return requiredFields(schema, defName).includes(field);
}

function propertyAt(schema, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), schema);
}

function enumAt(schema, path) {
  const value = propertyAt(schema, path);
  return Array.isArray(value) ? value : [];
}

function validate() {
  const result = {
    validator: "validate-p1-evidence-readback-coverage.mjs",
    schema_path: schemaPath,
    schema_file_exists: existsSync(schemaPath),
    json_parse: false,
    top_level_objects_checked: 0,
    source_archive_checks: {},
    evidence_anchor_checks: {},
    source_ref_checks: {},
    direct_evidence_missing: [],
    evidence_index_checks: {},
    conflict_set_indirect_evidence_checks: {},
    readback_status_checks: {},
    boundary_flag_missing: [],
    confirmation_gate_checks: {},
    particle_projection_checks: {},
    answerability_checks: {},
    summary_shard_checks: {},
    advisories: [],
    validation_status: "FAIL",
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

  const topLevelRefs = Array.isArray(schema.oneOf)
    ? schema.oneOf.map((entry) => entry?.$ref?.replace("#/$defs/", "")).filter(Boolean)
    : [];
  result.top_level_objects_checked = topLevelRefs.length;

  result.source_archive_checks = {
    required_source_archive_id: hasRequired(schema, "SourceArchive", "source_archive_id"),
    required_content_hash: hasRequired(schema, "SourceArchive", "content_hash"),
    required_delete_state: hasRequired(schema, "SourceArchive", "delete_state"),
    has_original_payload_pointer:
      "raw_text_ref" in properties(schema, "SourceArchive") &&
      "raw_payload_ref" in properties(schema, "SourceArchive") &&
      "artifact_refs" in properties(schema, "SourceArchive"),
    source_episode_requires_source_archive_id: hasRequired(
      schema,
      "SourceEpisode",
      "source_archive_id"
    ),
  };

  result.evidence_anchor_checks = {
    required_evidence_anchor_id: hasRequired(schema, "EvidenceAnchor", "evidence_anchor_id"),
    required_source_archive_id: hasRequired(schema, "EvidenceAnchor", "source_archive_id"),
    required_evidence_strength: hasRequired(schema, "EvidenceAnchor", "evidence_strength"),
    required_readback_status: hasRequired(schema, "EvidenceAnchor", "readback_status"),
    has_offset_or_hash_fields: [
      "raw_text_ref",
      "offset_start",
      "offset_end",
      "content_hash",
    ].every((field) => field in properties(schema, "EvidenceAnchor")),
  };

  result.source_ref_checks = {
    required_source_archive_id: hasRequired(schema, "SourceRef", "source_archive_id"),
    has_source_episode_id: "source_episode_id" in properties(schema, "SourceRef"),
    has_content_hash: "content_hash" in properties(schema, "SourceRef"),
  };

  result.direct_evidence_missing = Object.entries(directEvidenceRequirements)
    .filter(([defName, field]) => !hasRequired(schema, defName, field))
    .map(([defName, field]) => `${defName}.${field}`);

  result.evidence_index_checks = {
    requires_evidence_anchor_id: hasRequired(schema, "EvidenceIndexEntry", "evidence_anchor_id"),
    requires_source_archive_id: hasRequired(schema, "EvidenceIndexEntry", "source_archive_id"),
    requires_readback_status: hasRequired(schema, "EvidenceIndexEntry", "readback_status"),
  };

  result.conflict_set_indirect_evidence_checks = {
    requires_claim_refs: hasRequired(schema, "ConflictSet", "claim_refs"),
    claim_refs_min_items:
      propertyAt(schema, ["$defs", "ConflictSet", "properties", "claim_refs", "minItems"]) >= 2,
    claim_requires_evidence_anchor_ids: hasRequired(schema, "Claim", "evidence_anchor_ids"),
    claim_evidence_min_items:
      propertyAt(schema, ["$defs", "Claim", "properties", "evidence_anchor_ids", "minItems"]) >=
      1,
  };

  result.readback_status_checks = {
    readback_status_enum_complete: [
      "pending",
      "passed",
      "failed",
      "user_deleted_source",
      "not_required",
    ].every((status) => enumAt(schema, ["$defs", "ReadbackStatus", "enum"]).includes(status)),
    evidence_anchor_uses_readback_status:
      propertyAt(schema, ["$defs", "EvidenceAnchor", "properties", "readback_status", "$ref"]) ===
      "#/$defs/ReadbackStatus",
    evidence_index_entry_uses_readback_status:
      propertyAt(schema, [
        "$defs",
        "EvidenceIndexEntry",
        "properties",
        "readback_status",
        "$ref",
      ]) === "#/$defs/ReadbackStatus",
    particle_projection_uses_readback_status:
      propertyAt(schema, [
        "$defs",
        "ParticleProjectionEntry",
        "properties",
        "evidence_state",
        "$ref",
      ]) === "#/$defs/ReadbackStatus",
  };

  result.boundary_flag_missing = boundaryFlagRequirements.filter(
    (defName) => !hasRequired(schema, defName, "boundary_flags")
  );

  const blockedActions = enumAt(schema, [
    "$defs",
    "ConfirmationGate",
    "properties",
    "blocked_actions",
    "items",
    "enum",
  ]);
  result.confirmation_gate_checks = {
    requires_evidence_anchor_ids: hasRequired(schema, "ConfirmationGate", "evidence_anchor_ids"),
    requires_gate_type: hasRequired(schema, "ConfirmationGate", "gate_type"),
    requires_status: hasRequired(schema, "ConfirmationGate", "status"),
    blocks_relationship_state_write: blockedActions.includes("relationship_state_write"),
    blocks_identity_merge: blockedActions.includes("identity_merge"),
    blocks_external_action: blockedActions.includes("external_action"),
    blocks_learning_weight_promotion: blockedActions.includes("learning_weight_promotion"),
  };

  const particleTypes = enumAt(schema, [
    "$defs",
    "ParticleProjectionEntry",
    "properties",
    "particle_type",
    "enum",
  ]);
  result.particle_projection_checks = {
    requires_object_ref: hasRequired(schema, "ParticleProjectionEntry", "object_ref"),
    requires_evidence_state: hasRequired(schema, "ParticleProjectionEntry", "evidence_state"),
    requires_write_back_allowed: hasRequired(
      schema,
      "ParticleProjectionEntry",
      "write_back_allowed"
    ),
    write_back_const_false:
      propertyAt(schema, [
        "$defs",
        "ParticleProjectionEntry",
        "properties",
        "write_back_allowed",
        "const",
      ]) === false,
    has_source_refs: "source_refs" in properties(schema, "ParticleProjectionEntry"),
    has_evidence_anchor_ids: "evidence_anchor_ids" in properties(schema, "ParticleProjectionEntry"),
    particle_types_complete: minimumParticleTypes.every((type) => particleTypes.includes(type)),
  };

  result.answerability_checks = {
    retrieval_hit_package_requires_answerability: hasRequired(
      schema,
      "RetrievalHitPackage",
      "answerability"
    ),
    retrieval_hit_package_answerability_enum_complete: [
      "answerable_with_evidence",
      "needs_cold_read",
      "not_answerable",
      "blocked",
    ].every((status) =>
      enumAt(schema, ["$defs", "RetrievalHitPackage", "properties", "answerability", "enum"]).includes(
        status
      )
    ),
    ranking_decision_requires_answerability: hasRequired(
      schema,
      "ContextSnapshotRankingDecision",
      "answerability"
    ),
  };

  result.summary_shard_checks = {
    requires_covered_object_refs: hasRequired(schema, "SummaryShard", "covered_object_refs"),
    requires_evidence_anchor_ids: hasRequired(schema, "SummaryShard", "evidence_anchor_ids"),
    has_invalidated_by_refs: "invalidated_by_refs" in properties(schema, "SummaryShard"),
  };

  if (!hasRequired(schema, "WeightProfile", "target_ref")) {
    result.advisories.push("WeightProfile should keep target_ref for indirect evidence trace.");
  }
  if (!("evidence_strength" in properties(schema, "WeightProfile"))) {
    result.advisories.push("WeightProfile should expose evidence_strength for explainability.");
  }

  const failed =
    !result.json_parse ||
    Object.values(result.source_archive_checks).some((value) => !value) ||
    Object.values(result.evidence_anchor_checks).some((value) => !value) ||
    Object.values(result.source_ref_checks).some((value) => !value) ||
    result.direct_evidence_missing.length > 0 ||
    Object.values(result.evidence_index_checks).some((value) => !value) ||
    Object.values(result.conflict_set_indirect_evidence_checks).some((value) => !value) ||
    Object.values(result.readback_status_checks).some((value) => !value) ||
    result.boundary_flag_missing.length > 0 ||
    Object.values(result.confirmation_gate_checks).some((value) => !value) ||
    Object.values(result.particle_projection_checks).some((value) => !value) ||
    Object.values(result.answerability_checks).some((value) => !value) ||
    Object.values(result.summary_shard_checks).some((value) => !value);

  result.validation_status = failed ? "FAIL" : "PASS_EVIDENCE_READBACK_COVERAGE";
  return result;
}

const result = validate();
console.log(JSON.stringify(result, null, 2));
if (result.validation_status !== "PASS_EVIDENCE_READBACK_COVERAGE") process.exitCode = 1;
