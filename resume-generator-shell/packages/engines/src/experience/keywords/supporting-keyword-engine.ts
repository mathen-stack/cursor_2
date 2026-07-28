import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { SupportingKeywordDetail } from "../types/keyword-package";
import type { JDRequirement, RequirementCategory } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  hasCommunicationAllocationSignal,
  pickCommunicationSupportingKeyword,
} from "./communication-allocation";
import {
  EXPLICIT_TOOL_PATTERNS,
  SUPPORTING_BY_CATEGORY,
  SUPPORTING_BY_DIMENSION,
  SUPPORTING_FALLBACK_POOL,
} from "./keyword-taxonomy";
import { canonicalKeywordKey, containsCaseInsensitive } from "./keyword-normalizer";

interface SupportingCandidate extends SupportingKeywordDetail {
  score: number;
  controlledReuse?: boolean;
}

const TOOL_CATEGORY_AFFINITY: Readonly<Record<string, readonly RequirementCategory[]>> = {
  "github actions": ["deployment", "monitoring", "technical-responsibility"],
  kubernetes: ["deployment", "architecture", "performance", "tool-or-platform"],
  docker: ["deployment", "architecture", "tool-or-platform"],
  mlflow: ["monitoring", "deployment", "technical-skill"],
  prometheus: ["monitoring", "performance", "tool-or-platform"],
  grafana: ["monitoring", "communication", "tool-or-platform"],
  airflow: ["data", "deployment", "tool-or-platform"],
  "apache spark": ["data", "performance", "tool-or-platform"],
  spark: ["data", "performance", "tool-or-platform"],
  kafka: ["data", "architecture", "performance", "tool-or-platform"],
  databricks: ["data", "tool-or-platform"],
  snowflake: ["data", "performance", "tool-or-platform"],
  fivetran: ["data", "tool-or-platform"],
  dbt: ["data", "tool-or-platform"],
  terraform: ["deployment", "architecture", "security", "tool-or-platform"],
  jenkins: ["deployment", "tool-or-platform"],
  pytorch: ["technical-skill", "performance", "technical-responsibility"],
  tensorflow: ["technical-skill", "performance", "technical-responsibility"],
  "scikit-learn": ["technical-skill", "technical-responsibility"],
  fastapi: ["technical-responsibility", "deployment", "performance"],
  flask: ["technical-responsibility", "deployment"],
  django: ["technical-responsibility", "deployment", "security"],
  "node.js": ["technical-responsibility", "performance"],
  postgresql: ["data", "performance", "technical-responsibility"],
  mongodb: ["data", "performance", "technical-responsibility"],
  redis: ["performance", "architecture", "technical-responsibility"],
  aws: ["architecture", "deployment", "security", "tool-or-platform"],
  azure: ["architecture", "deployment", "security", "tool-or-platform"],
  gcp: ["architecture", "deployment", "security", "tool-or-platform"],
  python: ["technical-skill", "data", "technical-responsibility"],
  typescript: ["technical-skill", "technical-responsibility"],
  javascript: ["technical-skill", "technical-responsibility"],
  java: ["technical-skill", "technical-responsibility", "architecture"],
  golang: ["technical-skill", "technical-responsibility", "performance"],
  sql: ["data", "performance", "technical-skill"],
  langchain: ["technical-skill", "technical-responsibility"],
  llamaindex: ["technical-skill", "technical-responsibility"],
  "hugging face": ["technical-skill", "technical-responsibility"],
};

function explicitTools(jobDescription: JobDescription): string[] {
  const found: string[] = [];
  for (const definition of EXPLICIT_TOOL_PATTERNS) {
    const pattern = new RegExp(
      definition.pattern.source,
      definition.pattern.flags.includes("g")
        ? definition.pattern.flags
        : `${definition.pattern.flags}g`,
    );
    const match = pattern.exec(jobDescription.rawText);
    if (match?.[0]) {
      found.push(match[0]);
    }
  }
  return [...new Set(found)];
}

function roleAffinity(keyword: string, assignment: RoleAssignment): number {
  const roleText = `${assignment.assignedRole} ${assignment.focusAreas.join(" ")}`.toLowerCase();
  const lower = keyword.toLowerCase();
  if (/machine learning|ml|ai/.test(roleText) && /mlflow|pytorch|tensorflow|scikit|langchain|llama|hugging/.test(lower)) {
    return 14;
  }
  if (/data engineer|data/.test(roleText) && /airflow|spark|kafka|databricks|snowflake|dbt|fivetran|sql/.test(lower)) {
    return 14;
  }
  if (/platform|devops|cloud|mlops/.test(roleText) && /kubernetes|docker|terraform|jenkins|github actions|aws|azure|gcp/.test(lower)) {
    return 14;
  }
  if (/backend|software|full stack/.test(roleText) && /fastapi|flask|django|node|postgres|mongodb|redis|java|typescript|golang/.test(lower)) {
    return 10;
  }
  return 0;
}

function explicitCandidate(
  keyword: string,
  requirement: JDRequirement,
  assignment: RoleAssignment,
): SupportingCandidate {
  const canonicalKey = canonicalKeywordKey(keyword);
  const categories = TOOL_CATEGORY_AFFINITY[keyword.toLowerCase()] ?? [];
  const namedInRequirement = containsCaseInsensitive(requirement.sourceText, keyword);
  let score = namedInRequirement ? 20 : 5;
  if (namedInRequirement) {
    score += 65;
  }
  if (categories.includes(requirement.category)) {
    score += namedInRequirement ? 42 : 10;
  }
  score += roleAffinity(keyword, assignment);
  return {
    keyword,
    canonicalKey,
    origin: "explicit-jd-tool",
    rationale: containsCaseInsensitive(requirement.sourceText, keyword)
      ? `Explicitly named in the allocated JD requirement ${requirement.requirementId}.`
      : "Explicitly named elsewhere in the same immutable JD and technically relevant to this achievement.",
    score,
  };
}

function inferredCandidate(
  keyword: string,
  source: "category" | "dimension",
): SupportingCandidate {
  return {
    keyword,
    canonicalKey: canonicalKeywordKey(keyword),
    origin: "strongly-inferred",
    rationale:
      source === "dimension"
        ? "Strongly supports the planned achievement dimension."
        : "Strongly supports the allocated JD requirement category.",
    score: source === "dimension" ? 48 : 56,
  };
}

function dedupe(candidates: SupportingCandidate[]): SupportingCandidate[] {
  const best = new Map<string, SupportingCandidate>();
  for (const candidate of candidates) {
    if (!candidate.canonicalKey) {
      continue;
    }
    const existing = best.get(candidate.canonicalKey);
    if (!existing || candidate.score > existing.score) {
      best.set(candidate.canonicalKey, candidate);
    }
  }
  return [...best.values()].sort(
    (left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword),
  );
}

export class SupportingKeywordEngine {
  select(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    requirement: JDRequirement;
    assignment: RoleAssignment;
    usedCanonicalKeys: ReadonlySet<string>;
    directCanonicalKeys: ReadonlySet<string>;
    directKeywords: readonly string[];
    maximumKeywords?: number;
  }): SupportingKeywordDetail[] {
    const maximumKeywords = input.maximumKeywords ?? 2;
    const isDedicatedSkillRequirement =
      input.requirement.category === "technical-skill" ||
      input.requirement.category === "tool-or-platform";
    const explicit = explicitTools(input.jobDescription)
      .filter(
        (keyword) =>
          !isDedicatedSkillRequirement ||
          containsCaseInsensitive(input.requirement.normalizedText, keyword),
      )
      .map((keyword) =>
        explicitCandidate(keyword, input.requirement, input.assignment),
      );
    const effectiveDimension = input.plan.leadershipFocused
      ? "technical-leadership"
      : input.plan.communicationFocused
        ? "cross-functional-alignment"
        : input.plan.achievementDimension;
    const dimension = SUPPORTING_BY_DIMENSION[effectiveDimension].map(
      (keyword) => {
        const candidate = inferredCandidate(keyword, "dimension");
        return input.plan.communicationFocused || input.plan.leadershipFocused
          ? { ...candidate, score: candidate.score + 100 }
          : candidate;
      },
    );
    const category = SUPPORTING_BY_CATEGORY[input.requirement.category].map(
      (keyword) => inferredCandidate(keyword, "category"),
    );
    const fallback = SUPPORTING_FALLBACK_POOL.map((keyword) => ({
      ...inferredCandidate(keyword, "dimension"),
      score: 20,
      rationale: "Fallback supporting method used after primary inventories were exhausted under document-wide uniqueness locks.",
    }));

    const all = dedupe([...explicit, ...dimension, ...category, ...fallback]).filter(
      (candidate) =>
        !input.directCanonicalKeys.has(candidate.canonicalKey) &&
        !input.directKeywords.some((directKeyword) =>
          containsCaseInsensitive(directKeyword, candidate.keyword),
        ),
    );
    const unused = all.filter(
      (candidate) => !input.usedCanonicalKeys.has(candidate.canonicalKey),
    );
    const signalUnused = unused.filter((candidate) =>
      hasCommunicationAllocationSignal(candidate.keyword),
    );
    const otherUnused = unused.filter(
      (candidate) => !hasCommunicationAllocationSignal(candidate.keyword),
    );
    const ordered =
      input.plan.communicationFocused
        ? [...signalUnused, ...otherUnused]
        : unused;

    const selected: SupportingCandidate[] = [];
    for (const candidate of ordered) {
      if (selected.length >= maximumKeywords) {
        break;
      }
      if (selected.some((item) => item.canonicalKey === candidate.canonicalKey)) {
        continue;
      }
      selected.push(candidate);
    }

    if (
      input.plan.communicationFocused &&
      !selected.some((candidate) =>
        hasCommunicationAllocationSignal(candidate.keyword),
      )
    ) {
      const blocked = new Set([
        ...input.directCanonicalKeys,
        ...selected.map((item) => item.canonicalKey),
      ]);
      const emergency = pickCommunicationSupportingKeyword(
        input.usedCanonicalKeys,
        blocked,
      );
      const emergencyDetail: SupportingCandidate = {
        keyword: emergency.keyword,
        canonicalKey: emergency.canonicalKey,
        origin: "strongly-inferred",
        rationale: emergency.controlledReuse
          ? "Reused a collaboration supporting keyword so the communication-focused package retained stakeholder or cross-functional evidence."
          : "Injected a collaboration supporting keyword so the communication-focused package retained stakeholder or cross-functional evidence.",
        score: 200,
        controlledReuse: emergency.controlledReuse,
      };
      if (selected.length >= maximumKeywords) {
        selected[selected.length - 1] = emergencyDetail;
      } else {
        selected.push(emergencyDetail);
      }
    }

    // Prefer completing the bullet with one unique supporting method over failing
    // generation when the document-wide inventory is nearly exhausted.
    if (selected.length === 0) {
      throw new Error(
        `Supporting keyword inventory is insufficient to allocate ${maximumKeywords} distinct keywords for ${input.plan.bulletId}.`,
      );
    }

    return selected.map(({ score: _score, ...detail }) => detail);
  }
}
