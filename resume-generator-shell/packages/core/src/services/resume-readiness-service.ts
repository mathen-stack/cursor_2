import type {
  ExternalResumeTestInput,
  ExternalResumeTestListResult,
  ExternalResumeTestRecord,
  FinalResumeData,
  ResumeWordedReadinessReport,
} from "@resume/contracts";
import {
  ExternalCalibrationContextError,
  ExternalResumeCalibrationAnalyzer,
} from "../calibration/external-resume-calibration";
import type { ExternalResumeTestStore } from "../calibration/external-resume-test-store";
import type { ResumeReadinessEvaluator } from "../readiness/resume-worded-readiness-engine";

export class ResumeReadinessService {
  constructor(
    private readonly evaluator: ResumeReadinessEvaluator,
    private readonly calibrationAnalyzer: ExternalResumeCalibrationAnalyzer,
    private readonly store: ExternalResumeTestStore,
  ) {}

  assess(resume: FinalResumeData): ResumeWordedReadinessReport {
    return this.evaluator.assess(resume);
  }

  async recordExternalTest(
    input: ExternalResumeTestInput,
  ): Promise<ExternalResumeTestRecord> {
    const existing = await this.store.listByGeneration(input.generationId);
    for (const record of existing.records) {
      if (record.jdId !== input.jdId || record.jdHash !== input.jdHash) {
        throw new ExternalCalibrationContextError(
          "A calibration record cannot cross JD boundaries within a generation.",
        );
      }
      if (record.documentFingerprint !== input.documentFingerprint) {
        throw new ExternalCalibrationContextError(
          "External feedback is scoped to one exact exported resume fingerprint.",
        );
      }
    }
    const record = this.calibrationAnalyzer.createRecord(input);
    await this.store.save(record);
    return record;
  }

  async listExternalTests(
    generationId: string,
  ): Promise<ExternalResumeTestListResult> {
    return this.store.listByGeneration(generationId);
  }
}
