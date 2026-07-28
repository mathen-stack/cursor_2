# Experience Engine Milestone 1

This milestone implements the contract-first Experience Engine orchestration shell.

## Included

- Dependency-injected Experience Engine orchestrator
- Typed boundaries for requirement extraction, role assignment, bullet planning,
  keyword allocation, STAR generation, bullet composition, and validation
- Context checks after every sub-engine call
- Deterministic mock sub-engines
- Minimum five bullets per role
- Mock communication/collaboration coverage
- Tests for output structure, immutability, context mismatch rejection, and
  concurrent JD isolation

## Intentionally not included yet

- Production LLM provider calls
- Real requirement extraction
- Real role assignment
- Real keyword intelligence
- Real STAR or metric generation
- Semantic validation and selective regeneration

The next milestone is replacing only the mock Requirement Extractor with a real,
provider-neutral, evidence-grounded implementation.
