# Skills Engine Milestone 10

Milestone 10 replaces the Skills placeholder inside the full resume-generator
project with a real, deterministic, JD-isolated Skills Engine.

## Pipeline

```text
Original immutable JD
→ explicit skill extraction with exact evidence
→ strongly supported skill inference
→ alias and canonical-key normalization
→ priority and relevance ranking
→ category and density allocation
→ global skills validation
→ approved structured Skills output
```

Every internal stage receives the same `generationId`, `jdId`, `jdHash`, and
original job description. The engine rejects mismatched profile or JD context
before doing any work.

## Direct skills

The explicit extractor identifies named programming languages, AI and ML
methods, LLM capabilities, data-engineering technologies, MLOps practices,
cloud services, frameworks, databases, DevOps tools, observability systems,
security controls, architecture concepts, and JD-stated leadership or delivery
capabilities.

Each explicit skill stores exact JD evidence and character offsets. Alias forms
such as `Postgres`/`PostgreSQL`, `K8s`/`Kubernetes`, and
`continuous integration`/`CI/CD` map to one canonical skill.

## Supporting skills

The inference engine adds only conservative, technically necessary concepts.
Examples include:

- Kubernetes → Container Orchestration
- Docker → Containerization
- RAG → Embeddings, Vector Databases, Retrieval Evaluation
- MLflow → Experiment Tracking
- Kafka → Streaming Data
- Spark → Distributed Data Processing
- CI/CD → Deployment Automation

Every inferred skill records its explicit trigger. Inferred skills with no
current-JD trigger are rejected.

## Ranking and categories

Skills are ranked using directness, JD priority language, title proximity,
mention frequency, and category relevance. The Skills section is capped by
configurable total-skill, category, and per-category limits. High-priority
explicit JD skills are protected from omission.

Supported ATS-friendly categories include:

- Programming Languages
- AI & Machine Learning
- Generative AI
- Data Engineering
- MLOps & Model Operations
- Cloud & Infrastructure
- Frameworks & APIs
- Databases & Storage
- DevOps & CI/CD
- Monitoring & Observability
- Security & Compliance
- Architecture & Engineering
- Leadership & Delivery

Only categories containing selected skills are returned.

## Validation

The validator checks:

- coverage of critical and high-priority direct JD skills;
- exact evidence against the immutable JD;
- duplicate and alias-equivalent skill removal;
- category validity and canonical ownership;
- grounding of every inferred skill;
- ATS-friendly skill density;
- inferred-skill ratio;
- stable deterministic skill IDs;
- cross-JD and cross-generation isolation.

The engine returns both the final category list and detailed skill records for
traceability and future Resume Worded calibration.

## Current integration status

The production Skills Engine is exported through `@resume/engines` and already
matches the full-project `SkillsEngine` contract used by `ResumeOrchestrator`.
The Summary and Template engines remain placeholders, so complete-resume API
assembly is intentionally deferred to later milestones.
