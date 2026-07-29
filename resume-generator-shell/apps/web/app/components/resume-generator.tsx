"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type {
  CareerEntry,
  ExternalResumeFeedbackCategory,
  ExternalResumeTestRecord,
  FinalResumeData,
  UserProfile,
} from "@resume/contracts";
import { PeriodDateControl } from "./period-date-control";
import {
  detectCompanyNameFromJd,
  formatJdResultHeadline,
  isFallbackJobRole,
} from "../lib/detect-company-from-jd";
import {
  createEmptyProfile,
} from "../../lib/saved-profile-store";

function resolveRoleFromResume(
  resume: FinalResumeData,
  fallbackRole: string,
): string {
  if (!isFallbackJobRole(fallbackRole)) return fallbackRole;
  const summaryRole = resume.summary?.targetRole?.title?.trim();
  if (summaryRole) return summaryRole;
  const experienceRole = resume.experience?.experiences?.[0]?.assignedRole?.trim();
  if (experienceRole) return experienceRole;
  return fallbackRole;
}

function formatResultHeadline(role: string, company: string): string {
  return `${role} | ${company || "Target Company"}`;
}

const AUTO_DOWNLOAD_FORMAT = "pdf" as const;

function resumeFilenameFromFullName(fullName: string, format: string): string {
  const stem =
    fullName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "resume";
  return `${stem}.${format}`;
}

/** Ensure export/download filename uses the profile full name. */
function resumeWithProfileFullName(
  resume: FinalResumeData,
  fullName: string,
): FinalResumeData {
  const trimmed = fullName.trim();
  if (!trimmed) return resume;
  return {
    ...resume,
    profile: {
      ...resume.profile,
      personalInformation: {
        ...resume.profile.personalInformation,
        fullName: trimmed,
      },
    },
  };
}

/**
 * As soon as a resume exists: export PDF named <full-name>.pdf, save under
 * download/, and trigger an automatic browser download (no second click).
 */
async function deliverGeneratedResume(
  resume: FinalResumeData,
  format: "docx" | "pdf" | "txt" = AUTO_DOWNLOAD_FORMAT,
  profileFullName?: string,
): Promise<{ filename: string }> {
  const namedResume = resumeWithProfileFullName(
    resume,
    profileFullName ?? resume.profile.personalInformation.fullName,
  );
  const filename = resumeFilenameFromFullName(
    namedResume.profile.personalInformation.fullName,
    format,
  );

  const response = await fetch("/api/resume/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Return PDF bytes (server also writes download/<full-name>.pdf).
    body: JSON.stringify({ resume: namedResume, format }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? "Resume download failed.");
  }

  const bytes = await response.arrayBuffer();
  const savedName =
    filenameFromContentDisposition(response.headers.get("Content-Disposition")) ??
    filename;

  // Auto-download immediately as <full-name>.pdf in the same tab.
  triggerBlobAutoDownload(bytes, savedName);

  return { filename: savedName };
}

function filenameFromContentDisposition(
  header: string | null,
): string | undefined {
  if (!header) return undefined;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // fall through
    }
  }
  const plainMatch = /filename="([^"]+)"/i.exec(header);
  if (plainMatch?.[1]) return plainMatch[1];
  const bareMatch = /filename=([^;]+)/i.exec(header);
  return bareMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
}

function triggerBlobAutoDownload(bytes: ArrayBuffer, filename: string): void {
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const blob = new Blob([bytes], {
    type: isPdf ? "application/pdf" : "application/octet-stream",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  // Programmatic click in the Generate() async chain starts the download.
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 10_000);
}

async function autoDeliverGeneratedResume(
  resume: FinalResumeData,
  profileFullName: string,
): Promise<{ filename: string }> {
  return deliverGeneratedResume(resume, AUTO_DOWNLOAD_FORMAT, profileFullName);
}

const FIELD_PLACEHOLDERS = {
  fullName: "Enter your full name",
  email: "name@example.com",
  phone: "+1 555 123 4567",
  location: "City, State or Country",
  linkedin: "https://linkedin.com/in/username",
  portfolio: "https://yourportfolio.com",
  company: "Company name",
  school: "University or school name",
  degree: "Bachelor of Science",
  fieldOfStudy: "Computer Science",
  periodStart: "Aug 2018",
  periodEnd: "May 2022",
  periodEndPresent: "Present",
  jobDescription: "Paste the full job description here",
  overallScore: "e.g. 85",
  relevancyScore: "e.g. 78",
  feedbackCategory: "Select a feedback category",
  feedbackMessage: "Paste one feedback item from Resume Worded (optional)",
} as const;

const GENERATION_STEPS = [
  { id: "experience", label: "Building experience bullets" },
  { id: "summary", label: "Writing professional summary" },
  { id: "template", label: "Selecting ATS template" },
  { id: "skills", label: "Ranking JD skills" },
  { id: "assemble", label: "Assembling final resume" },
  { id: "readiness", label: "Checking ATS readiness" },
] as const;

/** Constant progress cadence — same speed before and after the API returns. */
const PROGRESS_TICK_MS = 300;
const PROGRESS_PERCENT_PER_TICK = 2;
const PROGRESS_HOLD_PERCENT = 92;
const PDF_EXPORT_TICK_MS = 220;
const PDF_EXPORT_PERCENT_PER_TICK = 3;

type GenerationProgress = {
  stepIndex: number;
  percent: number;
  label: string;
};

function progressFromPercent(percent: number): GenerationProgress {
  const capped = Math.max(0, Math.min(100, percent));
  const stepIndex =
    capped >= 100
      ? GENERATION_STEPS.length - 1
      : Math.min(
          GENERATION_STEPS.length - 2,
          Math.floor(
            ((Math.min(capped, PROGRESS_HOLD_PERCENT) - 6) /
              (PROGRESS_HOLD_PERCENT - 6)) *
              (GENERATION_STEPS.length - 1),
          ),
        );
  const safeIndex = Math.max(0, stepIndex);
  return {
    stepIndex: safeIndex,
    percent: capped,
    label:
      capped >= 100
        ? "Resume ready"
        : (GENERATION_STEPS[safeIndex]?.label ?? GENERATION_STEPS[0].label),
  };
}

function initialGenerationProgress(): GenerationProgress {
  return progressFromPercent(6);
}

function advanceGenerationProgress(
  current: GenerationProgress | null,
  ceiling: number,
): GenerationProgress {
  const base = current ?? initialGenerationProgress();
  return progressFromPercent(
    Math.min(ceiling, base.percent + PROGRESS_PERCENT_PER_TICK),
  );
}

type JdDraft = {
  id: string;
  text: string;
  /** Hiring company detected from JD text (for Result labels). */
  postingCompany: string;
};

type GenerationJob = {
  id: string;
  draftId: string;
  title: string;
  role: string;
  company?: string;
  status: "running" | "finishing" | "done" | "error";
  progress: GenerationProgress | null;
  pdfReady: PdfReadyState;
  pendingResume: FinalResumeData | null;
  resume: FinalResumeData | null;
  error: string;
  autoDownloadError?: string | undefined;
};

type PdfReadyState = {
  percent: number;
  phase: "generating" | "exporting" | "ready" | "error";
  label: string;
};

function initialPdfReadyState(): PdfReadyState {
  return {
    percent: 0,
    phase: "generating",
    label: "Waiting to export PDF…",
  };
}

function startPdfExportState(): PdfReadyState {
  return {
    percent: 6,
    phase: "exporting",
    label: "Building PDF layout…",
  };
}

function advancePdfExportState(current: PdfReadyState): PdfReadyState {
  if (current.phase !== "exporting") return current;
  const nextPercent = Math.min(
    92,
    current.percent + PDF_EXPORT_PERCENT_PER_TICK,
  );
  return {
    percent: nextPercent,
    phase: "exporting",
    label:
      nextPercent < 40
        ? "Building PDF layout…"
        : nextPercent < 70
          ? "Rendering PDF pages…"
          : "Finalizing PDF…",
  };
}


function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createJdDraft(text = "", id?: string): JdDraft {
  return {
    id: id ?? createId("JD"),
    text,
    postingCompany: detectCompanyNameFromJd(text) ?? "",
  };
}

function resolveJdLabels(draft: JdDraft, fallbackIndex: number) {
  const detected = formatJdResultHeadline(draft.text, fallbackIndex);
  const company = draft.postingCompany.trim() || detected.company || "Target Company";
  const headline = `${detected.role} | ${company}`;
  return {
    role: detected.role,
    company,
    headline,
  };
}

function newCareerEntry(index: number): CareerEntry {
  return {
    experienceId: `EXP-${String(index + 1).padStart(3, "0")}`,
    companyName: "",
    startDate: "",
    endDate: "",
  };
}

function newEducationEntry(index: number): UserProfile["education"][number] {
  return {
    educationId: `EDU-${String(index + 1).padStart(3, "0")}`,
    institution: "",
    degree: "",
    field: "",
    startDate: "",
    endDate: "",
  };
}

function atsScoreClass(score: number): string {
  if (score >= 90) return "high";
  if (score >= 75) return "mid";
  return "low";
}

export default function ResumeGenerator({
  user,
  onLogout,
}: {
  user: { username: string; displayName: string; role: "admin" | "user" };
  onLogout: () => void | Promise<void>;
}) {
  const [jdDrafts, setJdDrafts] = useState<JdDraft[]>([
    createJdDraft("", "JD-001"),
  ]);
  const [profile, setProfile] = useState<UserProfile>(() => createEmptyProfile());
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null);
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileSaveError, setProfileSaveError] = useState("");
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const launchingDraftIdsRef = useRef<Set<string>>(new Set());
  const autoDownloadedJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setProfileHydrated(false);
      setProfileSaveError("");
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = (await response.json()) as {
          profile?: UserProfile;
          savedAt?: string | null;
          error?: { message?: string };
        };
        if (!response.ok || !payload.profile) {
          throw new Error(payload.error?.message ?? "Could not load profile.");
        }
        if (cancelled) return;
        setProfile(payload.profile);
        setProfileSavedAt(payload.savedAt ?? null);
        setProfileSaveMessage(
          payload.savedAt ? "Saved profile loaded" : "",
        );
      } catch (caught) {
        if (cancelled) return;
        setProfile(createEmptyProfile());
        setProfileSavedAt(null);
        setProfileSaveMessage("");
        setProfileSaveError(
          caught instanceof Error ? caught.message : "Could not load profile.",
        );
      } finally {
        if (!cancelled) setProfileHydrated(true);
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user.username]);

  async function runAutoDownload(
    jobId: string,
    resume: FinalResumeData,
    profileFullName: string,
  ): Promise<void> {
    if (autoDownloadedJobIdsRef.current.has(jobId)) return;
    autoDownloadedJobIdsRef.current.add(jobId);
    setJobs((current) =>
      current.map((item) =>
        item.id === jobId
          ? {
              ...item,
              pdfReady: startPdfExportState(),
            }
          : item,
      ),
    );
    try {
      await autoDeliverGeneratedResume(resume, profileFullName);
      setJobs((current) =>
        current.map((item) => {
          if (item.id !== jobId) return item;
          const { autoDownloadError: _removed, ...rest } = item;
          return {
            ...rest,
            pdfReady: {
              percent: 100,
              phase: "ready",
              label: "PDF ready",
            },
          };
        }),
      );
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Automatic resume download failed.";
      console.error(message);
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId
            ? {
                ...item,
                autoDownloadError: message,
                pdfReady: {
                  percent: item.pdfReady.percent,
                  phase: "error",
                  label: "PDF export failed",
                },
              }
            : item,
        ),
      );
      autoDownloadedJobIdsRef.current.delete(jobId);
      throw caught instanceof Error ? caught : new Error(message);
    }
  }

  const readyJdCount = useMemo(
    () => jdDrafts.filter((draft) => draft.text.trim().length >= 50).length,
    [jdDrafts],
  );
  const inFlightDraftIds = useMemo(
    () =>
      new Set(
        jobs
          .filter(
            (job) => job.status === "running" || job.status === "finishing",
          )
          .map((job) => job.draftId),
      ),
    [jobs],
  );
  const hasActiveJobs = inFlightDraftIds.size > 0;
  const hasPdfExportingJobs = useMemo(
    () =>
      jobs.some(
        (job) =>
          job.status === "done" && job.pdfReady.phase === "exporting",
      ),
    [jobs],
  );
  const activeJobCount = useMemo(
    () =>
      jobs.filter(
        (job) => job.status === "running" || job.status === "finishing",
      ).length,
    [jobs],
  );

  useEffect(() => {
    if (!hasActiveJobs) return;

    const timer = window.setInterval(() => {
      setJobs((current) =>
        current.map((job) => {
          if (job.status === "running") {
            return {
              ...job,
              progress: advanceGenerationProgress(
                job.progress,
                PROGRESS_HOLD_PERCENT,
              ),
            };
          }
          if (job.status === "finishing") {
            const nextProgress = advanceGenerationProgress(job.progress, 100);
            if (nextProgress.percent >= 100 && job.pendingResume) {
              const role = resolveRoleFromResume(
                job.pendingResume,
                job.role,
              );
              const company = job.company || "Target Company";
              return {
                ...job,
                status: "done" as const,
                progress: null,
                resume: job.pendingResume,
                pendingResume: null,
                role,
                title: formatResultHeadline(role, company),
                // Keep PDF export state if auto-download already started
                // from the Generate click handler.
                pdfReady:
                  job.pdfReady.phase === "ready" ||
                  job.pdfReady.phase === "error" ||
                  job.pdfReady.phase === "exporting"
                    ? job.pdfReady
                    : startPdfExportState(),
              };
            }
            return { ...job, progress: nextProgress };
          }
          return job;
        }),
      );
    }, PROGRESS_TICK_MS);

    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  useEffect(() => {
    if (!hasPdfExportingJobs) return;

    const timer = window.setInterval(() => {
      setJobs((current) =>
        current.map((job) => {
          if (job.status !== "done" || job.pdfReady.phase !== "exporting") {
            return job;
          }
          return {
            ...job,
            pdfReady: advancePdfExportState(job.pdfReady),
          };
        }),
      );
    }, PDF_EXPORT_TICK_MS);

    return () => window.clearInterval(timer);
  }, [hasPdfExportingJobs]);

  const profileReady = useMemo(() => {
    const personal = profile.personalInformation;
    return (
      profile.profileId.trim().length > 0 &&
      personal.fullName.trim().length > 0 &&
      personal.email.trim().length > 0 &&
      personal.phone.trim().length > 0 &&
      personal.location.trim().length > 0 &&
      profile.careerHistory.length > 0 &&
      profile.careerHistory.every(
        (entry) =>
          entry.companyName.trim() &&
          entry.startDate.trim() &&
          entry.endDate.trim(),
      ) &&
      profile.education.length > 0 &&
      profile.education.every(
        (entry) =>
          entry.institution.trim() &&
          entry.degree.trim() &&
          entry.field.trim() &&
          entry.startDate.trim() &&
          entry.endDate.trim(),
      )
    );
  }, [profile]);

  const canGenerate = profileReady && readyJdCount > 0;

  function markProfileEdited() {
    setProfileSaveError("");
    if (profileSaveMessage === "Profile saved" || profileSaveMessage === "Saved profile loaded") {
      setProfileSaveMessage(profileSavedAt ? "Unsaved changes" : "");
    }
  }

  async function saveProfile() {
    setProfileSaveError("");
    try {
      if (!profile.personalInformation.fullName.trim()) {
        throw new Error("Enter your full name before saving the profile.");
      }
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const payload = (await response.json()) as {
        profile?: UserProfile;
        savedAt?: string;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error?.message ?? "Could not save profile.");
      }
      setProfile(payload.profile);
      setProfileSavedAt(payload.savedAt ?? null);
      setProfileSaveMessage("Profile saved");
    } catch (caught) {
      setProfileSaveError(
        caught instanceof Error ? caught.message : "Could not save profile.",
      );
    }
  }

  function updatePersonal(
    field: keyof UserProfile["personalInformation"],
    value: string,
  ) {
    markProfileEdited();
    setProfile((current) => {
      const personalInformation = { ...current.personalInformation };
      if (field === "linkedin" || field === "portfolio") {
        if (value) personalInformation[field] = value;
        else delete personalInformation[field];
      } else {
        personalInformation[field] = value;
      }
      return { ...current, personalInformation };
    });
  }

  function updateCareer(index: number, field: keyof CareerEntry, value: string) {
    markProfileEdited();
    setProfile((current) => ({
      ...current,
      careerHistory: current.careerHistory.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function addCareer() {
    markProfileEdited();
    setProfile((current) => ({
      ...current,
      careerHistory: [
        ...current.careerHistory,
        newCareerEntry(current.careerHistory.length),
      ],
    }));
  }

  function removeCareer(index: number) {
    markProfileEdited();
    setProfile((current) => ({
      ...current,
      careerHistory: current.careerHistory
        .filter((_, entryIndex) => entryIndex !== index)
        .map((entry, entryIndex) => ({
          ...entry,
          experienceId: `EXP-${String(entryIndex + 1).padStart(3, "0")}`,
        })),
    }));
  }

  function updateEducation(
    index: number,
    field: keyof UserProfile["education"][number],
    value: string,
  ) {
    markProfileEdited();
    setProfile((current) => ({
      ...current,
      education: current.education.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function addEducation() {
    markProfileEdited();
    setProfile((current) => ({
      ...current,
      education: [...current.education, newEducationEntry(current.education.length)],
    }));
  }

  function removeEducation(index: number) {
    markProfileEdited();
    setProfile((current) => ({
      ...current,
      education: current.education
        .filter((_, entryIndex) => entryIndex !== index)
        .map((entry, entryIndex) => ({
          ...entry,
          educationId: `EDU-${String(entryIndex + 1).padStart(3, "0")}`,
        })),
    }));
  }

  function updateJdDraft(id: string, text: string) {
    setJdDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) return draft;
        return {
          ...draft,
          text,
          postingCompany: detectCompanyNameFromJd(text) ?? "",
        };
      }),
    );
  }

  function closeJob(jobId: string) {
    autoDownloadedJobIdsRef.current.delete(jobId);
    setJobs((current) => current.filter((job) => job.id !== jobId));
  }

  async function generate(draftIds?: readonly string[]) {
    const readyDrafts = jdDrafts
      .map((draft, index) => ({ draft, index }))
      .filter(({ draft }) => {
        if (draft.text.trim().length < 50) return false;
        if (draftIds && !draftIds.includes(draft.id)) return false;
        // Only block a same-tick double click; never block because another job
        // is already running — users can start more processes in parallel.
        if (launchingDraftIdsRef.current.has(draft.id)) return false;
        return true;
      });
    if (!profileReady || readyDrafts.length === 0) return;

    for (const { draft } of readyDrafts) {
      launchingDraftIdsRef.current.add(draft.id);
    }

    const nextJobs: GenerationJob[] = readyDrafts.map(({ draft, index }) => {
      const labels = resolveJdLabels(draft, index + 1);
      return {
        id: createId("JOB"),
        draftId: draft.id,
        title: labels.headline,
        role: labels.role,
        company: labels.company,
        status: "running" as const,
        progress: initialGenerationProgress(),
        pdfReady: initialPdfReadyState(),
        pendingResume: null,
        resume: null,
        error: "",
      };
    });
    // Keep in-progress and completed jobs; append the new parallel batch.
    setJobs((current) => [...current, ...nextJobs]);

    // Release immediately so Generate stays usable while fetches are in flight.
    queueMicrotask(() => {
      for (const { draft } of readyDrafts) {
        launchingDraftIdsRef.current.delete(draft.id);
      }
    });

    await Promise.all(
      nextJobs.map(async (job) => {
        const draft = readyDrafts.find((item) => item.draft.id === job.draftId)?.draft;
        if (!draft) return;
        try {
          const response = await fetch("/api/resume/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobDescriptionText: draft.text,
              profile,
              locale: "en-US",
            }),
          });
          const payload = (await response.json()) as
            | FinalResumeData
            | { error?: { message?: string } };
          if (!response.ok || !("document" in payload)) {
            throw new Error(
              "error" in payload
                ? payload.error?.message ?? "Resume generation failed."
                : "Resume generation failed.",
            );
          }
          // Resume is ready — immediately export + auto-download
          // <profile-full-name>.pdf (no second click).
          setJobs((current) =>
            current.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "finishing",
                    pendingResume: payload,
                    pdfReady: startPdfExportState(),
                  }
                : item,
            ),
          );
          try {
            await runAutoDownload(
              job.id,
              payload,
              profile.personalInformation.fullName,
            );
          } catch {
            // Error state already recorded on the job.
          }
        } catch (caught) {
          setJobs((current) =>
            current.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "error",
                    progress: null,
                    pendingResume: null,
                    resume: null,
                    error:
                      caught instanceof Error
                        ? caught.message
                        : "Resume generation failed.",
                  }
                : item,
            ),
          );
        }
      }),
    );
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <p className="brand">Resume Tailor</p>
          <div className="topbar-user">
            <div className="topbar-user-copy">
              <p className="header-username">
                {profile.personalInformation.fullName.trim() || user.displayName}
              </p>
              <p className="header-account">@{user.username}</p>
            </div>
            {user.role === "admin" ? (
              <a href="/admin" className="secondary-action topbar-logout">
                Database
              </a>
            ) : null}
            <button
              type="button"
              className="secondary-action topbar-logout"
              onClick={() => void onLogout()}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="profile-card">
          <div className="section-head">
            <div>
              <h2>User Profile</h2>
              <p className="hint">
                Save your profile to the server — it reloads when you sign in,
                and Generate uses it for every resume.
              </p>
            </div>
            {profileHydrated && profileSaveMessage ? (
              <p
                className={`profile-save-status${
                  profileSaveMessage === "Unsaved changes" ? " is-dirty" : ""
                }`}
              >
                {profileSaveMessage}
                {profileSavedAt && profileSaveMessage !== "Unsaved changes"
                  ? ` · ${new Date(profileSavedAt).toLocaleString()}`
                  : ""}
              </p>
            ) : null}
          </div>

          <div className="profile-grid">
            <label className="profile-field">
              <span>Full Name</span>
              <input
                type="text"
                name="fullName"
                placeholder={FIELD_PLACEHOLDERS.fullName}
                value={profile.personalInformation.fullName}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updatePersonal("fullName", event.target.value)
                }
              />
            </label>

            <label className="profile-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                placeholder={FIELD_PLACEHOLDERS.email}
                value={profile.personalInformation.email}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updatePersonal("email", event.target.value)
                }
              />
            </label>

            <label className="profile-field">
              <span>Phone</span>
              <input
                type="tel"
                name="phone"
                placeholder={FIELD_PLACEHOLDERS.phone}
                value={profile.personalInformation.phone}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updatePersonal("phone", event.target.value)
                }
              />
            </label>

            <label className="profile-field">
              <span>Location</span>
              <input
                type="text"
                name="location"
                placeholder={FIELD_PLACEHOLDERS.location}
                value={profile.personalInformation.location}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updatePersonal("location", event.target.value)
                }
              />
            </label>

            <label className="profile-field">
              <span>LinkedIn</span>
              <input
                type="url"
                name="linkedin"
                placeholder={FIELD_PLACEHOLDERS.linkedin}
                value={profile.personalInformation.linkedin ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updatePersonal("linkedin", event.target.value)
                }
              />
            </label>

            <label className="profile-field">
              <span>Portfolio</span>
              <input
                type="url"
                name="portfolio"
                placeholder={FIELD_PLACEHOLDERS.portfolio}
                value={profile.personalInformation.portfolio ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updatePersonal("portfolio", event.target.value)
                }
              />
            </label>
          </div>
        </section>

        <section className="profile-card">
          <div className="section-head">
            <div>
              <h2>Career History</h2>
              <p className="hint">
                Add company and dates for each position. Use dates like Aug 2018.
                Role titles are assigned from the JD during generation.
              </p>
            </div>
          </div>

          {profile.careerHistory.map((entry, index) => (
            <div key={entry.experienceId} className="entry-block">
              <div className="entry-head">
                <p className="entry-label">Experience {index + 1}</p>
                <button
                  type="button"
                  className="secondary-action entry-remove"
                  disabled={profile.careerHistory.length === 1}
                  onClick={() => removeCareer(index)}
                >
                  Remove
                </button>
              </div>
              <div className="profile-grid">
                <label className="profile-field">
                  <span>Company</span>
                  <input
                    type="text"
                    name={`company-${entry.experienceId}`}
                    placeholder={FIELD_PLACEHOLDERS.company}
                    value={entry.companyName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCareer(index, "companyName", event.target.value)
                    }
                  />
                </label>

                <div className="profile-field">
                  <span>Period</span>
                  <PeriodDateControl
                    startValue={entry.startDate}
                    endValue={entry.endDate}
                    allowPresentEnd
                    startPlaceholder={FIELD_PLACEHOLDERS.periodStart}
                    endPlaceholder={FIELD_PLACEHOLDERS.periodEndPresent}
                    onStartChange={(value) => updateCareer(index, "startDate", value)}
                    onEndChange={(value) => updateCareer(index, "endDate", value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="section-actions section-actions-end">
            <button type="button" className="secondary-action" onClick={addCareer}>
              Add Experience
            </button>
          </div>
        </section>

        <section className="profile-card">
          <div className="section-head">
            <div>
              <h2>Education</h2>
              <p className="hint">
                Required. Add school, degree, field, and the study period (e.g. Aug
                2018).
              </p>
            </div>
          </div>

          {profile.education.map((entry, index) => (
            <div key={entry.educationId} className="entry-block">
              <div className="entry-head">
                <p className="entry-label">Education {index + 1}</p>
                <button
                  type="button"
                  className="secondary-action entry-remove"
                  disabled={profile.education.length === 1}
                  onClick={() => removeEducation(index)}
                >
                  Remove
                </button>
              </div>
              <div className="profile-grid">
                <label className="profile-field">
                  <span>School</span>
                  <input
                    type="text"
                    name={`school-${entry.educationId}`}
                    placeholder={FIELD_PLACEHOLDERS.school}
                    value={entry.institution}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateEducation(index, "institution", event.target.value)
                    }
                  />
                </label>

                <label className="profile-field">
                  <span>Degree</span>
                  <input
                    type="text"
                    name={`degree-${entry.educationId}`}
                    placeholder={FIELD_PLACEHOLDERS.degree}
                    value={entry.degree}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateEducation(index, "degree", event.target.value)
                    }
                  />
                </label>

                <label className="profile-field">
                  <span>Field of Study</span>
                  <input
                    type="text"
                    name={`fieldOfStudy-${entry.educationId}`}
                    placeholder={FIELD_PLACEHOLDERS.fieldOfStudy}
                    value={entry.field}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateEducation(index, "field", event.target.value)
                    }
                  />
                </label>

                <div className="profile-field">
                  <span>Period</span>
                  <PeriodDateControl
                    startValue={entry.startDate}
                    endValue={entry.endDate}
                    startPlaceholder={FIELD_PLACEHOLDERS.periodStart}
                    endPlaceholder={FIELD_PLACEHOLDERS.periodEnd}
                    onStartChange={(value) =>
                      updateEducation(index, "startDate", value)
                    }
                    onEndChange={(value) => updateEducation(index, "endDate", value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="section-actions section-actions-end">
            <button type="button" className="secondary-action" onClick={addEducation}>
              Add Education
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void saveProfile()}
              disabled={!profile.personalInformation.fullName.trim()}
            >
              Save Profile
            </button>
          </div>
          {profileSaveError ? <p className="error">{profileSaveError}</p> : null}
        </section>

        <section className="composer">
          <div className="section-head">
            <div>
              <h2>Job Description</h2>
              <p className="hint">Paste a JD, then generate the resume.</p>
            </div>
          </div>

          {jdDrafts.map((draft) => (
            <div key={draft.id} className="entry-block jd-card">
              <label className="profile-field profile-field-full">
                <span className="sr-only">Job description</span>
                <textarea
                  name={`jobDescription-${draft.id}`}
                  value={draft.text}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    updateJdDraft(draft.id, event.target.value)
                  }
                  placeholder={FIELD_PLACEHOLDERS.jobDescription}
                />
              </label>
            </div>
          ))}

          <div className="composer-footer">
            <button
              type="button"
              className="primary"
              disabled={!canGenerate}
              onClick={() => generate()}
            >
              Generate
            </button>
            <p className="inline-status">
              {hasActiveJobs
                ? `${activeJobCount} running. You can generate again when ready.`
                : "Ready when profile, career history, education, and JD are filled in."}
            </p>
          </div>
        </section>

        <section className="board" aria-live="polite">
          <div className="section-head">
            <div>
              <h2>Result</h2>
              {jobs.length > 0 ? (
                <p className="hint">
                  {jobs.filter((job) => job.status === "done").length}/{jobs.length}{" "}
                  complete
                </p>
              ) : null}
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-board">
              <p>No resumes yet. Paste a JD and generate to see results here.</p>
              <ol>
                <li>Confirm profile, career history, and education</li>
                <li>Paste the target job description</li>
                <li>Generate — finished resumes appear here</li>
              </ol>
            </div>
          ) : (
            <div className="job-board">
              {jobs.map((job, index) => {
                if (job.status === "done" && job.resume) {
                  return (
                    <ResumePreview
                      key={job.id}
                      resume={job.resume}
                      index={index + 1}
                      title={job.title}
                      pdfReady={job.pdfReady}
                      autoDownloadError={job.autoDownloadError}
                      onClose={() => closeJob(job.id)}
                    />
                  );
                }
                if (
                  (job.status === "running" || job.status === "finishing") &&
                  job.progress
                ) {
                  return (
                    <div key={job.id} className="job-row status-run">
                      <div className="job-list-main">
                        <div className="job-list-head job-list-head--compact">
                          <div className="job-index">{index + 1}</div>
                          <div className="job-list-copy">
                            <div className="job-status-row">
                              <span className="badge">Generating</span>
                            </div>
                            <strong className="job-headline">{job.title}</strong>
                          </div>
                          <JobCloseButton
                            label={`Close result for ${job.title}`}
                            onClick={() => closeJob(job.id)}
                          />
                        </div>
                        <GenerationProgressPanel progress={job.progress} />
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={job.id} className="job-row status-error">
                    <div className="job-list-main">
                      <div className="job-list-head job-list-head--compact">
                        <div className="job-index">{index + 1}</div>
                        <div className="job-list-copy">
                          <div className="job-status-row">
                            <span className="badge badge-error">Failed</span>
                          </div>
                          <strong className="job-headline">{job.title}</strong>
                          <p className="error" style={{ marginTop: "0.65rem" }}>
                            {job.error || "Resume generation failed."}
                          </p>
                        </div>
                        <JobCloseButton
                          label={`Close result for ${job.title}`}
                          onClick={() => closeJob(job.id)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function JobCloseButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="job-close"
      aria-label={label}
      title="Close"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M3.4 3.4a.9.9 0 0 1 1.27 0L8 6.73l3.33-3.33a.9.9 0 1 1 1.27 1.27L9.27 8l3.33 3.33a.9.9 0 1 1-1.27 1.27L8 9.27l-3.33 3.33a.9.9 0 1 1-1.27-1.27L6.73 8 3.4 4.67a.9.9 0 0 1 0-1.27Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}

function RoundPdfProgress({
  pdfReady,
  size = 72,
}: {
  pdfReady: PdfReadyState;
  size?: number;
}) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pdfReady.percent)) / 100);
  const tone =
    pdfReady.phase === "ready"
      ? "ready"
      : pdfReady.phase === "error"
        ? "error"
        : "active";

  return (
    <div
      className={`round-pdf-progress tone-${tone}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pdfReady.percent}
      aria-label={pdfReady.label}
      title={pdfReady.label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          className="round-pdf-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="round-pdf-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="round-pdf-center">
        <strong>{pdfReady.percent}%</strong>
        <span>{pdfReady.phase === "ready" ? "Ready" : "PDF"}</span>
      </div>
    </div>
  );
}

function GenerationProgressPanel({ progress }: { progress: GenerationProgress }) {
  return (
    <div className="generation-progress" aria-live="polite">
      <div className="generation-progress-head">
        <strong>{progress.label}</strong>
        <span>{progress.percent}%</span>
      </div>
      <div
        className="generation-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={progress.label}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <ol className="generation-progress-steps">
        {GENERATION_STEPS.map((step, index) => {
          const state =
            index < progress.stepIndex
              ? "done"
              : index === progress.stepIndex
                ? "active"
                : "pending";
          return (
            <li key={step.id} data-state={state}>
              <span className="generation-progress-marker" aria-hidden />
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResumePreview({
  resume,
  index,
  title,
  pdfReady,
  autoDownloadError,
  onClose,
}: {
  resume: FinalResumeData;
  index: number;
  title: string;
  pdfReady: PdfReadyState;
  autoDownloadError?: string | undefined;
  onClose: () => void;
}) {
  const template = resume.template.template;
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | "txt" | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportSavedAs, setExportSavedAs] = useState("");
  const [externalOverallScore, setExternalOverallScore] = useState("");
  const [externalRelevancyScore, setExternalRelevancyScore] = useState("");
  const [feedbackCategory, setFeedbackCategory] =
    useState<ExternalResumeFeedbackCategory>("impact");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [calibrationRecord, setCalibrationRecord] =
    useState<ExternalResumeTestRecord | null>(null);
  const [calibrationError, setCalibrationError] = useState("");
  const [calibrating, setCalibrating] = useState(false);

  async function exportResume(format: "docx" | "pdf" | "txt") {
    setExporting(format);
    setExportError("");
    setExportSavedAs("");
    try {
      const saved = await deliverGeneratedResume(resume, format);
      setExportSavedAs(saved.filename);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Resume export failed.");
    } finally {
      setExporting(null);
    }
  }

  async function submitCalibration() {
    setCalibrationError("");
    setCalibrationRecord(null);
    const overallScore = Number(externalOverallScore);
    const relevancyScore = externalRelevancyScore.trim()
      ? Number(externalRelevancyScore)
      : undefined;
    if (!Number.isFinite(overallScore) || overallScore < 0 || overallScore > 100) {
      setCalibrationError("Enter an external overall score from 0 to 100.");
      return;
    }
    if (
      relevancyScore !== undefined &&
      (!Number.isFinite(relevancyScore) || relevancyScore < 0 || relevancyScore > 100)
    ) {
      setCalibrationError("Enter an external relevancy score from 0 to 100.");
      return;
    }
    setCalibrating(true);
    try {
      const response = await fetch("/api/resume/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume,
          overallScore,
          ...(relevancyScore !== undefined ? { relevancyScore } : {}),
          feedback: feedbackMessage.trim()
            ? [{ category: feedbackCategory, message: feedbackMessage.trim() }]
            : [],
        }),
      });
      const payload = (await response.json()) as
        | ExternalResumeTestRecord
        | { error?: { message?: string } };
      if (!response.ok || !("calibrationId" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error?.message ?? "Calibration failed."
            : "Calibration failed.",
        );
      }
      setCalibrationRecord(payload);
    } catch (caught) {
      setCalibrationError(caught instanceof Error ? caught.message : "Calibration failed.");
    } finally {
      setCalibrating(false);
    }
  }

  const readinessScore = resume.readiness?.internalScore;

  return (
    <div className="job-row status-done">
      <div className="job-list-main">
        <div className="job-list-head job-list-head--compact">
          <div className="job-index">{index}</div>
          <div className="job-list-copy">
            <div className="job-status-row">
              <span className="badge badge-done">
                {resume.assemblyValidation.overallStatus}
              </span>
              {typeof readinessScore === "number" ? (
                <span className={`ats-score ${atsScoreClass(readinessScore)}`}>
                  ATS {readinessScore}
                </span>
              ) : null}
            </div>
            <strong className="job-headline">{title}</strong>
          </div>
          <JobCloseButton
            label={`Close result for ${title}`}
            onClick={onClose}
          />
        </div>
        <div className="pdf-ready-panel" aria-live="polite">
          <RoundPdfProgress pdfReady={pdfReady} size={88} />
          <div className="pdf-ready-panel__copy">
            <strong>
              {pdfReady.phase === "ready"
                ? "PDF ready"
                : pdfReady.phase === "error"
                  ? "PDF export failed"
                  : pdfReady.phase === "exporting"
                    ? "Preparing PDF"
                    : "PDF queued"}
            </strong>
            <p className="pdf-ready-status">
              {pdfReady.phase === "ready"
                ? `Downloaded ${resumeFilenameFromFullName(
                    resume.profile.personalInformation.fullName,
                    "pdf",
                  )}`
                : pdfReady.label}
            </p>
          </div>
        </div>

        <div className="download-row">
          <span className="download-label">Actions</span>
          <div className="download-actions">
            <button
              type="button"
              className="download-btn"
              aria-pressed={showPreview}
              onClick={() => setShowPreview((current) => !current)}
            >
              {showPreview ? "Hide preview" : "Preview"}
            </button>
            {(["docx", "pdf", "txt"] as const).map((format) => (
              <button
                key={format}
                type="button"
                className={`download-btn${format === "pdf" ? " zip" : ""}`}
                disabled={exporting !== null}
                onClick={() => exportResume(format)}
              >
                {exporting === format
                  ? `Downloading ${format.toUpperCase()}…`
                  : format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {exportSavedAs ? (
          <p className="pdf-ready-status is-ready">
            Downloaded {exportSavedAs}
          </p>
        ) : null}
        {exportError ? <p className="error">{exportError}</p> : null}
        {autoDownloadError ? (
          <p className="error">Auto-download failed: {autoDownloadError}</p>
        ) : null}

        {resume.readiness ? (
          <details className="meta-details">
            <summary>Readiness &amp; calibration</summary>
            <div className="readiness-grid">
              {resume.readiness.categories.map((category) => (
                <div key={category.categoryId} className="score-item">
                  <strong>{category.label}</strong>
                  <div>{category.score}/100</div>
                </div>
              ))}
            </div>
            {resume.readiness.issues.length > 0 ? (
              <div className="findings">
                <strong>Targeted findings</strong>
                <ul>
                  {resume.readiness.issues.slice(0, 6).map((issue) => (
                    <li key={issue.issueCode}>
                      {issue.message} <em>Owner: {issue.owner}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="disclaimer">{resume.readiness.disclaimer}</p>

            <div className="calibration">
              <strong>Record an external Resume Worded test</strong>
              <div className="profile-grid">
                <label className="profile-field">
                  <span>Overall score (0–100)</span>
                  <input
                    className="control-input"
                    inputMode="decimal"
                    placeholder={FIELD_PLACEHOLDERS.overallScore}
                    value={externalOverallScore}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setExternalOverallScore(event.target.value)
                    }
                  />
                </label>
                <label className="profile-field">
                  <span>Relevancy score (optional)</span>
                  <input
                    className="control-input"
                    inputMode="decimal"
                    placeholder={FIELD_PLACEHOLDERS.relevancyScore}
                    value={externalRelevancyScore}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setExternalRelevancyScore(event.target.value)
                    }
                  />
                </label>
                <label className="profile-field profile-field-full">
                  <span>Feedback category</span>
                  <select
                    value={feedbackCategory}
                    aria-label={FIELD_PLACEHOLDERS.feedbackCategory}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setFeedbackCategory(
                        event.target.value as ExternalResumeFeedbackCategory,
                      )
                    }
                  >
                    {[
                      "impact",
                      "brevity",
                      "style",
                      "sections",
                      "ats",
                      "keyword-relevance",
                      "leadership",
                      "growth",
                      "repetition",
                      "formatting",
                      "other",
                    ].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea
                style={{ minHeight: "5rem" }}
                placeholder={FIELD_PLACEHOLDERS.feedbackMessage}
                value={feedbackMessage}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setFeedbackMessage(event.target.value)
                }
              />
              <button
                type="button"
                className="secondary-action"
                disabled={calibrating || !externalOverallScore.trim()}
                onClick={submitCalibration}
              >
                {calibrating ? "Recording…" : "Record external test"}
              </button>
              {calibrationError ? <p className="error">{calibrationError}</p> : null}
              {calibrationRecord ? (
                <p className="calibration-note">
                  Recorded {calibrationRecord.externalOverallScore}/100 for this exact
                  resume. Internal-to-external delta:{" "}
                  {calibrationRecord.overallScoreDelta >= 0 ? "+" : ""}
                  {calibrationRecord.overallScoreDelta}.
                </p>
              ) : null}
            </div>
          </details>
        ) : null}

        {showPreview ? (
          <div
            className="resume-sheet"
            style={{
              maxWidth: template.pageSize === "a4" ? 794 : 816,
              fontFamily: template.typography.fontFamily,
              fontSize: template.typography.bodySizePt,
              lineHeight: template.typography.bodyLineHeight,
            }}
          >
            {resume.document.sections.map((section) => {
              if (section.id === "contact") {
                const contact = section.content;
                return (
                  <header key={section.id} style={{ textAlign: template.alignment.contact }}>
                    <h1 style={{ fontSize: template.typography.nameSizePt + 4 }}>
                      {contact.fullName}
                    </h1>
                    <div className="contact-line">
                      {[
                        contact.email,
                        contact.phone,
                        contact.location,
                        contact.linkedin,
                        contact.portfolio,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </div>
                  </header>
                );
              }
              return (
                <section key={section.id} className="resume-section">
                  <h2 style={{ fontSize: template.typography.sectionHeadingSizePt }}>
                    {section.heading}
                  </h2>
                  {section.id === "professional-summary" ? <p>{section.content}</p> : null}
                  {section.id === "skills" ? (
                    <div className="skills-list">
                      {section.content.map((category) => (
                        <div key={category.name}>
                          <strong>{category.name}:</strong> {category.skills.join(", ")}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {section.id === "professional-experience"
                    ? section.content.map((entry) => (
                        <article key={entry.experienceId} className="role-block">
                          <div className="role-head">
                            <strong>
                              {entry.assignedRole} | {entry.companyName}
                            </strong>
                            <span>
                              {entry.startDate} – {entry.endDate}
                            </span>
                          </div>
                          <ul className="bullet-list">
                            {entry.bullets.map((bullet, index) => (
                              <li key={`${entry.experienceId}-${index}`}>{bullet}</li>
                            ))}
                          </ul>
                        </article>
                      ))
                    : null}
                  {section.id === "education"
                    ? section.content.map((entry) => {
                        const period = [entry.startDate, entry.endDate]
                          .map((value) => value?.trim() ?? "")
                          .filter(Boolean)
                          .join(" - ");
                        return (
                          <div key={entry.educationId} className="edu-line">
                            <strong>
                              {entry.degree} in {entry.field} | {entry.institution}
                            </strong>
                            {period ? <span className="edu-dates">{period}</span> : null}
                          </div>
                        );
                      })
                    : null}
                </section>
              );
            })}
          </div>
        ) : (
          <p className="inline-status">
            Paper preview is hidden. Use Preview when you want to review the resume.
          </p>
        )}
      </div>
    </div>
  );
}
