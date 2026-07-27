import type {
  StarGenerator,
  StarGeneratorInput,
  StarGeneratorOutput,
  StarStory,
} from "../types/star-story";
import { ActionGenerationEngine } from "./action-generation-engine";
import { MetricGenerationEngine } from "./metric-generation-engine";
import { ResultGenerationEngine } from "./result-generation-engine";
import { SituationGenerationEngine } from "./situation-generation-engine";
import { StarCoherenceValidator } from "./star-coherence-validator";
import { validateStarGeneration } from "./star-generation-validator";
import { TaskGenerationEngine } from "./task-generation-engine";

export interface RealStarGeneratorOptions {
  situationEngine?: SituationGenerationEngine;
  taskEngine?: TaskGenerationEngine;
  actionEngine?: ActionGenerationEngine;
  metricEngine?: MetricGenerationEngine;
  resultEngine?: ResultGenerationEngine;
  coherenceValidator?: StarCoherenceValidator;
}

export class RealStarGenerator implements StarGenerator {
  readonly name = "real-situation-task-action-result-metric-engine";

  private readonly situationEngine: SituationGenerationEngine;
  private readonly taskEngine: TaskGenerationEngine;
  private readonly actionEngine: ActionGenerationEngine;
  private readonly metricEngine: MetricGenerationEngine;
  private readonly resultEngine: ResultGenerationEngine;
  private readonly coherenceValidator: StarCoherenceValidator;

  constructor(options: RealStarGeneratorOptions = {}) {
    this.situationEngine = options.situationEngine ?? new SituationGenerationEngine();
    this.taskEngine = options.taskEngine ?? new TaskGenerationEngine();
    this.actionEngine = options.actionEngine ?? new ActionGenerationEngine();
    this.metricEngine = options.metricEngine ?? new MetricGenerationEngine();
    this.resultEngine = options.resultEngine ?? new ResultGenerationEngine();
    this.coherenceValidator = options.coherenceValidator ?? new StarCoherenceValidator();
  }

  async execute(input: StarGeneratorInput): Promise<StarGeneratorOutput> {
    this.assertInput(input);
    const assignmentsById = new Map(input.assignments.map((item) => [item.experienceId, item]));
    const requirementsById = new Map(input.requirements.map((item) => [item.requirementId, item]));
    const packagesByBullet = new Map(input.keywordPackages.map((item) => [item.bulletId, item]));
    const usedMetricPatternsByRole = new Map<string, Set<string>>();
    for (const existing of [
      ...(input.reservedStories ?? []),
      ...(input.previousStories ?? []),
    ]) {
      const used = usedMetricPatternsByRole.get(existing.experienceId) ?? new Set<string>();
      for (const metric of existing.metrics) {
        used.add(`${metric.metricType}:${metric.direction}:${metric.unit}:${metric.measure.toLowerCase()}`);
      }
      usedMetricPatternsByRole.set(existing.experienceId, used);
    }
    void input.regenerationAttempt;
    const stories: StarStory[] = [];

    const orderedPlans = [...input.plans].sort((left, right) => {
      const leftRole = assignmentsById.get(left.experienceId);
      const rightRole = assignmentsById.get(right.experienceId);
      return (
        (leftRole?.chronologyRank ?? Number.MAX_SAFE_INTEGER) -
          (rightRole?.chronologyRank ?? Number.MAX_SAFE_INTEGER) ||
        left.sequence - right.sequence ||
        left.bulletId.localeCompare(right.bulletId)
      );
    });

    for (const plan of orderedPlans) {
      const assignment = assignmentsById.get(plan.experienceId);
      const requirement = requirementsById.get(plan.requirementId);
      const keywordPackage = packagesByBullet.get(plan.bulletId);
      if (!assignment) throw new Error(`STAR generation cannot find role ${plan.experienceId}.`);
      if (!requirement) throw new Error(`STAR generation cannot find requirement ${plan.requirementId}.`);
      if (!keywordPackage) throw new Error(`STAR generation cannot find keyword package ${plan.bulletId}.`);
      if (keywordPackage.experienceId !== plan.experienceId || keywordPackage.requirementId !== plan.requirementId) {
        throw new Error(`STAR generation rejected a mismatched keyword package for ${plan.bulletId}.`);
      }

      const common = {
        jobDescription: input.jobDescription,
        plan,
        keywordPackage,
        requirement,
        assignment,
      };
      const situation = this.situationEngine.generate(common);
      const task = this.taskEngine.generate(common);
      const action = this.actionEngine.generate(common);
      const usedMetricPatternKeys = usedMetricPatternsByRole.get(plan.experienceId) ?? new Set<string>();
      const metrics = this.metricEngine.generate({ ...common, usedMetricPatternKeys });
      for (const metric of metrics) {
        usedMetricPatternKeys.add(`${metric.metricType}:${metric.direction}:${metric.unit}:${metric.measure.toLowerCase()}`);
      }
      usedMetricPatternsByRole.set(plan.experienceId, usedMetricPatternKeys);
      const result = this.resultEngine.generate({ ...common, metrics });
      const draft = {
        bulletId: plan.bulletId,
        experienceId: plan.experienceId,
        requirementId: plan.requirementId,
        achievementDimension: plan.achievementDimension,
        situation,
        task,
        action,
        result: result.result,
        technicalImpact: result.technicalImpact,
        businessImpact: result.businessImpact,
        metrics,
      };
      const coherence = this.coherenceValidator.validate({
        plan,
        keywordPackage,
        story: draft,
      });
      stories.push({
        ...draft,
        coherenceScore: coherence.coherenceScore,
        metricPlausibilityScore: coherence.metricPlausibilityScore,
        status: coherence.status,
      });
    }

    const validation = validateStarGeneration({
      plans: input.plans,
      keywordPackages: input.keywordPackages,
      requirements: input.requirements,
      stories,
    });
    if (validation.overallStatus !== "approved") {
      throw new Error(`STAR generation failed validation: ${validation.errors.join(" ")}`);
    }
    return { context: input.context, stories, validation };
  }

  private assertInput(input: StarGeneratorInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error("STAR Generator input context does not match the supplied JD.");
    }
    if (input.plans.length === 0) throw new Error("STAR Generator requires at least one bullet plan.");
    const reservedIds = new Set((input.reservedStories ?? []).map((item) => item.bulletId));
    for (const plan of input.plans) {
      if (reservedIds.has(plan.bulletId)) {
        throw new Error(`STAR Generator cannot regenerate reserved bullet ${plan.bulletId}.`);
      }
    }
    if (input.keywordPackages.length !== input.plans.length) {
      throw new Error("STAR Generator requires one keyword package per bullet plan.");
    }
    if (new Set(input.plans.map((item) => item.bulletId)).size !== input.plans.length) {
      throw new Error("STAR Generator received duplicate bullet plan IDs.");
    }
    if (new Set(input.keywordPackages.map((item) => item.bulletId)).size !== input.keywordPackages.length) {
      throw new Error("STAR Generator received duplicate keyword package IDs.");
    }
  }
}
