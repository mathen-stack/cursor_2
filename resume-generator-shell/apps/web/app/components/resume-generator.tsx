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
} from "../lib/detect-company-from-jd";

const SAMPLE_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

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
  /** Hiring company that posted this JD (auto-detected when possible). */
  postingCompany: string;
  /** True once the user edits the posting-company field manually. */
  companyTouched: boolean;
};

type GenerationJob = {
  id: string;
  draftId: string;
  title: string;
  role: string;
  company?: string;
  status: "running" | "finishing" | "done" | "error";
  progress: GenerationProgress | null;
  pendingResume: FinalResumeData | null;
  resume: FinalResumeData | null;
  error: string;
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createJdDraft(text = "", id?: string): JdDraft {
  return {
    id: id ?? createId("JD"),
    text,
    postingCompany: detectCompanyNameFromJd(text) ?? "",
    companyTouched: false,
  };
}

function resolveJdLabels(draft: JdDraft, fallbackIndex: number) {
  const detected = formatJdResultHeadline(draft.text, fallbackIndex);
  const company = draft.postingCompany.trim() || detected.company || "undefined";
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
    endDate: index === 0 ? "Present" : "",
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

function formatEducationPeriod(entry: {
  startDate?: string;
  endDate?: string;
}): string {
  const start = entry.startDate?.trim() ?? "";
  const end = entry.endDate?.trim() ?? "";
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

function atsScoreClass(score: number): string {
  if (score >= 90) return "high";
  if (score >= 75) return "mid";
  return "low";
}

export default function ResumeGenerator() {
  const [jdDrafts, setJdDrafts] = useState<JdDraft[]>([
    createJdDraft(SAMPLE_JD, "JD-001"),
  ]);
  const [profile, setProfile] = useState<UserProfile>({
    profileId: "PROFILE-DEMO",
    personalInformation: {
      fullName: "Alex Morgan",
      email: "alex@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      linkedin: "https://www.linkedin.com/in/alex-morgan",
    },
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: "Example AI Company",
        startDate: "Jan 2022",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Example Software Company",
        startDate: "Mar 2018",
        endDate: "Dec 2021",
      },
    ],
    education: [
      {
        educationId: "EDU-001",
        institution: "Example University",
        degree: "Bachelor of Science",
        field: "Computer Science",
        startDate: "Sep 2014",
        endDate: "Jun 2018",
      },
    ],
  });
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const launchingDraftIdsRef = useRef<Set<string>>(new Set());

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
              return {
                ...job,
                status: "done" as const,
                progress: null,
                resume: job.pendingResume,
                pendingResume: null,
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

  function updatePersonal(
    field: keyof UserProfile["personalInformation"],
    value: string,
  ) {
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
    setProfile((current) => ({
      ...current,
      careerHistory: current.careerHistory.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function addCareer() {
    setProfile((current) => ({
      ...current,
      careerHistory: [
        ...current.careerHistory,
        newCareerEntry(current.careerHistory.length),
      ],
    }));
  }

  function removeCareer(index: number) {
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
    setProfile((current) => ({
      ...current,
      education: current.education.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function addEducation() {
    setProfile((current) => ({
      ...current,
      education: [...current.education, newEducationEntry(current.education.length)],
    }));
  }

  function removeEducation(index: number) {
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
        const detected = detectCompanyNameFromJd(text) ?? "";
        return {
          ...draft,
          text,
          postingCompany: draft.companyTouched ? draft.postingCompany : detected,
        };
      }),
    );
  }

  function updateJdPostingCompany(id: string, postingCompany: string) {
    setJdDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? { ...draft, postingCompany, companyTouched: true }
          : draft,
      ),
    );
  }

  function addJdDraft() {
    setJdDrafts((current) => [...current, createJdDraft("")]);
  }

  function removeJdDraft(id: string) {
    setJdDrafts((current) =>
      current.length <= 1 ? current : current.filter((draft) => draft.id !== id),
    );
  }

  function closeJob(jobId: string) {
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
          setJobs((current) =>
            current.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "finishing",
                    pendingResume: payload,
                  }
                : item,
            ),
          );
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
          <p className="header-username">{profile.personalInformation.fullName}</p>
        </div>
      </header>

      <main className="main">
        <section className="profile-card">
          <div className="section-head">
            <div>
              <h2>User Profile</h2>
            </div>
          </div>

          <div className="profile-grid">
            <label className="profile-field">
              <span>Full Name</span>
              <input
                type="text"
                name="fullName"
                placeholder="Enter your full name"
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
                placeholder="name@example.com"
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
                placeholder="+1 555 123 4567"
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
                placeholder="City, State or Country"
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
                placeholder="https://linkedin.com/in/username"
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
                placeholder="https://yourportfolio.com"
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
                    placeholder="Company name"
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
                    placeholder="University or school name"
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
                    placeholder="Bachelor's degree"
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
                    placeholder="Computer Science"
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
          </div>
        </section>

        <section className="composer">
          <div className="section-head">
            <div>
              <h2>Job Description</h2>
              <p className="hint">
                Add JDs anytime. Result cards show Role | Company. If the posting company
                is unknown, they show Role | undefined. Career history companies still
                come from your profile.
              </p>
            </div>
          </div>

          {jdDrafts.map((draft, index) => {
            const draftReady = draft.text.trim().length >= 50;
            const draftCanGenerate = profileReady && draftReady;
            const labels = resolveJdLabels(draft, index + 1);
            return (
              <div key={draft.id} className="entry-block">
                <div className="entry-head">
                  <p className="entry-label">
                    JD {index + 1}
                    <span className="badge badge-company" style={{ marginLeft: "0.45rem" }}>
                      {labels.headline}
                    </span>
                    {inFlightDraftIds.has(draft.id) ? (
                      <span className="badge" style={{ marginLeft: "0.45rem" }}>
                        Generating
                      </span>
                    ) : null}
                  </p>
                  <div className="entry-head-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={!draftCanGenerate}
                      onClick={() => generate([draft.id])}
                    >
                      Generate
                    </button>
                    <button
                      type="button"
                      className="secondary-action entry-remove"
                      disabled={jdDrafts.length === 1}
                      onClick={() => removeJdDraft(draft.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="profile-grid">
                  <label className="profile-field">
                    <span>Company that posted this JD</span>
                    <input
                      type="text"
                      name={`posting-company-${draft.id}`}
                      placeholder="Optional if not detected from JD"
                      value={draft.postingCompany}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateJdPostingCompany(draft.id, event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="profile-field profile-field-full">
                  <span className="manual-jd-label">JD text</span>
                  <textarea
                    name={`jobDescription-${draft.id}`}
                    value={draft.text}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      updateJdDraft(draft.id, event.target.value)
                    }
                    placeholder="Paste the full job description here"
                  />
                </label>
              </div>
            );
          })}

          <div className="section-actions section-actions-end">
            <button type="button" className="secondary-action" onClick={addJdDraft}>
              Add JD
            </button>
          </div>

          <div className="composer-footer">
            <button
              type="button"
              className="primary"
              disabled={!canGenerate}
              onClick={() => generate()}
            >
              {hasActiveJobs
                ? readyJdCount > 1
                  ? `Generate ${readyJdCount} more resumes`
                  : "Generate another resume"
                : readyJdCount > 1
                  ? `Generate ${readyJdCount} resumes`
                  : "Generate complete resume"}
            </button>
            <p className="inline-status">
              {hasActiveJobs
                ? `${activeJobCount} running. Generate stays available — start more anytime.`
                : readyJdCount > 1
                  ? `${readyJdCount} JDs ready. Generate will run them in parallel.`
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
              <p>No resumes yet. Add JDs, then generate — you can start more while others run.</p>
              <ol>
                <li>Confirm profile, career history, and education</li>
                <li>Paste one or more target job descriptions</li>
                <li>Generate anytime; parallel jobs appear in Result as they finish</li>
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
                        <div className="job-list-head">
                          <div className="job-index">{index + 1}</div>
                          <div className="job-list-copy">
                            <div className="job-title-row">
                              <strong className="job-headline">{job.title}</strong>
                              <span className="badge">Running</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="secondary-action entry-remove job-close"
                            aria-label={`Dismiss result for ${job.title}`}
                            title="Dismiss"
                            onClick={() => closeJob(job.id)}
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </div>
                        <GenerationProgressPanel progress={job.progress} />
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={job.id} className="job-row status-error">
                    <div className="job-list-main">
                      <div className="job-list-head">
                        <div className="job-index">{index + 1}</div>
                        <div className="job-list-copy">
                          <div className="job-title-row">
                            <strong className="job-headline">{job.title}</strong>
                            <span className="badge badge-error">Failed</span>
                          </div>
                          <p className="error" style={{ marginTop: "0.65rem" }}>
                            {job.error || "Resume generation failed."}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="secondary-action entry-remove job-close"
                          aria-label={`Dismiss result for ${job.title}`}
                          title="Dismiss"
                          onClick={() => closeJob(job.id)}
                        >
                          <span aria-hidden>×</span>
                        </button>
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

function GenerationProgressPanel({
  progress,
}: {
  progress: GenerationProgress;
}) {
  return (
    <div className="generation-progress" aria-live="polite">
      <div className="generation-progress-head">
        <strong>Generating resume</strong>
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
      <p className="generation-progress-label">{progress.label}</p>
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
  onClose,
}: {
  resume: FinalResumeData;
  index: number;
  title: string;
  onClose: () => void;
}) {
  const template = resume.template.template;
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | "txt" | null>(null);
  const [exportError, setExportError] = useState("");
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
    try {
      const response = await fetch("/api/resume/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, format }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Resume export failed.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `resume.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
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
        <div className="job-list-head">
          <div className="job-index">{index}</div>
          <div className="job-list-copy">
            <div className="job-title-row">
              <strong className="job-headline">{title}</strong>
              <span className="badge badge-done">
                {resume.assemblyValidation.overallStatus}
              </span>
              {typeof readinessScore === "number" ? (
                <span className={`ats-score ${atsScoreClass(readinessScore)}`}>
                  ATS {readinessScore}
                </span>
              ) : null}
            </div>
            <p className="job-role">
              {resume.context.generationId} · {template.templateName} ·{" "}
              {resume.orchestration.totalDurationMs} ms
            </p>
          </div>
          <button
            type="button"
            className="secondary-action entry-remove job-close"
            aria-label={`Dismiss result for ${title}`}
            title="Dismiss"
            onClick={onClose}
          >
            <span aria-hidden>×</span>
          </button>
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
                  ? `Exporting ${format.toUpperCase()}…`
                  : format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {exportError ? <p className="error">{exportError}</p> : null}

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
                placeholder="Paste one feedback item from Resume Worded (optional)"
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
                    ? section.content.map((entry) => (
                        <div key={entry.educationId} className="edu-line">
                          <strong>
                            {entry.degree} in {entry.field}
                          </strong>
                          , {entry.institution}
                          {formatEducationPeriod(entry)
                            ? ` | ${formatEducationPeriod(entry)}`
                            : ""}
                        </div>
                      ))
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
