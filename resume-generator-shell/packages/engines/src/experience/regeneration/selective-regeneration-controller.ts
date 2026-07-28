import { assertSubEngineContextMatch } from "../types/context";
import type {
  SelectiveRegenerationController as SelectiveRegenerationControllerContract,
  SelectiveRegenerationDependencies,
  SelectiveRegenerationInput,
  SelectiveRegenerationOutput,
} from "../types/regeneration";

export interface RealSelectiveRegenerationControllerOptions {
  maximumAttempts?: number;
}

function replaceByBulletId<T extends { bulletId: string }>(
  current: readonly T[],
  replacements: readonly T[],
): T[] {
  const replacementById = new Map(replacements.map((item) => [item.bulletId, item]));
  return current.map((item) => replacementById.get(item.bulletId) ?? item);
}

export class RealSelectiveRegenerationController
  implements SelectiveRegenerationControllerContract
{
  readonly name = "real-selective-bullet-regeneration-controller";
  private readonly maximumAttempts: number;

  constructor(options: RealSelectiveRegenerationControllerOptions = {}) {
    this.maximumAttempts = options.maximumAttempts ?? 3;
    if (this.maximumAttempts < 1 || this.maximumAttempts > 5) {
      throw new Error("maximumAttempts must be between 1 and 5.");
    }
  }

  async execute(
    input: SelectiveRegenerationInput,
    dependencies: SelectiveRegenerationDependencies,
  ): Promise<SelectiveRegenerationOutput> {
    this.assertInput(input);

    let keywordPackages = [...input.keywordPackages];
    let stories = [...input.stories];
    let bullets = [...input.bullets];
    let validationOutput = input.validationOutput;
    const initiallyFailed = new Set(validationOutput.validation.failedBulletIds);
    const regenerated = new Set<string>();
    let attempts = 0;

    while (
      validationOutput.validation.overallStatus === "rejected" &&
      validationOutput.validation.failedBulletIds.length > 0 &&
      attempts < this.maximumAttempts
    ) {
      attempts += 1;
      const failedIds = new Set(validationOutput.validation.failedBulletIds);
      const failedPlans = input.plans.filter((plan) => failedIds.has(plan.bulletId));
      if (failedPlans.length === 0) break;

      const approvedIds = new Set(
        input.plans
          .map((plan) => plan.bulletId)
          .filter((bulletId) => !failedIds.has(bulletId)),
      );
      const reservedPackages = keywordPackages.filter((item) => approvedIds.has(item.bulletId));
      const previousPackages = keywordPackages.filter((item) => failedIds.has(item.bulletId));
      const reservedStories = stories.filter((item) => approvedIds.has(item.bulletId));
      const previousStories = stories.filter((item) => failedIds.has(item.bulletId));
      const reservedBullets = bullets.filter((item) => approvedIds.has(item.bulletId));

      try {
        const keywordOutput = await dependencies.keywordAllocator.execute({
          context: input.context,
          jobDescription: input.jobDescription,
          assignments: input.assignments,
          requirements: input.requirements,
          plans: failedPlans,
          reservedPackages,
          previousPackages,
          regenerationAttempt: attempts,
        });
        assertSubEngineContextMatch(
          input.context,
          keywordOutput.context,
          dependencies.keywordAllocator.name,
        );

        const starOutput = await dependencies.starGenerator.execute({
          context: input.context,
          jobDescription: input.jobDescription,
          assignments: input.assignments,
          requirements: input.requirements,
          plans: failedPlans,
          keywordPackages: keywordOutput.packages,
          reservedStories,
          previousStories,
          regenerationAttempt: attempts,
        });
        assertSubEngineContextMatch(
          input.context,
          starOutput.context,
          dependencies.starGenerator.name,
        );

        const compositionOutput = await dependencies.bulletComposer.execute({
          context: input.context,
          jobDescription: input.jobDescription,
          plans: failedPlans,
          keywordPackages: keywordOutput.packages,
          stories: starOutput.stories,
          reservedBullets,
          regenerationAttempt: attempts,
        });
        assertSubEngineContextMatch(
          input.context,
          compositionOutput.context,
          dependencies.bulletComposer.name,
        );

        keywordPackages = replaceByBulletId(keywordPackages, keywordOutput.packages);
        stories = replaceByBulletId(stories, starOutput.stories);
        bullets = replaceByBulletId(bullets, compositionOutput.bullets);
        for (const plan of failedPlans) regenerated.add(plan.bulletId);

        validationOutput = await dependencies.experienceValidator.execute({
          context: input.context,
          jobDescription: input.jobDescription,
          careerHistory: input.careerHistory,
          assignments: input.assignments,
          requirements: input.requirements,
          plans: input.plans,
          keywordPackages,
          stories,
          bullets,
          minimumBulletsPerRole: input.minimumBulletsPerRole,
        });
        assertSubEngineContextMatch(
          input.context,
          validationOutput.context,
          dependencies.experienceValidator.name,
        );
      } catch {
        break;
      }
    }

    const stillFailed = new Set(validationOutput.validation.failedBulletIds);
    validationOutput = {
      ...validationOutput,
      validation: {
        ...validationOutput.validation,
        regeneration: {
          attempted: initiallyFailed.size > 0,
          attempts,
          regeneratedBulletIds: [...regenerated].sort(),
          preservedBulletIds: input.bullets
            .map((item) => item.bulletId)
            .filter((bulletId) => !initiallyFailed.has(bulletId))
            .sort(),
          exhaustedBulletIds: [...stillFailed].sort(),
        },
      },
    };

    return { keywordPackages, stories, bullets, validationOutput };
  }

  private assertInput(input: SelectiveRegenerationInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error("Selective Regeneration input context does not match the supplied JD.");
    }
    const plannedIds = new Set(input.plans.map((item) => item.bulletId));
    for (const bulletId of input.validationOutput.validation.failedBulletIds) {
      if (!plannedIds.has(bulletId)) {
        throw new Error(`Selective Regeneration received unknown failed bullet ${bulletId}.`);
      }
    }
  }
}
