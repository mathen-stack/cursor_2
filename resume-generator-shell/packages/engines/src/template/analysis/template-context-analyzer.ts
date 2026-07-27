import type {
  GenerationContext,
  JobDescription,
  TemplatePageSize,
  TemplateRoleAnalysis,
  TemplateSeniority,
  UserProfile,
} from "@resume/contracts";

export interface TemplateContextAnalysisInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  profile: UserProfile;
}

export interface TemplateContextAnalysisOutput {
  context: GenerationContext;
  roleAnalysis: TemplateRoleAnalysis;
  pageSize: TemplatePageSize;
  explicitSkillEstimate: number;
}

const SENIORITY_PATTERNS: ReadonlyArray<{
  seniority: TemplateSeniority;
  pattern: RegExp;
}> = [
  { seniority: "principal", pattern: /\bprincipal\b/i },
  { seniority: "staff", pattern: /\bstaff\b/i },
  { seniority: "lead", pattern: /\b(?:lead|tech lead|technical lead)\b/i },
  { seniority: "manager", pattern: /\b(?:manager|head of|director)\b/i },
  { seniority: "senior", pattern: /\b(?:senior|sr\.?\b)\b/i },
  { seniority: "junior", pattern: /\b(?:junior|jr\.?\b)\b/i },
  { seniority: "entry", pattern: /\b(?:entry[- ]level|graduate|new grad)\b/i },
];

const ROLE_PATTERNS: ReadonlyArray<{
  family: string;
  title: string;
  pattern: RegExp;
}> = [
  {
    family: "Machine Learning Engineering",
    title: "Machine Learning Engineer",
    pattern: /\b(?:machine learning|ml) engineer\b/i,
  },
  {
    family: "Generative AI Engineering",
    title: "Generative AI Engineer",
    pattern: /\b(?:generative ai|genai|llm) engineer\b/i,
  },
  {
    family: "Applied AI Engineering",
    title: "Applied AI Engineer",
    pattern: /\bapplied ai engineer\b/i,
  },
  {
    family: "Data Engineering",
    title: "Data Engineer",
    pattern: /\bdata engineer\b/i,
  },
  {
    family: "Data Science",
    title: "Data Scientist",
    pattern: /\bdata scientist\b/i,
  },
  {
    family: "Security Engineering",
    title: "Security Engineer",
    pattern: /\b(?:cybersecurity|security) engineer\b/i,
  },
  {
    family: "Platform Engineering",
    title: "Platform Engineer",
    pattern: /\bplatform engineer\b/i,
  },
  {
    family: "Backend Engineering",
    title: "Backend Engineer",
    pattern: /\bback[- ]?end engineer\b/i,
  },
  {
    family: "Frontend Engineering",
    title: "Frontend Engineer",
    pattern: /\bfront[- ]?end engineer\b/i,
  },
  {
    family: "Software Engineering",
    title: "Software Engineer",
    pattern: /\bsoftware engineer\b/i,
  },
  {
    family: "Engineering Management",
    title: "Engineering Manager",
    pattern: /\bengineering manager\b/i,
  },
];

const EUROPEAN_PAGE_HINT =
  /\b(?:united kingdom|uk\b|england|scotland|wales|ireland|european union|europe\b|germany|france|spain|italy|netherlands|belgium|poland|romania|sweden|norway|denmark|finland|switzerland|austria|portugal|czechia|czech republic)\b/i;

const SKILL_TOKEN_PATTERN =
  /\b(?:Python|Java|JavaScript|TypeScript|Go|C\+\+|C#|SQL|AWS|Azure|GCP|Docker|Kubernetes|Terraform|Spark|Kafka|Airflow|Snowflake|dbt|PostgreSQL|MySQL|MongoDB|Redis|PyTorch|TensorFlow|MLflow|LangChain|FastAPI|Flask|React|Node\.js|CI\/CD|GitHub Actions|Prometheus|Grafana|Elasticsearch|Databricks|RAG|LLMs?)\b/gi;

function detectSeniority(text: string): TemplateSeniority {
  for (const candidate of SENIORITY_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return candidate.seniority;
    }
  }

  if (/\b(?:architect|mentor|technical strategy|cross-functional leadership)\b/i.test(text)) {
    return "senior";
  }
  return "mid";
}

function titlePrefix(seniority: TemplateSeniority): string {
  switch (seniority) {
    case "entry":
      return "Entry-Level";
    case "junior":
      return "Junior";
    case "senior":
      return "Senior";
    case "lead":
      return "Lead";
    case "staff":
      return "Staff";
    case "principal":
      return "Principal";
    case "manager":
      return "";
    default:
      return "";
  }
}

function detectRole(text: string, seniority: TemplateSeniority): TemplateRoleAnalysis {
  const firstMeaningfulLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 2 && line.length <= 100);

  for (const candidate of ROLE_PATTERNS) {
    const match = candidate.pattern.exec(firstMeaningfulLine ?? text);
    if (match) {
      const prefix = titlePrefix(seniority);
      const baseTitle = candidate.title;
      const title =
        seniority === "manager" && candidate.family === "Engineering Management"
          ? baseTitle
          : prefix.length > 0
            ? `${prefix} ${baseTitle}`
            : baseTitle;
      return {
        targetRole: title,
        roleFamily: candidate.family,
        seniority,
        confidence: firstMeaningfulLine && candidate.pattern.test(firstMeaningfulLine) ? 0.98 : 0.9,
      };
    }
  }

  const inferred = /\bdata pipeline|etl|warehouse|streaming\b/i.test(text)
    ? { targetRole: "Data Engineer", roleFamily: "Data Engineering" }
    : /\bmachine learning|model deployment|model monitoring\b/i.test(text)
      ? {
          targetRole: "Machine Learning Engineer",
          roleFamily: "Machine Learning Engineering",
        }
      : /\bsecurity|threat|vulnerability\b/i.test(text)
        ? { targetRole: "Security Engineer", roleFamily: "Security Engineering" }
        : { targetRole: "Software Engineer", roleFamily: "Software Engineering" };

  const prefix = titlePrefix(seniority);
  return {
    targetRole: prefix.length > 0 ? `${prefix} ${inferred.targetRole}` : inferred.targetRole,
    roleFamily: inferred.roleFamily,
    seniority,
    confidence: 0.72,
  };
}

function estimateExplicitSkills(text: string): number {
  const matches = text.match(SKILL_TOKEN_PATTERN) ?? [];
  const normalized = new Set(matches.map((value) => value.toLowerCase()));
  const responsibilityConcepts = [
    /\bdistributed systems\b/i,
    /\bmicroservices\b/i,
    /\bdata pipelines?\b/i,
    /\bmodel monitoring\b/i,
    /\bcloud infrastructure\b/i,
    /\bobservability\b/i,
    /\brest apis?\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  return Math.max(6, Math.min(32, normalized.size + responsibilityConcepts));
}

export class TemplateContextAnalyzer {
  readonly name = "template-context-analyzer";

  execute(input: TemplateContextAnalysisInput): TemplateContextAnalysisOutput {
    const text = input.jobDescription.rawText;
    const seniority = detectSeniority(text);
    const roleAnalysis = detectRole(text, seniority);
    const pageSize: TemplatePageSize = EUROPEAN_PAGE_HINT.test(text) ? "a4" : "letter";

    return {
      context: input.context,
      roleAnalysis,
      pageSize,
      explicitSkillEstimate: estimateExplicitSkills(text),
    };
  }
}
