import type {
  BaseResumeExtracted,
  BaseResumeRecord,
  BaseResumeSummary,
} from "@resume/contracts";

export type StoredBaseResumeRecord = BaseResumeRecord;

export type CreateBaseResumeInput = {
  username: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  rawText: string;
  extracted: BaseResumeExtracted;
  isFavorite?: boolean;
};

export type { BaseResumeSummary };
