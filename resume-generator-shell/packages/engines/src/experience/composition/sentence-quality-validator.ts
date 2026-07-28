import type { BulletPlanItem } from "../types/bullet-plan";
import type {
  BulletSentenceDiagnostic,
  BulletSentencePattern,
  ExperienceBullet,
} from "../types/composed-bullet";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarStory } from "../types/star-story";
import {
  directKeywordRepresented,
  isBrokenBulletWording,
  sentenceCount,
  stripFirstPersonPronouns,
  wordCount,
} from "./bullet-language";
import { hasIntraBulletVerbEcho } from "../validation/experience-validation-language";

const FIRST_PERSON = /\b(?:I|me|my|mine|we|us|our|ours)\b/i;
const WEAK_LANGUAGE = /\b(?:responsible for|worked on|helped with|assisted with|participated in|involved in|various tasks|successfully|effectively)\b/i;
const PASSIVE_LANGUAGE = /\b(?:was|were|been|being)\s+(?:built|developed|implemented|designed|deployed|managed|created|optimized|led|completed)\b/i;
const QUANTIFIED = /\b\d+(?:\.\d+)?\s?(?:%|x|ms|hours?|days?)/i;
/** Keep in sync with composition ensureCompositionCommunicationSignal. */
const COMMUNICATION_SIGNAL =
  /stakeholder|cross-functional|cross-team|product|business|alignment|requirements|team|collaborat|communicat|partner|facilitat|coordinat|\balign(?:ed|ing|s)?\b/i;
const LEADERSHIP_SIGNAL = /strategy|direction|leadership|architecture|roadmap|design decision|standard/i;

function startsWithVerb(text: string, verb: string): boolean {
  return text.toLocaleLowerCase().startsWith(`${verb.trim().toLocaleLowerCase()} `);
}

function allSupportingUsed(text: string, keywordPackage: KeywordPackage): boolean {
  const lower = stripFirstPersonPronouns(text).toLocaleLowerCase();
  return keywordPackage.supportingKeywords.every((keyword) =>
    lower.includes(stripFirstPersonPronouns(keyword).toLocaleLowerCase()),
  );
}

function allOutcomesUsed(text: string, keywordPackage: KeywordPackage): boolean {
  const lower = stripFirstPersonPronouns(text).toLocaleLowerCase();
  return keywordPackage.outcomeKeywords.every((keyword) =>
    lower.includes(stripFirstPersonPronouns(keyword).toLocaleLowerCase()),
  );
}

function allDirectRepresented(
  text: string,
  keywords: readonly string[],
): boolean {
  if (keywords.length === 0) {
    return true;
  }
  return keywords.every((keyword) => directKeywordRepresented(text, keyword));
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(10, value)) * 10) / 10;
}

export interface SentenceQualityValidatorOptions {
  minimumWords?: number;
  maximumWords?: number;
  minimumStrengthScore?: number;
}

export class SentenceQualityValidator {
  readonly minimumWords: number;
  readonly maximumWords: number;
  readonly minimumStrengthScore: number;

  constructor(options: SentenceQualityValidatorOptions = {}) {
    this.minimumWords = options.minimumWords ?? 16;
    this.maximumWords = options.maximumWords ?? 46;
    this.minimumStrengthScore = options.minimumStrengthScore ?? 8;
    if (this.minimumWords < 10 || this.maximumWords <= this.minimumWords) {
      throw new Error("Sentence quality word-count bounds are invalid.");
    }
  }

  validate(input: {
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    story: StarStory;
    bullet: ExperienceBullet;
    sentencePattern: BulletSentencePattern;
    distinctivenessScore: number;
  }): BulletSentenceDiagnostic {
    const text = input.bullet.finalBullet;
    const count = wordCount(text);
    const sentences = sentenceCount(text);
    const startsWithAllocatedActionVerb = startsWithVerb(
      text,
      input.keywordPackage.actionVerb,
    );
    const directKeywordCoverage = allDirectRepresented(
      text,
      input.bullet.directKeywords,
    );
    const supportingKeywordCoverage = allSupportingUsed(text, input.keywordPackage);
    const outcomeKeywordCoverage = allOutcomesUsed(text, input.keywordPackage);
    const quantifiedImpactPresent = QUANTIFIED.test(text);
    const firstPersonFree = !FIRST_PERSON.test(text);
    const weakLanguageFree = !WEAK_LANGUAGE.test(text);
    const activeVoice = startsWithAllocatedActionVerb && !PASSIVE_LANGUAGE.test(text);
    const punctuationValid = sentences === 1 && text.endsWith(".") && !/[!?;]$/.test(text);
    const communicationSignalPresent =
      !input.plan.communicationFocused || COMMUNICATION_SIGNAL.test(text);
    const leadershipSignalPresent =
      !input.plan.leadershipFocused || LEADERSHIP_SIGNAL.test(text);
    const concise = count >= this.minimumWords && count <= this.maximumWords;

    let strengthScore = 0;
    strengthScore += startsWithAllocatedActionVerb ? 1.2 : 0;
    strengthScore += directKeywordCoverage ? 1.0 : 0;
    strengthScore += supportingKeywordCoverage ? 0.8 : 0;
    strengthScore += outcomeKeywordCoverage ? 0.8 : 0;
    strengthScore += quantifiedImpactPresent ? 1.5 : 0;
    strengthScore += activeVoice ? 0.8 : 0;
    strengthScore += firstPersonFree ? 0.4 : 0;
    strengthScore += weakLanguageFree ? 0.5 : 0;
    strengthScore += punctuationValid ? 0.5 : 0;
    strengthScore += concise ? 0.8 : 0;
    strengthScore += communicationSignalPresent ? 0.5 : 0;
    strengthScore += leadershipSignalPresent ? 0.5 : 0;
    const storyQuality = Math.min(
      input.story.coherenceScore,
      input.story.metricPlausibilityScore,
    );
    strengthScore += storyQuality >= 8 ? 0.7 : 0;
    strengthScore = roundScore(strengthScore);

    const warnings: string[] = [];
    const errors: string[] = [];
    if (count < this.minimumWords) errors.push("Bullet is too short to demonstrate a complete achievement.");
    if (count > this.maximumWords) errors.push("Bullet exceeds the configured scan-friendly word limit.");
    if (!startsWithAllocatedActionVerb) errors.push("Bullet does not start with its allocated action verb.");
    if (!directKeywordCoverage) errors.push("Bullet does not represent every allocated direct JD keyword.");
    if (!supportingKeywordCoverage) errors.push("Bullet omits one or more allocated supporting keywords.");
    if (!outcomeKeywordCoverage) errors.push("Bullet omits one or more allocated outcome keywords.");
    if (!quantifiedImpactPresent) errors.push("Bullet has no quantified impact.");
    if (!activeVoice) errors.push("Bullet is not consistently written in active voice.");
    if (!firstPersonFree) errors.push("Bullet contains a first-person pronoun.");
    if (!weakLanguageFree) errors.push("Bullet contains weak or filler language.");
    if (!punctuationValid) errors.push("Bullet must be one clean sentence with one terminal period.");
    if (!communicationSignalPresent) errors.push("Communication-focused bullet lost its stakeholder or collaboration signal.");
    if (!leadershipSignalPresent) errors.push("Leadership-focused bullet lost its technical direction signal.");
    if (hasIntraBulletVerbEcho(text) || isBrokenBulletWording(text)) {
      errors.push("Bullet contains repeated phrasing or an imperative verb/object clash.");
    }
    if (/[–—]/.test(text) || /\b(?:using go through|can to|so new markets?)\b/i.test(text)) {
      errors.push("Bullet retains broken JD fragment wording.");
    }
    if (input.distinctivenessScore < 8) errors.push("Bullet is not sufficiently distinctive within its role.");
    if (strengthScore < this.minimumStrengthScore) errors.push("Bullet strength score is below the approval threshold.");
    if (count > 40 && count <= this.maximumWords) warnings.push("Bullet is valid but near the upper word-count limit.");

    return {
      bulletId: input.bullet.bulletId,
      experienceId: input.plan.experienceId,
      sentencePattern: input.sentencePattern,
      wordCount: count,
      sentenceCount: sentences,
      startsWithAllocatedActionVerb,
      directKeywordCoverage,
      supportingKeywordCoverage,
      outcomeKeywordCoverage,
      quantifiedImpactPresent,
      activeVoice,
      firstPersonFree,
      weakLanguageFree,
      punctuationValid,
      communicationSignalPresent,
      leadershipSignalPresent,
      strengthScore,
      distinctivenessScore: roundScore(input.distinctivenessScore),
      warnings,
      errors,
    };
  }
}
