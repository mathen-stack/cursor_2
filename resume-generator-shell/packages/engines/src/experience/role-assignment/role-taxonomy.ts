import type { CareerSeniority, RoleFamily } from "../types/role-assignment";

export interface RoleDefinition {
  family: RoleFamily;
  baseRole: string;
  explicitPatterns: RegExp[];
  signals: ReadonlyArray<{ phrase: string; weight: number }>;
  progression: {
    foundational: string;
    practitioner: string;
    senior: string;
  };
}

/**
 * Ordered from the most specific role families to the broadest. The ordering
 * is used only as a deterministic tie-breaker; scores remain the primary
 * source of truth.
 */
export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    family: "generative-ai",
    baseRole: "Generative AI Engineer",
    explicitPatterns: [
      /\bgenerative ai engineer\b/i,
      /\bgen(?:erative)? ai engineer\b/i,
      /\bllm engineer\b/i,
    ],
    signals: [
      { phrase: "generative ai", weight: 9 },
      { phrase: "large language model", weight: 7 },
      { phrase: "llm", weight: 6 },
      { phrase: "retrieval-augmented generation", weight: 6 },
      { phrase: "rag", weight: 4 },
      { phrase: "prompt engineering", weight: 4 },
      { phrase: "agentic", weight: 5 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "AI Engineer",
      senior: "Senior Generative AI Engineer",
    },
  },
  {
    family: "applied-ai",
    baseRole: "Applied AI Engineer",
    explicitPatterns: [
      /\bapplied ai engineer\b/i,
      /\bai engineer\b/i,
      /\bartificial intelligence engineer\b/i,
    ],
    signals: [
      { phrase: "applied ai", weight: 9 },
      { phrase: "artificial intelligence", weight: 6 },
      { phrase: "ai systems", weight: 5 },
      { phrase: "ai applications", weight: 5 },
      { phrase: "intelligent automation", weight: 4 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "AI Engineer",
      senior: "Senior Applied AI Engineer",
    },
  },
  {
    family: "mlops",
    baseRole: "MLOps Engineer",
    explicitPatterns: [
      /\bmlops engineer\b/i,
      /\bmachine learning platform engineer\b/i,
    ],
    signals: [
      { phrase: "mlops", weight: 10 },
      { phrase: "model deployment", weight: 4 },
      { phrase: "model monitoring", weight: 4 },
      { phrase: "model serving", weight: 4 },
      { phrase: "machine learning platform", weight: 7 },
      { phrase: "model lifecycle", weight: 5 },
    ],
    progression: {
      foundational: "DevOps Engineer",
      practitioner: "MLOps Engineer",
      senior: "Senior MLOps Engineer",
    },
  },
  {
    family: "machine-learning",
    baseRole: "Machine Learning Engineer",
    explicitPatterns: [
      /\bmachine learning engineer\b/i,
      /\bml engineer\b/i,
    ],
    signals: [
      { phrase: "machine learning", weight: 8 },
      { phrase: "predictive model", weight: 4 },
      { phrase: "model training", weight: 4 },
      { phrase: "deep learning", weight: 4 },
      { phrase: "pytorch", weight: 3 },
      { phrase: "tensorflow", weight: 3 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Machine Learning Engineer",
      senior: "Senior Machine Learning Engineer",
    },
  },
  {
    family: "data-engineering",
    baseRole: "Data Engineer",
    explicitPatterns: [/\bdata engineer\b/i],
    signals: [
      { phrase: "data engineering", weight: 8 },
      { phrase: "data pipeline", weight: 6 },
      { phrase: "etl", weight: 5 },
      { phrase: "data warehouse", weight: 5 },
      { phrase: "spark", weight: 3 },
      { phrase: "airflow", weight: 3 },
      { phrase: "databricks", weight: 3 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Data Engineer",
      senior: "Senior Data Engineer",
    },
  },
  {
    family: "data-science",
    baseRole: "Data Scientist",
    explicitPatterns: [/\bdata scientist\b/i],
    signals: [
      { phrase: "data science", weight: 8 },
      { phrase: "statistical modeling", weight: 5 },
      { phrase: "experimentation", weight: 4 },
      { phrase: "a/b testing", weight: 4 },
      { phrase: "predictive analytics", weight: 4 },
    ],
    progression: {
      foundational: "Data Analyst",
      practitioner: "Data Scientist",
      senior: "Senior Data Scientist",
    },
  },
  {
    family: "platform-engineering",
    baseRole: "Platform Engineer",
    explicitPatterns: [/\bplatform engineer\b/i],
    signals: [
      { phrase: "platform engineering", weight: 8 },
      { phrase: "developer platform", weight: 6 },
      { phrase: "internal developer platform", weight: 7 },
      { phrase: "infrastructure platform", weight: 5 },
      { phrase: "kubernetes", weight: 2 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Platform Engineer",
      senior: "Senior Platform Engineer",
    },
  },
  {
    family: "cloud-engineering",
    baseRole: "Cloud Engineer",
    explicitPatterns: [/\bcloud engineer\b/i],
    signals: [
      { phrase: "cloud engineering", weight: 8 },
      { phrase: "cloud infrastructure", weight: 5 },
      { phrase: "aws", weight: 2 },
      { phrase: "azure", weight: 2 },
      { phrase: "gcp", weight: 2 },
    ],
    progression: {
      foundational: "Systems Engineer",
      practitioner: "Cloud Engineer",
      senior: "Senior Cloud Engineer",
    },
  },
  {
    family: "devops-engineering",
    baseRole: "DevOps Engineer",
    explicitPatterns: [/\bdevops engineer\b/i, /\bsite reliability engineer\b/i],
    signals: [
      { phrase: "devops", weight: 8 },
      { phrase: "site reliability", weight: 8 },
      { phrase: "ci/cd", weight: 4 },
      { phrase: "infrastructure as code", weight: 5 },
      { phrase: "observability", weight: 3 },
    ],
    progression: {
      foundational: "Systems Engineer",
      practitioner: "DevOps Engineer",
      senior: "Senior DevOps Engineer",
    },
  },
  {
    family: "security-engineering",
    baseRole: "Security Engineer",
    explicitPatterns: [
      /\bsecurity engineer\b/i,
      /\bcybersecurity engineer\b/i,
      /\bapplication security engineer\b/i,
    ],
    signals: [
      { phrase: "security engineering", weight: 8 },
      { phrase: "cybersecurity", weight: 7 },
      { phrase: "application security", weight: 6 },
      { phrase: "threat modeling", weight: 5 },
      { phrase: "vulnerability", weight: 3 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Security Engineer",
      senior: "Senior Security Engineer",
    },
  },
  {
    family: "solutions-engineering",
    baseRole: "Solutions Engineer",
    explicitPatterns: [
      /\bsolutions engineer\b/i,
      /\bsolution engineer\b/i,
      /\bsolutions architect\b/i,
    ],
    signals: [
      { phrase: "solutions engineering", weight: 8 },
      { phrase: "solutions architect", weight: 8 },
      { phrase: "customer requirements", weight: 4 },
      { phrase: "technical discovery", weight: 4 },
      { phrase: "pre-sales", weight: 4 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Solutions Engineer",
      senior: "Senior Solutions Engineer",
    },
  },
  {
    family: "backend-engineering",
    baseRole: "Backend Engineer",
    explicitPatterns: [/\bback[- ]end engineer\b/i, /\bbackend developer\b/i],
    signals: [
      { phrase: "backend engineering", weight: 8 },
      { phrase: "backend", weight: 5 },
      { phrase: "distributed systems", weight: 4 },
      { phrase: "microservices", weight: 4 },
      { phrase: "api design", weight: 4 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Backend Engineer",
      senior: "Senior Backend Engineer",
    },
  },
  {
    family: "frontend-engineering",
    baseRole: "Frontend Engineer",
    explicitPatterns: [/\bfront[- ]end engineer\b/i, /\bfrontend developer\b/i],
    signals: [
      { phrase: "frontend engineering", weight: 8 },
      { phrase: "frontend", weight: 5 },
      { phrase: "react", weight: 3 },
      { phrase: "user interface", weight: 3 },
      { phrase: "web accessibility", weight: 3 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Frontend Engineer",
      senior: "Senior Frontend Engineer",
    },
  },
  {
    family: "full-stack-engineering",
    baseRole: "Full Stack Engineer",
    explicitPatterns: [/\bfull[- ]stack engineer\b/i, /\bfull[- ]stack developer\b/i],
    signals: [
      { phrase: "full stack", weight: 8 },
      { phrase: "frontend and backend", weight: 5 },
      { phrase: "end-to-end web", weight: 4 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Full Stack Engineer",
      senior: "Senior Full Stack Engineer",
    },
  },
  {
    family: "software-engineering",
    baseRole: "Software Engineer",
    explicitPatterns: [/\bsoftware engineer\b/i, /\bsoftware developer\b/i],
    signals: [
      { phrase: "software engineering", weight: 7 },
      { phrase: "software development", weight: 5 },
      { phrase: "production systems", weight: 2 },
      { phrase: "application development", weight: 3 },
    ],
    progression: {
      foundational: "Software Engineer",
      practitioner: "Software Engineer",
      senior: "Senior Software Engineer",
    },
  },
] as const;

export const SENIORITY_PREFIX: Readonly<Record<CareerSeniority, string>> = {
  entry: "Entry-Level",
  junior: "Junior",
  mid: "",
  senior: "Senior",
  lead: "Lead",
  staff: "Staff",
  principal: "Principal",
  manager: "Engineering Manager,",
};

export function formatRoleTitle(
  baseRole: string,
  seniority: CareerSeniority,
): string {
  if (seniority === "manager") {
    const discipline = baseRole.replace(/ Engineer$/, "").replace(/ Engineering$/, "");
    return discipline === "Software"
      ? "Software Engineering Manager"
      : `${discipline} Engineering Manager`;
  }

  const prefix = SENIORITY_PREFIX[seniority];
  return prefix.length > 0 ? `${prefix} ${baseRole}` : baseRole;
}

export const SENIORITY_RANK: Readonly<Record<CareerSeniority, number>> = {
  entry: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  staff: 5,
  principal: 6,
  manager: 5,
};
