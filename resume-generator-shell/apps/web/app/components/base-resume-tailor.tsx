"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type {
  BaseResumeMatchResult,
  BaseResumeSummary,
  FinalResumeData,
} from "@resume/contracts";
import {
  downloadResumeFile,
  resumeFilenameFromFullName,
} from "../../lib/resume-download-client";

type SessionUser = {
  username: string;
  displayName: string;
  role: "admin" | "user";
};

/** UI modes: auto-find from library, or upload a resume to tailor. */
type TailorMode = "auto" | "upload";

type TailorResult = {
  id: string;
  title: string;
  resume: FinalResumeData;
  match: BaseResumeMatchResult | null;
  baseResumeTitle: string;
};

export default function BaseResumeTailor({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void | Promise<void>;
}) {
  const [baseResumes, setBaseResumes] = useState<BaseResumeSummary[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<TailorMode>("auto");
  const [uploadedForTailor, setUploadedForTailor] = useState<BaseResumeSummary | null>(
    null,
  );
  const [jobDescription, setJobDescription] = useState("");
  const [matches, setMatches] = useState<BaseResumeMatchResult[]>([]);
  const [tailoring, setTailoring] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | "txt" | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportSavedAs, setExportSavedAs] = useState("");
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const tailorUploadRef = useRef<HTMLInputElement | null>(null);

  const canTailor = useMemo(() => {
    if (jobDescription.trim().length < 50) return false;
    if (mode === "auto") return baseResumes.length > 0;
    return Boolean(uploadedForTailor);
  }, [baseResumes.length, jobDescription, mode, uploadedForTailor]);

  async function refreshBaseResumes(): Promise<BaseResumeSummary[]> {
    const response = await fetch("/api/base-resumes", { cache: "no-store" });
    const payload = (await response.json()) as {
      resumes?: BaseResumeSummary[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Could not load resumes.");
    }
    const resumes = payload.resumes ?? [];
    setBaseResumes(resumes);
    return resumes;
  }

  useEffect(() => {
    void refreshBaseResumes().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Could not load resumes.");
    });
  }, [user.username]);

  async function uploadFiles(
    fileList: FileList | null,
    options?: { selectForTailor?: boolean },
  ): Promise<BaseResumeSummary[]> {
    if (!fileList || fileList.length === 0) return [];
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const created: BaseResumeSummary[] = [];
      for (const file of Array.from(fileList)) {
        const body = new FormData();
        body.append("file", file);
        body.append("title", file.name.replace(/\.[^.]+$/, ""));
        const response = await fetch("/api/base-resumes", { method: "POST", body });
        const payload = (await response.json()) as {
          resume?: BaseResumeSummary;
          error?: { message?: string };
        };
        if (!response.ok || !payload.resume) {
          throw new Error(payload.error?.message ?? `Could not upload ${file.name}.`);
        }
        created.push(payload.resume);
      }
      await refreshBaseResumes();
      if (options?.selectForTailor && created[0]) {
        setUploadedForTailor(created[0]);
        setMode("upload");
        setMessage(
          `Uploaded “${created[0].title}”. Paste a JD and tailor from this resume.`,
        );
      } else {
        setMessage(
          created.length === 1
            ? `Saved “${created[0].title}” for auto-find matching.`
            : `Saved ${created.length} resumes for auto-find matching.`,
        );
      }
      return created;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
      return [];
    } finally {
      setUploading(false);
      if (libraryInputRef.current) libraryInputRef.current.value = "";
      if (tailorUploadRef.current) tailorUploadRef.current.value = "";
    }
  }

  async function removeResume(resumeId: string): Promise<void> {
    setError("");
    try {
      const response = await fetch(`/api/base-resumes/${resumeId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not delete resume.");
      }
      if (uploadedForTailor?.id === resumeId) setUploadedForTailor(null);
      await refreshBaseResumes();
      setMessage("Resume removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete resume.");
    }
  }

  async function previewMatches(): Promise<void> {
    setError("");
    setMatches([]);
    if (jobDescription.trim().length < 50) {
      setError("Paste a job description of at least 50 characters.");
      return;
    }
    if (baseResumes.length === 0) {
      setError("Upload at least one resume so auto-find has something to score.");
      return;
    }
    try {
      const response = await fetch("/api/base-resumes/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionText: jobDescription }),
      });
      const payload = (await response.json()) as {
        matches?: BaseResumeMatchResult[];
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not match resumes.");
      }
      setMatches(payload.matches ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not match resumes.");
    }
  }

  async function tailor(): Promise<void> {
    if (!canTailor || tailoring) return;
    setError("");
    setMessage("");
    setExportError("");
    setExportSavedAs("");
    setTailoring(true);
    setResult(null);
    setShowPreview(false);
    try {
      const apiMode = mode === "auto" ? "auto" : "manual";
      const response = await fetch("/api/base-resumes/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescriptionText: jobDescription,
          mode: apiMode,
          baseResumeId: mode === "upload" ? uploadedForTailor?.id : undefined,
          locale: "en-US",
        }),
      });
      const payload = (await response.json()) as {
        resume?: FinalResumeData;
        match?: BaseResumeMatchResult | null;
        baseResume?: { title?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.resume) {
        throw new Error(payload.error?.message ?? "Could not tailor resume.");
      }
      const next: TailorResult = {
        id: `TAILOR-${Date.now()}`,
        title: `${payload.baseResume?.title || "Resume"} → tailored`,
        resume: payload.resume,
        match: payload.match ?? null,
        baseResumeTitle: payload.baseResume?.title || "Resume",
      };
      setResult(next);
      setMessage(
        mode === "auto"
          ? `Auto-found “${next.baseResumeTitle}” as the best fit, then tailored it.`
          : `Tailored from uploaded “${next.baseResumeTitle}”.`,
      );
      try {
        const saved = await downloadResumeFile(
          payload.resume,
          "pdf",
          payload.resume.profile.personalInformation.fullName,
        );
        setExportSavedAs(saved.filename);
      } catch (downloadError) {
        setExportError(
          downloadError instanceof Error
            ? downloadError.message
            : "Automatic PDF download failed.",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not tailor resume.");
    } finally {
      setTailoring(false);
    }
  }

  async function exportResume(format: "docx" | "pdf" | "txt"): Promise<void> {
    if (!result) return;
    setExporting(format);
    setExportError("");
    setExportSavedAs("");
    try {
      const saved = await downloadResumeFile(
        result.resume,
        format,
        result.resume.profile.personalInformation.fullName,
      );
      setExportSavedAs(saved.filename);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <p className="brand">Resume Tailor</p>
          <div className="topbar-user">
            <div className="topbar-user-copy">
              <p className="header-username">{user.displayName}</p>
              <p className="header-account">@{user.username}</p>
            </div>
            <a href="/" className="secondary-action topbar-logout">
              Home
            </a>
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
        <section className="composer">
          <div className="section-head">
            <div>
              <h2>Tailor to a job description</h2>
              <p className="hint">
                Choose how to pick the source resume: auto-find the best fit from
                your uploads, or upload a resume for this JD.
              </p>
            </div>
          </div>

          <fieldset className="profile-field profile-field-full" style={{ border: 0, padding: 0 }}>
            <legend className="entry-label" style={{ marginBottom: "0.5rem" }}>
              Source resume
            </legend>
            <div className="section-actions" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className={mode === "auto" ? "primary" : "secondary-action"}
                aria-pressed={mode === "auto"}
                onClick={() => setMode("auto")}
              >
                Auto-find best fit
              </button>
              <button
                type="button"
                className={mode === "upload" ? "primary" : "secondary-action"}
                aria-pressed={mode === "upload"}
                onClick={() => setMode("upload")}
              >
                Upload resume
              </button>
            </div>
            <p className="hint" style={{ marginTop: "0.65rem" }}>
              {mode === "auto"
                ? baseResumes.length === 0
                  ? "Auto-find needs saved resumes first — add them in the library below."
                  : `Will score ${baseResumes.length} saved resume${baseResumes.length === 1 ? "" : "s"} and tailor the strongest match.`
                : uploadedForTailor
                  ? `Using uploaded “${uploadedForTailor.title}” for this tailor.`
                  : "Upload a PDF, DOCX, or TXT resume to tailor against this JD."}
            </p>
          </fieldset>

          {mode === "upload" ? (
            <div className="section-actions" style={{ marginTop: "0.75rem" }}>
              <input
                ref={tailorUploadRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                hidden
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  void uploadFiles(event.target.files, { selectForTailor: true })
                }
              />
              <button
                type="button"
                className="secondary-action"
                disabled={uploading}
                onClick={() => tailorUploadRef.current?.click()}
              >
                {uploading
                  ? "Uploading…"
                  : uploadedForTailor
                    ? "Replace uploaded resume"
                    : "Choose resume file"}
              </button>
              {uploadedForTailor ? (
                <button
                  type="button"
                  className="secondary-action entry-remove"
                  onClick={() => setUploadedForTailor(null)}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}

          <label className="profile-field profile-field-full" style={{ marginTop: "1rem" }}>
            <span>Job description</span>
            <textarea
              value={jobDescription}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setJobDescription(event.target.value)
              }
              placeholder="Paste the full job description here"
            />
          </label>

          <div className="composer-footer">
            {mode === "auto" ? (
              <button
                type="button"
                className="secondary-action"
                disabled={jobDescription.trim().length < 50 || baseResumes.length === 0}
                onClick={() => void previewMatches()}
              >
                Preview best fits
              </button>
            ) : null}
            <button
              type="button"
              className="primary"
              disabled={!canTailor || tailoring}
              onClick={() => void tailor()}
            >
              {tailoring ? "Tailoring…" : "Tailor resume"}
            </button>
            <p className="inline-status">
              {!canTailor
                ? mode === "auto"
                  ? "Need a JD (50+ chars) and at least one saved resume."
                  : "Need a JD (50+ chars) and an uploaded resume."
                : mode === "auto"
                  ? "Ready to auto-find the best fit and tailor it."
                  : "Ready to tailor your uploaded resume to this JD."}
            </p>
          </div>

          {mode === "auto" && matches.length > 0 ? (
            <div className="entry-block" style={{ marginTop: "1rem" }}>
              <p className="entry-label">Best-fit ranking</p>
              {matches.slice(0, 5).map((match, index) => (
                <p key={match.baseResumeId} className="hint">
                  {index + 1}. {match.title} — score {match.score}
                  {match.matchedStacks.length
                    ? ` · ${match.matchedStacks.slice(0, 4).join(", ")}`
                    : ""}
                </p>
              ))}
            </div>
          ) : null}

          {message ? <p className="inline-status">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="profile-card">
          <div className="section-head">
            <div>
              <h2>Resume library</h2>
              <p className="hint">
                Save many perfect resumes here. Auto-find uses this library to pick
                the most fit resume for each JD.
              </p>
            </div>
          </div>

          <input
            ref={libraryInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            multiple
            hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              void uploadFiles(event.target.files)
            }
          />

          <div className="section-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={uploading}
              onClick={() => libraryInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Add resumes to library"}
            </button>
          </div>

          {baseResumes.length === 0 ? (
            <p className="hint">No saved resumes yet.</p>
          ) : (
            <div className="entry-block">
              {baseResumes.map((resume) => (
                <div
                  key={resume.id}
                  className="entry-head"
                  style={{ marginBottom: "0.75rem" }}
                >
                  <div>
                    <p className="entry-label">{resume.title}</p>
                    <p className="hint">
                      {resume.roleCount} role{resume.roleCount === 1 ? "" : "s"}
                      {resume.stacks.length
                        ? ` · ${resume.stacks.slice(0, 6).join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <div className="section-actions">
                    <button
                      type="button"
                      className="secondary-action entry-remove"
                      onClick={() => void removeResume(resume.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="board" aria-live="polite">
          <div className="section-head">
            <div>
              <h2>Result</h2>
              <p className="hint">Preview the tailored resume, then download PDF or DOCX.</p>
            </div>
          </div>

          {!result ? (
            <div className="empty-board">
              <p>No tailored resume yet.</p>
              <ol>
                <li>Build a library (for auto-find) or upload one resume</li>
                <li>Paste a JD and choose Auto-find or Upload resume</li>
                <li>Tailor — preview and download when ready</li>
              </ol>
            </div>
          ) : (
            <div className="job-board">
              <div className="job-row status-done">
                <div className="job-list-main">
                  <div className="job-list-head job-list-head--compact">
                    <div className="job-index">1</div>
                    <div className="job-list-copy">
                      <div className="job-status-row">
                        <span className="badge badge-done">
                          {result.resume.assemblyValidation.overallStatus}
                        </span>
                      </div>
                      <strong className="job-headline">{result.title}</strong>
                      {result.match ? (
                        <p className="hint">
                          Match score {result.match.score}
                          {result.match.reasons[0] ? ` · ${result.match.reasons[0]}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="job-close"
                      aria-label="Clear result"
                      onClick={() => {
                        setResult(null);
                        setShowPreview(false);
                        setExportSavedAs("");
                        setExportError("");
                      }}
                    >
                      ×
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
                          onClick={() => void exportResume(format)}
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
                      Downloaded{" "}
                      {exportSavedAs ||
                        resumeFilenameFromFullName(
                          result.resume.profile.personalInformation.fullName,
                          "pdf",
                        )}
                    </p>
                  ) : null}
                  {exportError ? <p className="error">{exportError}</p> : null}

                  {showPreview ? (
                    <div className="resume-paper" style={{ marginTop: "1rem" }}>
                      <header style={{ marginBottom: "1rem" }}>
                        <h1>
                          {result.resume.profile.personalInformation.fullName}
                        </h1>
                        <div className="contact-line">
                          {[
                            result.resume.profile.personalInformation.email,
                            result.resume.profile.personalInformation.phone,
                            result.resume.profile.personalInformation.location,
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        </div>
                      </header>
                      {result.resume.document.sections.map((section) => {
                        if (section.id === "contact") return null;
                        return (
                          <section key={section.id} className="resume-section">
                            <h2>{section.heading}</h2>
                            {section.id === "professional-summary" ? (
                              <p>{section.content as string}</p>
                            ) : null}
                            {section.id === "skills" ? (
                              <div className="skills-list">
                                {(
                                  section.content as Array<{
                                    name: string;
                                    skills: string[];
                                  }>
                                ).map((category) => (
                                  <div key={category.name}>
                                    <strong>{category.name}:</strong>{" "}
                                    {category.skills.join(", ")}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {section.id === "professional-experience"
                              ? (
                                  section.content as Array<{
                                    experienceId: string;
                                    assignedRole: string;
                                    companyName: string;
                                    startDate: string;
                                    endDate: string;
                                    bullets: string[];
                                  }>
                                ).map((entry) => (
                                  <article
                                    key={entry.experienceId}
                                    className="role-block"
                                  >
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
                                        <li
                                          key={`${entry.experienceId}-${index}`}
                                        >
                                          {bullet}
                                        </li>
                                      ))}
                                    </ul>
                                  </article>
                                ))
                              : null}
                            {section.id === "education"
                              ? (
                                  section.content as Array<{
                                    educationId: string;
                                    degree: string;
                                    field: string;
                                    institution: string;
                                    startDate?: string;
                                    endDate?: string;
                                  }>
                                ).map((entry) => (
                                  <div key={entry.educationId} className="edu-line">
                                    <strong>
                                      {entry.degree} in {entry.field} |{" "}
                                      {entry.institution}
                                    </strong>
                                  </div>
                                ))
                              : null}
                          </section>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
