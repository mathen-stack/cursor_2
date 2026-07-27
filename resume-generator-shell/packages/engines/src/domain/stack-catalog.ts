import type { EngineeringStackId } from "@resume/contracts";
import type { RoleFamily } from "../experience/types/role-assignment";

export interface StackDefinition {
  stackId: EngineeringStackId;
  label: string;
  /**
   * Role families that belong to this stack. Existing RoleFamily values are
   * preserved; new families are additive.
   */
  roleFamilies: readonly RoleFamily[];
  /** Weighted JD phrases used only for stack detection. */
  signals: ReadonlyArray<{ phrase: string; weight: number }>;
  /** Skill taxonomy keys preferred when this stack is primary. */
  coreSkillKeys: readonly string[];
  /** Summary focus phrase when no stronger domain keywords are allocated. */
  summaryFocus: string;
}

/**
 * Shared multi-stack catalog. Original AI/ML coverage is retained; additional
 * stacks are additive extensions used by the stack detector and boosters.
 */
export const STACK_DEFINITIONS: readonly StackDefinition[] = [
  {
    stackId: "ai-ml",
    label: "AI / Machine Learning",
    roleFamilies: ["generative-ai", "applied-ai", "mlops", "machine-learning"],
    signals: [
      { phrase: "machine learning", weight: 8 },
      { phrase: "deep learning", weight: 6 },
      { phrase: "generative ai", weight: 7 },
      { phrase: "llm", weight: 6 },
      { phrase: "mlops", weight: 7 },
      { phrase: "model serving", weight: 5 },
      { phrase: "pytorch", weight: 4 },
      { phrase: "tensorflow", weight: 4 },
      { phrase: "retrieval-augmented generation", weight: 6 },
    ],
    coreSkillKeys: ["PYTHON", "PYTORCH", "TENSORFLOW", "MLFLOW", "DOCKER", "KUBERNETES"],
    summaryFocus: "machine learning systems",
  },
  {
    stackId: "backend",
    label: "Backend Engineering",
    roleFamilies: ["backend-engineering"],
    signals: [
      { phrase: "backend engineer", weight: 9 },
      { phrase: "backend developer", weight: 8 },
      { phrase: "microservices", weight: 5 },
      { phrase: "api design", weight: 5 },
      { phrase: "distributed systems", weight: 5 },
      { phrase: "spring boot", weight: 4 },
      { phrase: "fastapi", weight: 4 },
      { phrase: "grpc", weight: 4 },
    ],
    coreSkillKeys: ["JAVA", "PYTHON", "NODE_JS", "POSTGRESQL", "REDIS", "KUBERNETES"],
    summaryFocus: "backend services",
  },
  {
    stackId: "frontend",
    label: "Frontend Engineering",
    roleFamilies: ["frontend-engineering"],
    signals: [
      { phrase: "frontend engineer", weight: 9 },
      { phrase: "front-end engineer", weight: 9 },
      { phrase: "react", weight: 4 },
      { phrase: "next.js", weight: 5 },
      { phrase: "user interface", weight: 4 },
      { phrase: "web accessibility", weight: 4 },
      { phrase: "typescript", weight: 2 },
    ],
    coreSkillKeys: ["REACT", "NEXT_JS", "TYPESCRIPT", "JAVASCRIPT", "TAILWIND_CSS"],
    summaryFocus: "user-facing web applications",
  },
  {
    stackId: "full-stack",
    label: "Full-Stack Engineering",
    roleFamilies: ["full-stack-engineering"],
    signals: [
      { phrase: "full stack", weight: 9 },
      { phrase: "full-stack", weight: 9 },
      { phrase: "frontend and backend", weight: 6 },
      { phrase: "end-to-end web", weight: 5 },
    ],
    coreSkillKeys: ["REACT", "NEXT_JS", "TYPESCRIPT", "NODE_JS", "POSTGRESQL"],
    summaryFocus: "full-stack applications",
  },
  {
    stackId: "data-engineering",
    label: "Data Engineering",
    roleFamilies: ["data-engineering"],
    signals: [
      { phrase: "data engineer", weight: 9 },
      { phrase: "data pipeline", weight: 6 },
      { phrase: "etl", weight: 5 },
      { phrase: "data warehouse", weight: 5 },
      { phrase: "spark", weight: 4 },
      { phrase: "airflow", weight: 4 },
      { phrase: "dbt", weight: 4 },
    ],
    coreSkillKeys: ["PYTHON", "SQL", "SPARK", "AIRFLOW", "KAFKA", "SNOWFLAKE"],
    summaryFocus: "data platforms",
  },
  {
    stackId: "data-science",
    label: "Data Science",
    roleFamilies: ["data-science"],
    signals: [
      { phrase: "data scientist", weight: 9 },
      { phrase: "data science", weight: 8 },
      { phrase: "statistical modeling", weight: 5 },
      { phrase: "a/b testing", weight: 4 },
      { phrase: "experimentation", weight: 4 },
      { phrase: "predictive analytics", weight: 5 },
    ],
    coreSkillKeys: ["PYTHON", "SQL", "SCIKIT_LEARN", "XGBOOST", "PANDAS"],
    summaryFocus: "data science solutions",
  },
  {
    stackId: "cloud",
    label: "Cloud Engineering",
    roleFamilies: ["cloud-engineering"],
    signals: [
      { phrase: "cloud engineer", weight: 9 },
      { phrase: "cloud infrastructure", weight: 6 },
      { phrase: "aws", weight: 3 },
      { phrase: "azure", weight: 3 },
      { phrase: "gcp", weight: 3 },
      { phrase: "serverless", weight: 4 },
    ],
    coreSkillKeys: ["AWS", "AZURE", "GCP", "TERRAFORM", "KUBERNETES", "DOCKER"],
    summaryFocus: "cloud infrastructure",
  },
  {
    stackId: "devops-platform",
    label: "DevOps & Platform Engineering",
    roleFamilies: ["devops-engineering", "platform-engineering"],
    signals: [
      { phrase: "devops engineer", weight: 9 },
      { phrase: "platform engineer", weight: 9 },
      { phrase: "site reliability", weight: 8 },
      { phrase: "ci/cd", weight: 4 },
      { phrase: "infrastructure as code", weight: 6 },
      { phrase: "developer platform", weight: 6 },
      { phrase: "observability", weight: 3 },
    ],
    coreSkillKeys: ["KUBERNETES", "DOCKER", "TERRAFORM", "GITHUB_ACTIONS", "PROMETHEUS", "GIT"],
    summaryFocus: "reliable delivery platforms",
  },
  {
    stackId: "cybersecurity",
    label: "Cybersecurity",
    roleFamilies: ["security-engineering"],
    signals: [
      { phrase: "security engineer", weight: 9 },
      { phrase: "cybersecurity", weight: 8 },
      { phrase: "application security", weight: 7 },
      { phrase: "threat modeling", weight: 6 },
      { phrase: "vulnerability", weight: 4 },
      { phrase: "penetration testing", weight: 5 },
    ],
    coreSkillKeys: ["SECURITY", "OAUTH", "OIDC", "IAM", "ENCRYPTION"],
    summaryFocus: "secure software systems",
  },
  {
    stackId: "mobile",
    label: "Mobile Development",
    roleFamilies: ["mobile-engineering"],
    signals: [
      { phrase: "mobile engineer", weight: 9 },
      { phrase: "ios engineer", weight: 9 },
      { phrase: "android engineer", weight: 9 },
      { phrase: "react native", weight: 7 },
      { phrase: "swift", weight: 5 },
      { phrase: "kotlin", weight: 5 },
      { phrase: "flutter", weight: 6 },
      { phrase: "mobile application", weight: 5 },
    ],
    coreSkillKeys: ["SWIFT", "KOTLIN", "REACT_NATIVE", "FLUTTER", "IOS", "ANDROID"],
    summaryFocus: "mobile applications",
  },
  {
    stackId: "qa-test-automation",
    label: "QA & Test Automation",
    roleFamilies: ["qa-engineering"],
    signals: [
      { phrase: "qa engineer", weight: 9 },
      { phrase: "test automation", weight: 8 },
      { phrase: "sdet", weight: 8 },
      { phrase: "quality assurance", weight: 7 },
      { phrase: "selenium", weight: 5 },
      { phrase: "playwright", weight: 5 },
      { phrase: "cypress", weight: 4 },
      { phrase: "test strategy", weight: 4 },
    ],
    coreSkillKeys: ["PLAYWRIGHT", "SELENIUM", "CYPRESS", "JUNIT", "TESTNG", "TDD"],
    summaryFocus: "quality engineering and test automation",
  },
  {
    stackId: "database",
    label: "Database Engineering",
    roleFamilies: ["database-engineering"],
    signals: [
      { phrase: "database engineer", weight: 9 },
      { phrase: "database administrator", weight: 8 },
      { phrase: "dba", weight: 6 },
      { phrase: "query optimization", weight: 6 },
      { phrase: "database reliability", weight: 6 },
      { phrase: "schema design", weight: 5 },
      { phrase: "postgresql", weight: 3 },
    ],
    coreSkillKeys: ["POSTGRESQL", "MYSQL", "SQL", "REDIS", "MONGODB", "ELASTICSEARCH"],
    summaryFocus: "database platforms",
  },
  {
    stackId: "embedded",
    label: "Embedded Systems",
    roleFamilies: ["embedded-engineering"],
    signals: [
      { phrase: "embedded engineer", weight: 9 },
      { phrase: "embedded systems", weight: 8 },
      { phrase: "firmware", weight: 7 },
      { phrase: "rtos", weight: 6 },
      { phrase: "microcontroller", weight: 6 },
      { phrase: "bare metal", weight: 5 },
      { phrase: "c++", weight: 2 },
    ],
    coreSkillKeys: ["C", "CPP", "RTOS", "EMBEDDED_LINUX", "FIRMWARE"],
    summaryFocus: "embedded systems",
  },
  {
    stackId: "blockchain",
    label: "Blockchain",
    roleFamilies: ["blockchain-engineering"],
    signals: [
      { phrase: "blockchain engineer", weight: 9 },
      { phrase: "smart contract", weight: 7 },
      { phrase: "solidity", weight: 7 },
      { phrase: "web3", weight: 6 },
      { phrase: "ethereum", weight: 5 },
      { phrase: "defi", weight: 5 },
      { phrase: "consensus", weight: 4 },
    ],
    coreSkillKeys: ["SOLIDITY", "ETHEREUM", "WEB3", "HARDHAT", "RUST"],
    summaryFocus: "blockchain and smart-contract systems",
  },
  {
    stackId: "general-software",
    label: "General Software Engineering",
    roleFamilies: ["software-engineering", "solutions-engineering"],
    signals: [
      { phrase: "software engineer", weight: 5 },
      { phrase: "software developer", weight: 5 },
      { phrase: "application development", weight: 3 },
      { phrase: "production systems", weight: 2 },
    ],
    coreSkillKeys: ["PYTHON", "JAVA", "TYPESCRIPT", "GIT", "SQL"],
    summaryFocus: "production software",
  },
] as const;

export function stackDefinitionFor(
  stackId: EngineeringStackId,
): StackDefinition {
  const match = STACK_DEFINITIONS.find((item) => item.stackId === stackId);
  if (!match) {
    throw new Error(`Unknown engineering stack: ${stackId}`);
  }
  return match;
}

export function stackIdForRoleFamily(roleFamily: RoleFamily): EngineeringStackId {
  const match = STACK_DEFINITIONS.find((stack) =>
    stack.roleFamilies.includes(roleFamily),
  );
  return match?.stackId ?? "general-software";
}
