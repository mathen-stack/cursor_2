import type {
  EngineeringStackId,
  JobDescription,
  StackContext,
  StackScore,
  StackSignalEvidence,
} from "@resume/contracts";
import { STACK_DEFINITIONS } from "./stack-catalog";

export const STACK_DETECTOR_VERSION = "1.0.0";

function collectEvidence(
  text: string,
  phrase: string,
  weight: number,
): StackSignalEvidence | null {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index < 0) {
    return null;
  }
  return { phrase, weight, startIndex: index };
}

function scoreStack(text: string, stackId: EngineeringStackId): StackScore {
  const definition = STACK_DEFINITIONS.find((item) => item.stackId === stackId);
  if (!definition) {
    return { stackId, score: 0, evidence: [] };
  }

  let score = 0;
  const evidence: StackSignalEvidence[] = [];
  const lower = text.toLowerCase();
  for (const signal of definition.signals) {
    const phrase = signal.phrase.toLowerCase();
    const occurrences = lower.split(phrase).length - 1;
    if (occurrences <= 0) {
      continue;
    }
    score += Math.min(occurrences, 3) * signal.weight;
    const item = collectEvidence(text, signal.phrase, signal.weight);
    if (item) {
      evidence.push(item);
    }
  }
  return { stackId, score, evidence };
}

/**
 * Detects primary/secondary engineering stacks from a JD.
 * Additive and non-destructive: callers may ignore the result without
 * changing existing generation behavior.
 */
export function detectEngineeringStacks(
  jobDescription: Pick<JobDescription, "rawText" | "normalizedText">,
): StackContext {
  const text = jobDescription.normalizedText || jobDescription.rawText;
  const scores = STACK_DEFINITIONS.map((definition) =>
    scoreStack(text, definition.stackId),
  ).sort((left, right) => right.score - left.score || left.stackId.localeCompare(right.stackId));

  const primary = scores[0];
  const fallbackPrimary: StackScore = {
    stackId: "general-software",
    score: 0,
    evidence: [],
  };
  const chosenPrimary =
    primary && primary.score > 0 ? primary : fallbackPrimary;

  const secondaryStacks = scores
    .filter(
      (item) =>
        item.stackId !== chosenPrimary.stackId &&
        item.score > 0 &&
        item.score >= Math.max(4, chosenPrimary.score * 0.35),
    )
    .slice(0, 3)
    .map((item) => item.stackId);

  const runnerUp = scores.find((item) => item.stackId !== chosenPrimary.stackId)?.score ?? 0;
  const confidence =
    chosenPrimary.score <= 0
      ? 0.4
      : Math.min(0.98, 0.55 + Math.max(0, chosenPrimary.score - runnerUp) / 40);

  return {
    primaryStack: chosenPrimary.stackId,
    secondaryStacks,
    scores: scores.filter((item) => item.score > 0 || item.stackId === "general-software"),
    confidence,
    detectorVersion: STACK_DETECTOR_VERSION,
  };
}
