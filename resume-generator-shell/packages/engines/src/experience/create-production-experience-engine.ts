import type { StructuredLanguageModel } from "../providers/language-model";
import { OpenAICompatibleStructuredModel } from "../providers/openai-compatible-structured-model";
import { RealBulletComposer, type RealBulletComposerOptions } from "./composition/real-bullet-composer";
import { DefaultExperienceEngine } from "./experience-engine";
import { RealKeywordAllocator, type RealKeywordAllocatorOptions } from "./keywords/real-keyword-allocator";
import { RealBulletPlanner } from "./planning/real-bullet-planner";
import { RealSelectiveRegenerationController, type RealSelectiveRegenerationControllerOptions } from "./regeneration/selective-regeneration-controller";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";
import { RealStarGenerator, type RealStarGeneratorOptions } from "./star/real-star-generator";
import { RealExperienceValidator, type RealExperienceValidatorOptions } from "./validation/real-experience-validator";

export type ExperienceModelProvider = "rule-based" | "openai-compatible";

export interface ExperienceModelProviderConfig {
  provider: ExperienceModelProvider;
  providerName?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  httpReferer?: string;
  applicationTitle?: string;
}

export interface ProductionExperienceEngineOptions {
  modelProvider?: ExperienceModelProviderConfig;
  role?: RealRoleAssignmentEngineOptions;
  keywords?: RealKeywordAllocatorOptions;
  star?: RealStarGeneratorOptions;
  composition?: RealBulletComposerOptions;
  validation?: RealExperienceValidatorOptions;
  regeneration?: RealSelectiveRegenerationControllerOptions;
}

export interface ProductionExperienceEngineBundle {
  engine: DefaultExperienceEngine;
  providerName: string;
}

function createRequirementModel(
  config: ExperienceModelProviderConfig | undefined,
): { model: StructuredLanguageModel; providerName: string } {
  if (!config || config.provider === "rule-based") {
    return {
      model: new RuleBasedRequirementModel(),
      providerName: "rule-based",
    };
  }

  if (!config.apiKey || !config.model) {
    throw new Error(
      "OPENAI-compatible provider configuration requires apiKey and model.",
    );
  }

  const providerName = config.providerName ?? "openai-compatible";
  const adapterOptions = {
    providerName,
    apiKey: config.apiKey,
    model: config.model,
  } as const;

  return {
    model: new OpenAICompatibleStructuredModel({
      ...adapterOptions,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      ...(config.httpReferer ? { httpReferer: config.httpReferer } : {}),
      ...(config.applicationTitle
        ? { applicationTitle: config.applicationTitle }
        : {}),
    }),
    providerName,
  };
}

export function createProductionExperienceEngine(
  options: ProductionExperienceEngineOptions = {},
): ProductionExperienceEngineBundle {
  const requirementModel = createRequirementModel(options.modelProvider);

  const engine = new DefaultExperienceEngine(
    {
      requirementExtractor: new RealRequirementExtractor({
        model: requirementModel.model,
      }),
      roleAssignmentEngine: new RealRoleAssignmentEngine(options.role),
      bulletPlanner: new RealBulletPlanner(),
      keywordAllocator: new RealKeywordAllocator(options.keywords),
      starGenerator: new RealStarGenerator(options.star),
      bulletComposer: new RealBulletComposer(options.composition),
      experienceValidator: new RealExperienceValidator(options.validation),
      selectiveRegenerationController: new RealSelectiveRegenerationController(
        options.regeneration,
      ),
    },
    { engineVersion: "0.9.0" },
  );

  return { engine, providerName: requirementModel.providerName };
}

export function loadExperienceModelProviderConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ExperienceModelProviderConfig {
  const providerRaw = environment.EXPERIENCE_MODEL_PROVIDER?.trim().toLowerCase();
  const apiKey =
    environment.EXPERIENCE_MODEL_API_KEY?.trim() ||
    environment.OPENROUTER_API_KEY?.trim();
  const model =
    environment.EXPERIENCE_MODEL_NAME?.trim() || "openai/gpt-4o-mini";

  // Explicit offline mode.
  if (providerRaw === "rule-based") {
    return { provider: "rule-based" };
  }

  // AI-first: openai-compatible / openrouter (default when unset) uses OpenRouter
  // whenever an API key is present. Without a key, fall back to rule-based so
  // local/demo runs still work.
  const wantsOpenAiCompatible =
    !providerRaw ||
    providerRaw === "openai-compatible" ||
    providerRaw === "openrouter";

  if (!wantsOpenAiCompatible) {
    throw new Error(
      `Unsupported EXPERIENCE_MODEL_PROVIDER: ${providerRaw}. Expected rule-based, openai-compatible, or openrouter.`,
    );
  }

  if (!apiKey) {
    return { provider: "rule-based" };
  }

  const config: ExperienceModelProviderConfig = {
    provider: "openai-compatible",
    providerName:
      environment.EXPERIENCE_MODEL_PROVIDER_NAME?.trim() || "openrouter",
    apiKey,
    model,
    baseUrl:
      environment.EXPERIENCE_MODEL_BASE_URL?.trim() ||
      "https://openrouter.ai/api/v1",
    applicationTitle:
      environment.EXPERIENCE_MODEL_APP_TITLE?.trim() || "Resume Generator",
  };

  const referer = environment.EXPERIENCE_MODEL_HTTP_REFERER?.trim();
  if (referer) config.httpReferer = referer;

  const timeout = Number(environment.EXPERIENCE_MODEL_TIMEOUT_MS);
  if (Number.isFinite(timeout) && timeout > 0) config.timeoutMs = timeout;
  const retries = Number(environment.EXPERIENCE_MODEL_MAX_RETRIES);
  if (Number.isInteger(retries) && retries >= 0) config.maxRetries = retries;

  return config;
}
