"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type {
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

type TailorResult = {
  id: string;
  title: string;
  resume: FinalResumeData;
  baseResumeTitle: string;
};

export default function BaseResumeTailor({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void | Promise<void>;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedResume, setSelectedResume] = useState<BaseResumeSummary | null>(
    null,
  );
  const [jobDescription, setJobDescription] = useState("");
  const [tailoring, setTailoring] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | "txt" | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportSavedAs, setExportSavedAs] = useState("");
  const tailorUploadRef = useRef<HTMLInputElement | null>(null);

  const canTailor = useMemo(() => {
    return jobDescription.trim().length >= 50 && Boolean(selectedResume);
  }, [jobDescription, selectedResume]);

  async function uploadResume(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const file = fileList[0];
      if (!file) return;
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
      setSelectedResume(payload.resume);
      setMessage(
        `Uploaded “${payload.resume.title}”. Paste a JD and tailor from this resume.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (tailorUploadRef.current) tailorUploadRef.current.value = "";
    }
  }

  async function tailor(): Promise<void> {
    if (!canTailor || !selectedResume || tailoring) return;
    setError("");
    setMessage("");
    setExportError("");
    setExportSavedAs("");
    setTailoring(true);
    setResult(null);
    setShowPreview(false);
    try {
      const response = await fetch("/api/base-resumes/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescriptionText: jobDescription,
          baseResumeId: selectedResume.id,
          locale: "en-US",
        }),
      });
      const payload = (await response.json()) as {
        resume?: FinalResumeData;
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
        baseResumeTitle: payload.baseResume?.title || "Resume",
      };
      setResult(next);
      setMessage(`Tailored from “${next.baseResumeTitle}”.`);
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
                Upload a resume, then tailor. Experience count follows your Home
                profile. We preserve overlapping uploaded bullets, overlay
                identity/career/education from profile, replace/add 1–2 JD bullets
                on matching roles, and create new JD bullets for extra profile
                roles.
              </p>
            </div>
          </div>

          <div className="section-actions" style={{ marginTop: "0.25rem" }}>
            <input
              ref={tailorUploadRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                void uploadResume(event.target.files)
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
                : selectedResume
                  ? "Upload a different resume"
                  : "Upload resume"}
            </button>
            {selectedResume ? (
              <button
                type="button"
                className="secondary-action entry-remove"
                onClick={() => setSelectedResume(null)}
              >
                Clear selection
              </button>
            ) : null}
          </div>
          <p className="hint" style={{ marginTop: "0.6rem" }}>
            {selectedResume
              ? `Using “${selectedResume.title}” for this tailor.`
              : "Upload a PDF, DOCX, or TXT resume to tailor against this JD."}
          </p>

          <label
            className="profile-field profile-field-full"
            style={{ marginTop: "1rem" }}
          >
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
                ? "Need a JD (50+ chars) and an uploaded resume."
                : "Ready to tailor your uploaded resume to this JD."}
            </p>
          </div>

          {message ? <p className="inline-status">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
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
                <li>Upload a resume</li>
                <li>Paste a JD</li>
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
