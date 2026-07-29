import type { GenerationContext } from "../common/generation-context";
import type { JobDescription } from "../common/job-description";

export interface EngineInputBase {
  context: GenerationContext;
  jobDescription: JobDescription;
}

export interface EngineOutputBase {
  context: GenerationContext;
  engineName: string;
  engineVersion: string;
  status: "approved" | "rejected" | "failed";
}

export interface ResumeEngine<I extends EngineInputBase, O extends EngineOutputBase> {
  readonly name: string;
  readonly version: string;
  execute(input: I): Promise<O>;
}
