import type {
  ExternalResumeFeedbackItem,
  ExternalResumeTestInput,
  FinalResumeData,
} from "@resume/contracts";
import { getResumeReadinessService } from "../../../../lib/resume-readiness-service";

export const runtime = "nodejs";

interface CalibrationPayload {
  resume?: FinalResumeData;
  overallScore?: number;
  relevancyScore?: number;
  feedback?: ExternalResumeFeedbackItem[];
  notes?: string;
  testedAt?: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as CalibrationPayload;
    if (!payload.resume?.document?.contentFingerprint || payload.overallScore === undefined) {
      return Response.json(
        {
          error: {
            code: "INVALID_CALIBRATION_REQUEST",
            message: "An exact generated resume and external overall score are required.",
          },
        },
        { status: 400 },
      );
    }
    const service = getResumeReadinessService();
    const readiness = service.assess(payload.resume);
    if (
      !readiness.criticalGates.contentFingerprintApproved ||
      !readiness.criticalGates.assemblyApproved ||
      !readiness.criticalGates.allSourceEnginesApproved
    ) {
      return Response.json(
        {
          error: {
            code: "UNTRUSTED_CALIBRATION_RESUME",
            message:
              "External results can be recorded only for an unchanged, approved assembled resume.",
          },
        },
        { status: 400 },
      );
    }
    const input: ExternalResumeTestInput = {
      platform: "resume-worded",
      generationId: payload.resume.context.generationId,
      jdId: payload.resume.context.jdId,
      jdHash: payload.resume.context.jdHash,
      documentFingerprint: payload.resume.document.contentFingerprint,
      internalReadinessScore: readiness.internalScore,
      overallScore: payload.overallScore,
      ...(payload.relevancyScore !== undefined
        ? { relevancyScore: payload.relevancyScore }
        : {}),
      feedback: payload.feedback ?? [],
      ...(payload.notes ? { notes: payload.notes } : {}),
      ...(payload.testedAt ? { testedAt: payload.testedAt } : {}),
    };
    const record = await service.recordExternalTest(input);
    return Response.json(record, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: error instanceof Error ? error.name : "CALIBRATION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "External score calibration failed.",
        },
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const generationId = new URL(request.url).searchParams.get("generationId")?.trim();
  if (!generationId) {
    return Response.json(
      {
        error: {
          code: "GENERATION_ID_REQUIRED",
          message: "generationId is required.",
        },
      },
      { status: 400 },
    );
  }
  const records = await getResumeReadinessService().listExternalTests(generationId);
  return Response.json(records);
}
