import type { FinalResumeData } from "@resume/contracts";
import { createCanonicalResume } from "./canonical/canonical-resume";
import type { ResumeFormatRenderer, ResumeRenderResult } from "./types";
import { utf8 } from "./utils/binary";

export class AtsTextRenderer implements ResumeFormatRenderer {
  readonly format = "txt" as const;

  async render(data: FinalResumeData): Promise<ResumeRenderResult> {
    const canonical = createCanonicalResume(data);
    return {
      format: this.format,
      bytes: utf8(canonical.plainText),
      emittedTokens: [...canonical.tokens],
      atsSafeStructure: true,
      selectableTextExpected: true,
      warnings: [],
    };
  }
}
