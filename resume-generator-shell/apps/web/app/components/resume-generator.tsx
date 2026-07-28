"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import type {
  CareerEntry,
  ExternalResumeFeedbackCategory,
  ExternalResumeTestRecord,
  FinalResumeData,
  UserProfile,
} from "@resume/contracts";

const SAMPLE_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

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
  };
}

export default function ResumeGenerator() {
  const [jobDescriptionText, setJobDescriptionText] = useState(SAMPLE_JD);
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
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Example Software Company",
        startDate: "2018-03",
        endDate: "2021-12",
      },
    ],
    education: [
      {
        educationId: "EDU-001",
        institution: "Example University",
        degree: "Bachelor of Science",
        field: "Computer Science",
        graduationDate: "2018",
      },
    ],
  });
  const [resume, setResume] = useState<FinalResumeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canGenerate = useMemo(() => {
    const personal = profile.personalInformation;
    return (
      jobDescriptionText.trim().length >= 50 &&
      profile.profileId.trim().length > 0 &&
      personal.fullName.trim().length > 0 &&
      personal.email.trim().length > 0 &&
      personal.phone.trim().length > 0 &&
      personal.location.trim().length > 0 &&
      profile.careerHistory.length > 0 &&
      profile.careerHistory.every(
        (entry) =>
          entry.companyName.trim() && entry.startDate.trim() && entry.endDate.trim(),
      )
    );
  }, [jobDescriptionText, profile]);

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
      education: current.education.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        const updated = { ...entry };
        if (field === "graduationDate") {
          if (value) updated.graduationDate = value;
          else delete updated.graduationDate;
        } else {
          updated[field] = value;
        }
        return updated;
      }),
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

  async function generate() {
    setLoading(true);
    setError("");
    setResume(null);
    try {
      const response = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescriptionText,
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
      setResume(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Resume generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace">
      <aside className="compose-panel">
        <section className="panel-surface">
          <header className="panel-intro">
            <p className="panel-kicker">Compose</p>
            <h2 className="panel-title">Job and profile</h2>
            <p className="panel-note">
              Paste the role and your background. Generation stays the same—the
              draft appears as a paper preview beside you.
            </p>
          </header>

          <div className="stack">
            <label className="field">
              <span className="field-label">Job description</span>
              <textarea
                className="control"
                value={jobDescriptionText}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setJobDescriptionText(event.target.value)
                }
              />
            </label>

            <div>
              <span className="field-label">Profile and contact</span>
              <div className="grid-2" style={{ marginTop: 8 }}>
                <input
                  className="control"
                  aria-label="Profile ID"
                  placeholder="Profile ID"
                  value={profile.profileId}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setProfile((current) => ({
                      ...current,
                      profileId: event.target.value,
                    }))
                  }
                />
                {(
                  ["fullName", "email", "phone", "location", "linkedin", "portfolio"] as const
                ).map((field) => (
                  <input
                    key={field}
                    className="control"
                    aria-label={field}
                    placeholder={field}
                    value={profile.personalInformation[field] ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updatePersonal(field, event.target.value)
                    }
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="row-head">
                <span className="field-label">Career history</span>
                <button className="btn-ghost" type="button" onClick={addCareer}>
                  Add company
                </button>
              </div>
              <div className="row-list">
                {profile.careerHistory.map((entry, index) => (
                  <div key={entry.experienceId} className="grid-career">
                    <input
                      className="control"
                      placeholder="Company"
                      value={entry.companyName}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateCareer(index, "companyName", event.target.value)
                      }
                    />
                    <input
                      className="control"
                      placeholder="2022-01"
                      value={entry.startDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateCareer(index, "startDate", event.target.value)
                      }
                    />
                    <input
                      className="control"
                      placeholder="Present"
                      value={entry.endDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateCareer(index, "endDate", event.target.value)
                      }
                    />
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={profile.careerHistory.length === 1}
                      onClick={() => removeCareer(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="row-head">
                <span className="field-label">Education</span>
                <button className="btn-ghost" type="button" onClick={addEducation}>
                  Add education
                </button>
              </div>
              <div className="row-list">
                {profile.education.map((entry, index) => (
                  <div key={entry.educationId} className="grid-edu">
                    {(["institution", "degree", "field", "graduationDate"] as const).map(
                      (field) => (
                        <input
                          key={field}
                          className="control"
                          placeholder={field}
                          value={entry[field] ?? ""}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEducation(index, field, event.target.value)
                          }
                        />
                      ),
                    )}
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => removeEducation(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              className="btn-primary"
              type="button"
              disabled={!canGenerate || loading}
              onClick={generate}
            >
              {loading ? "Generating complete resume…" : "Generate complete resume"}
            </button>
            {error ? <p className="alert-error">{error}</p> : null}
          </div>
        </section>
      </aside>

      <section className="result-panel" aria-live="polite">
        {!resume ? (
          <div className="empty-stage">
            <div>
              <p className="empty-stage-title">Your resume template appears here</p>
              <p className="empty-stage-copy">
                Generate once from the compose panel. The assembled draft opens as a
                paper preview with export and readiness tools.
              </p>
            </div>
          </div>
        ) : (
          <ResumePreview resume={resume} />
        )}
      </section>
    </div>
  );
}

function ResumePreview({ resume }: { resume: FinalResumeData }) {
  const template = resume.template.template;
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

  return (
    <div className="stack">
      <section className="panel-surface">
        <header className="panel-intro">
          <p className="panel-kicker">Template preview</p>
          <div className="preview-meta">
            <div>
              <h2 className="panel-title">Final assembled resume</h2>
              <code>{resume.context.generationId}</code>
            </div>
            <div className="meta-side">
              <span className="status-pill">
                {resume.assemblyValidation.overallStatus.toUpperCase()}
              </span>
              <div>{resume.orchestration.totalDurationMs} ms</div>
              <div>{template.templateName}</div>
            </div>
          </div>
        </header>

        <div className="actions">
          {(["docx", "pdf", "txt"] as const).map((format) => (
            <button
              key={format}
              className="btn-secondary"
              type="button"
              disabled={exporting !== null}
              onClick={() => exportResume(format)}
            >
              {exporting === format
                ? `Exporting ${format.toUpperCase()}…`
                : `Export ${format.toUpperCase()}`}
            </button>
          ))}
        </div>
        {exportError ? <p className="alert-error">{exportError}</p> : null}

        {resume.readiness ? (
          <details className="meta-details" open>
            <summary>Readiness &amp; calibration</summary>
            <section
              className={`readiness ${
                resume.readiness.readyForExternalTest ? "ready" : "needs-work"
              }`}
            >
              <div className="readiness-banner">
                <div className="readiness-head">
                  <div>
                    <h3>Resume Worded readiness</h3>
                    <p>
                      Internal quality gate: {resume.readiness.targetInternalScore}+.
                      External goal: 90+.
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="score">{resume.readiness.internalScore}</div>
                    <div className="score-caption">
                      {resume.readiness.readyForExternalTest
                        ? "Ready for external test"
                        : "Needs targeted improvement"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="score-grid">
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
                <div className="score-grid" style={{ marginTop: 8 }}>
                  <input
                    className="control"
                    inputMode="decimal"
                    placeholder="Overall score (0–100)"
                    value={externalOverallScore}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setExternalOverallScore(event.target.value)
                    }
                  />
                  <input
                    className="control"
                    inputMode="decimal"
                    placeholder="Relevancy score (optional)"
                    value={externalRelevancyScore}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setExternalRelevancyScore(event.target.value)
                    }
                  />
                  <select
                    className="control"
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
                </div>
                <textarea
                  className="control"
                  style={{ minHeight: 76, marginTop: 8 }}
                  placeholder="Paste one feedback item from Resume Worded (optional)"
                  value={feedbackMessage}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setFeedbackMessage(event.target.value)
                  }
                />
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={calibrating || !externalOverallScore.trim()}
                  onClick={submitCalibration}
                  style={{ marginTop: 8 }}
                >
                  {calibrating ? "Recording…" : "Record external test"}
                </button>
                {calibrationError ? (
                  <p className="alert-error">{calibrationError}</p>
                ) : null}
                {calibrationRecord ? (
                  <p className="calibration-note">
                    Recorded {calibrationRecord.externalOverallScore}/100 for this exact
                    resume. Internal-to-external delta:{" "}
                    {calibrationRecord.overallScoreDelta >= 0 ? "+" : ""}
                    {calibrationRecord.overallScoreDelta}.
                  </p>
                ) : null}
              </div>
            </section>
          </details>
        ) : null}
      </section>

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
                      {entry.graduationDate ? ` | ${entry.graduationDate}` : ""}
                    </div>
                  ))
                : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
