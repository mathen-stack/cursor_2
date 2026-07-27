import type {
  KeywordAllocator,
  KeywordAllocatorInput,
  KeywordAllocatorOutput,
  KeywordLockRecord,
  KeywordPackage,
} from "../types/keyword-package";
import type { RoleAssignment } from "../types/role-assignment";
import { ActionVerbEngine } from "./action-verb-engine";
import { DirectJDKeywordEngine } from "./direct-jd-keyword-engine";
import { validateKeywordAllocation } from "./keyword-allocation-validator";
import {
  canonicalKeywordKey,
} from "./keyword-normalizer";
import { OutcomeKeywordEngine } from "./outcome-keyword-engine";
import { SupportingKeywordEngine } from "./supporting-keyword-engine";

export interface RealKeywordAllocatorOptions {
  directKeywordEngine?: DirectJDKeywordEngine;
  supportingKeywordEngine?: SupportingKeywordEngine;
  outcomeKeywordEngine?: OutcomeKeywordEngine;
  actionVerbEngine?: ActionVerbEngine;
  directKeywordsPerBullet?: number;
  supportingKeywordsPerBullet?: number;
  outcomeKeywordsPerBullet?: number;
}

interface RoleAllocationState {
  usedDirectKeys: Set<string>;
  usedSupportingKeys: Set<string>;
  usedOutcomeKeys: Set<string>;
  usedActionVerbKeys: Set<string>;
  usedGlobalKeywordKeys: Set<string>;
}

function createRoleState(): RoleAllocationState {
  return {
    usedDirectKeys: new Set<string>(),
    usedSupportingKeys: new Set<string>(),
    usedOutcomeKeys: new Set<string>(),
    usedActionVerbKeys: new Set<string>(),
    usedGlobalKeywordKeys: new Set<string>(),
  };
}


function seedRoleState(
  states: Map<string, RoleAllocationState>,
  documentState: RoleAllocationState,
  keywordPackage: KeywordPackage,
  includeDirectKeywords: boolean,
): void {
  const state = states.get(keywordPackage.experienceId) ?? createRoleState();
  states.set(keywordPackage.experienceId, state);
  state.usedActionVerbKeys.add(keywordPackage.actionVerbCanonicalKey);
  documentState.usedActionVerbKeys.add(keywordPackage.actionVerbCanonicalKey);
  for (const detail of keywordPackage.supportingKeywordDetails) {
    state.usedSupportingKeys.add(detail.canonicalKey);
    state.usedGlobalKeywordKeys.add(detail.canonicalKey);
    documentState.usedSupportingKeys.add(detail.canonicalKey);
    documentState.usedGlobalKeywordKeys.add(detail.canonicalKey);
  }
  for (const detail of keywordPackage.outcomeKeywordDetails) {
    state.usedOutcomeKeys.add(detail.canonicalKey);
    state.usedGlobalKeywordKeys.add(detail.canonicalKey);
    documentState.usedOutcomeKeys.add(detail.canonicalKey);
    documentState.usedGlobalKeywordKeys.add(detail.canonicalKey);
  }
  if (includeDirectKeywords) {
    for (const keyword of keywordPackage.directKeywords) {
      const key = canonicalKeywordKey(keyword);
      state.usedDirectKeys.add(key);
      state.usedGlobalKeywordKeys.add(key);
      documentState.usedDirectKeys.add(key);
      documentState.usedGlobalKeywordKeys.add(key);
    }
  }
}

function lock(
  experienceId: string,
  bulletId: string,
  kind: KeywordLockRecord["kind"],
  value: string,
  canonicalKey: string,
  controlledReuse: boolean,
): KeywordLockRecord {
  return {
    experienceId,
    bulletId,
    kind,
    value,
    canonicalKey,
    controlledReuse,
  };
}

export class RealKeywordAllocator implements KeywordAllocator {
  readonly name = "real-global-keyword-and-action-verb-allocator";

  private readonly directKeywordEngine: DirectJDKeywordEngine;
  private readonly supportingKeywordEngine: SupportingKeywordEngine;
  private readonly outcomeKeywordEngine: OutcomeKeywordEngine;
  private readonly actionVerbEngine: ActionVerbEngine;
  private readonly directKeywordsPerBullet: number;
  private readonly supportingKeywordsPerBullet: number;
  private readonly outcomeKeywordsPerBullet: number;

  constructor(options: RealKeywordAllocatorOptions = {}) {
    this.directKeywordEngine =
      options.directKeywordEngine ?? new DirectJDKeywordEngine();
    this.supportingKeywordEngine =
      options.supportingKeywordEngine ?? new SupportingKeywordEngine();
    this.outcomeKeywordEngine =
      options.outcomeKeywordEngine ?? new OutcomeKeywordEngine();
    this.actionVerbEngine = options.actionVerbEngine ?? new ActionVerbEngine();
    this.directKeywordsPerBullet = options.directKeywordsPerBullet ?? 2;
    this.supportingKeywordsPerBullet = options.supportingKeywordsPerBullet ?? 2;
    this.outcomeKeywordsPerBullet = options.outcomeKeywordsPerBullet ?? 1;

    if (this.directKeywordsPerBullet < 1 || this.directKeywordsPerBullet > 3) {
      throw new Error("directKeywordsPerBullet must be between 1 and 3.");
    }
    if (
      this.supportingKeywordsPerBullet < 1 ||
      this.supportingKeywordsPerBullet > 3
    ) {
      throw new Error("supportingKeywordsPerBullet must be between 1 and 3.");
    }
    if (this.outcomeKeywordsPerBullet < 1 || this.outcomeKeywordsPerBullet > 2) {
      throw new Error("outcomeKeywordsPerBullet must be between 1 and 2.");
    }
  }

  async execute(input: KeywordAllocatorInput): Promise<KeywordAllocatorOutput> {
    this.assertInput(input);

    const requirementsById = new Map(
      input.requirements.map((requirement) => [
        requirement.requirementId,
        requirement,
      ]),
    );
    const assignmentsById = new Map(
      input.assignments.map((assignment) => [
        assignment.experienceId,
        assignment,
      ]),
    );
    const states = new Map<string, RoleAllocationState>();
    // Document-wide locks prevent the same action verb / supporting / outcome
    // concept from being cloned across every career entry.
    const documentState = createRoleState();
    const packages: KeywordPackage[] = [];
    const locks: KeywordLockRecord[] = [];
    const controlledDirectKeywordReuse: string[] = [];

    for (const reserved of input.reservedPackages ?? []) {
      seedRoleState(states, documentState, reserved, true);
    }
    for (const previous of input.previousPackages ?? []) {
      seedRoleState(states, documentState, previous, false);
    }

    const orderedPlans = [...input.plans].sort((left, right) => {
      const leftAssignment = assignmentsById.get(left.experienceId);
      const rightAssignment = assignmentsById.get(right.experienceId);
      return (
        (leftAssignment?.chronologyRank ?? Number.MAX_SAFE_INTEGER) -
          (rightAssignment?.chronologyRank ?? Number.MAX_SAFE_INTEGER) ||
        left.sequence - right.sequence ||
        left.bulletId.localeCompare(right.bulletId)
      );
    });

    for (const plan of orderedPlans) {
      const assignment = assignmentsById.get(plan.experienceId);
      const requirement = requirementsById.get(plan.requirementId);
      if (!assignment) {
        throw new Error(
          `Keyword allocation cannot find role assignment ${plan.experienceId}.`,
        );
      }
      if (!requirement) {
        throw new Error(
          `Keyword allocation cannot find requirement ${plan.requirementId}.`,
        );
      }

      const state = states.get(plan.experienceId) ?? createRoleState();
      states.set(plan.experienceId, state);

      const action = this.actionVerbEngine.select({
        plan,
        requirement,
        assignment,
        usedCanonicalKeys: documentState.usedActionVerbKeys,
      });

      const directKeywordLimit =
        requirement.category === "technical-skill" ||
        requirement.category === "tool-or-platform"
          ? 1
          : this.directKeywordsPerBullet;
      const direct = this.directKeywordEngine.select({
        jobDescription: input.jobDescription,
        plan,
        requirementsById,
        usedCanonicalKeys: documentState.usedGlobalKeywordKeys,
        maximumKeywords: directKeywordLimit,
      });
      const directKeys = new Set(direct.keywords.map(canonicalKeywordKey));

      const supporting = this.supportingKeywordEngine.select({
        jobDescription: input.jobDescription,
        plan,
        requirement,
        assignment,
        usedCanonicalKeys: documentState.usedGlobalKeywordKeys,
        directCanonicalKeys: directKeys,
        directKeywords: direct.keywords,
        maximumKeywords: this.supportingKeywordsPerBullet,
      });

      const currentPackageKeywordKeys = new Set<string>([
        ...documentState.usedGlobalKeywordKeys,
        ...directKeys,
        ...supporting.map((detail) => detail.canonicalKey),
      ]);
      const outcomes = this.outcomeKeywordEngine.select({
        plan,
        requirement,
        usedCanonicalKeys: currentPackageKeywordKeys,
        maximumKeywords: this.outcomeKeywordsPerBullet,
      });

      state.usedActionVerbKeys.add(action.canonicalKey);
      documentState.usedActionVerbKeys.add(action.canonicalKey);
      locks.push(
        lock(
          plan.experienceId,
          plan.bulletId,
          "action-verb",
          action.actionVerb,
          action.canonicalKey,
          false,
        ),
      );

      for (const evidence of direct.evidence) {
        const canonicalKey = canonicalKeywordKey(evidence.keyword);
        const reused = documentState.usedGlobalKeywordKeys.has(canonicalKey);
        state.usedDirectKeys.add(canonicalKey);
        state.usedGlobalKeywordKeys.add(canonicalKey);
        documentState.usedDirectKeys.add(canonicalKey);
        documentState.usedGlobalKeywordKeys.add(canonicalKey);
        locks.push(
          lock(
            plan.experienceId,
            plan.bulletId,
            "direct-keyword",
            evidence.keyword,
            canonicalKey,
            reused,
          ),
        );
        if (reused) {
          controlledDirectKeywordReuse.push(
            `${plan.experienceId}:${evidence.keyword}`,
          );
        }
      }

      for (const detail of supporting) {
        state.usedSupportingKeys.add(detail.canonicalKey);
        state.usedGlobalKeywordKeys.add(detail.canonicalKey);
        documentState.usedSupportingKeys.add(detail.canonicalKey);
        documentState.usedGlobalKeywordKeys.add(detail.canonicalKey);
        locks.push(
          lock(
            plan.experienceId,
            plan.bulletId,
            "supporting-keyword",
            detail.keyword,
            detail.canonicalKey,
            false,
          ),
        );
      }

      for (const detail of outcomes) {
        state.usedOutcomeKeys.add(detail.canonicalKey);
        state.usedGlobalKeywordKeys.add(detail.canonicalKey);
        documentState.usedOutcomeKeys.add(detail.canonicalKey);
        documentState.usedGlobalKeywordKeys.add(detail.canonicalKey);
        locks.push(
          lock(
            plan.experienceId,
            plan.bulletId,
            "outcome-keyword",
            detail.keyword,
            detail.canonicalKey,
            false,
          ),
        );
      }

      packages.push({
        bulletId: plan.bulletId,
        experienceId: plan.experienceId,
        requirementId: plan.requirementId,
        achievementDimension: plan.achievementDimension,
        actionVerb: action.actionVerb,
        actionVerbCanonicalKey: action.canonicalKey,
        directKeywords: direct.keywords,
        directKeywordEvidence: direct.evidence,
        supportingKeywords: supporting.map((detail) => detail.keyword),
        supportingKeywordDetails: supporting,
        outcomeKeywords: outcomes.map((detail) => detail.keyword),
        outcomeKeywordDetails: outcomes,
        allocationRationale: [
          action.rationale,
          `Allocated ${direct.keywords.length} direct JD keyword(s), ${supporting.length} non-repeating supporting keyword(s), and ${outcomes.length} distinct outcome keyword(s).`,
          direct.controlledReuse.length > 0
            ? "Direct JD wording was reused only as controlled grounding for a sparse or repeated requirement plan."
            : "All selected direct JD keyword concepts were unused earlier in this generation.",
        ].join(" "),
      });
    }

    const validation = validateKeywordAllocation({
      jobDescription: input.jobDescription,
      assignments: input.assignments,
      requirements: input.requirements,
      plans: input.plans,
      packages,
      controlledDirectKeywordReuse: [
        ...new Set(controlledDirectKeywordReuse),
      ],
    });

    if (validation.overallStatus !== "approved") {
      throw new Error(
        `Keyword allocation failed validation: ${validation.errors.join(" ")}`,
      );
    }

    return {
      context: input.context,
      packages,
      locks,
      validation,
    };
  }

  private assertInput(input: KeywordAllocatorInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error(
        "Keyword Allocator input context does not match the supplied JD.",
      );
    }
    if (input.jobDescription.rawText.trim().length === 0) {
      throw new Error("Keyword Allocator cannot process an empty JD.");
    }
    if (input.assignments.length === 0) {
      throw new Error("Keyword Allocator requires role assignments.");
    }
    if (input.requirements.length === 0) {
      throw new Error("Keyword Allocator requires JD requirements.");
    }
    if (input.plans.length === 0) {
      throw new Error("Keyword Allocator requires bullet plans.");
    }

    const reservedIds = new Set((input.reservedPackages ?? []).map((item) => item.bulletId));
    for (const plan of input.plans) {
      if (reservedIds.has(plan.bulletId)) {
        throw new Error(`Keyword Allocator cannot regenerate reserved bullet ${plan.bulletId}.`);
      }
    }
    void input.regenerationAttempt;

    const duplicatePlanIds = input.plans
      .map((plan) => plan.bulletId)
      .filter(
        (bulletId, index, values) => values.indexOf(bulletId) !== index,
      );
    if (duplicatePlanIds.length > 0) {
      throw new Error(
        `Keyword Allocator received duplicate bullet IDs: ${[
          ...new Set(duplicatePlanIds),
        ].join(", ")}.`,
      );
    }

    const assignmentIds = new Set(
      input.assignments.map((assignment) => assignment.experienceId),
    );
    const requirementIds = new Set(
      input.requirements.map((requirement) => requirement.requirementId),
    );
    for (const plan of input.plans) {
      if (!assignmentIds.has(plan.experienceId)) {
        throw new Error(
          `Keyword Allocator received plan ${plan.bulletId} for unknown experience ${plan.experienceId}.`,
        );
      }
      if (!requirementIds.has(plan.requirementId)) {
        throw new Error(
          `Keyword Allocator received plan ${plan.bulletId} for unknown requirement ${plan.requirementId}.`,
        );
      }
      for (const requirementId of plan.supportingRequirementIds) {
        if (!requirementIds.has(requirementId)) {
          throw new Error(
            `Keyword Allocator received unknown supporting requirement ${requirementId}.`,
          );
        }
      }
    }
  }
}
