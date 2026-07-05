# Possibility Branch

`packages/possibility-branch` is the independent hypothesis branch for real social inputs that are too ambiguous to write directly into the relationship graph or event graph.

It keeps multi-identity, multi-event and nested-event possibilities in a separate branch artifact. The branch is used for context assembly and reviewer audit, not for confirming people, relationships or events.

Role attribution separates the reporter from the reported subject. For example, if Zhou reports that Li is worried about an integration delay, Zhou can remain an information source or meeting coordinator while Li keeps the technical reviewer role.

## Contract

- `possibility_branch_analysis.v1`: branch-only analysis with identity hypotheses, event hypotheses, identity-event weights, processing order, retrieval plan, merge policy and validation checks.

## Storage Boundary

- Allowed branch artifacts: `runtime/possibility-branches/<branch_id>/**`
- Blocked main graph writes: `data/people/**`, `data/events/**`, `data/indexes/**`
- Promotion to `CandidatePerson`, `PersonRoleBinding`, `SceneRelationshipWeight` or `SemanticEvent` requires a later user-confirmed workflow.

## Verification

```bash
node --test packages/possibility-branch/tests/*.test.mjs
npm run possibility:branch
```

The demo simulates a B2B WeChat input where one target person has several roles and the message contains budget, technical, contract, compliance, meeting and pricing-channel events.
