import { z } from "zod";
import type { FinalResumeData } from "./final-resume";

export const ResumeExportFormatSchema = z.enum(["html", "txt", "docx", "pdf"]);
export type ResumeExportFormat = z.infer<typeof ResumeExportFormatSchema>;

export interface ResumeExportSubmission {
  resume: FinalResumeData;
  format: ResumeExportFormat;
}
