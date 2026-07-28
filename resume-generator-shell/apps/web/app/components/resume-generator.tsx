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
        roleTitle: "Staff Software Engineer",
        companyName: "Example AI Company",
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        roleTitle: "Software Engineer",
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
        startDate: "2014-09",
        endDate: "2018-06",
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
          entry.roleTitle?.trim() &&
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
      careerHistory: current.careerHistory.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        if (field === "roleTitle") {
          const updated = { ...entry };
          if (value.trim()) updated.roleTitle = value;
          else delete updated.roleTitle;
          return updated;
        }
        return { ...entry, [field]: value };
      }),
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
                Add your role and company for each position. Role titles appear on the
                generated resume.
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

                <label className="profile-field">
                  <span>Role</span>
                  <input
                    type="text"
                    name={`roleTitle-${entry.experienceId}`}
                    placeholder="Senior Software Engineer"
                    value={entry.roleTitle ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCareer(index, "roleTitle", event.target.value)
                    }
                  />
                </label>

                <label className="profile-field">
                  <span>Start Date</span>
                  <input
                    type="text"
                    name={`careerStartDate-${entry.experienceId}`}
                    placeholder="2022-01"
                    value={entry.startDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCareer(index, "startDate", event.target.value)
                    }
                  />
                </label>

                <label className="profile-field">
                  <span>End Date</span>
                  <input
                    type="text"
                    name={`careerEndDate-${entry.experienceId}`}
                    placeholder="Present"
                    value={entry.endDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCareer(index, "endDate", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}

          <div className="section-actions">
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
                Required. Add school, degree, field, and the study period.
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
                  <div className="period-inputs">
                    <input
                      type="text"
                      name={`educationStartDate-${entry.educationId}`}
                      aria-label="Education start date"
                      placeholder="2014-09"
                      value={entry.startDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateEducation(index, "startDate", event.target.value)
                      }
                    />
                    <span className="period-separator">-</span>
                    <input
                      type="text"
                      name={`educationEndDate-${entry.educationId}`}
                      aria-label="Education end date"
                      placeholder="2018-06"
                      value={entry.endDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateEducation(index, "endDate", event.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="section-actions">
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
                Paste one JD. Summary, skills, experience, and template engines each
                process it independently.
              </p>
            </div>
          </div>

          <label className="profile-field profile-field-full">
            <span className="manual-jd-label">JD text</span>
            <textarea
              name="jobDescription"
              value={jobDescriptionText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setJobDescriptionText(event.target.value)
              }
              placeholder="Paste the full job description here"
            />
          </label>

          <div className="composer-footer">
            <button
              type="button"
              className="primary"
              disabled={!canGenerate || loading}
              onClick={generate}
            >
              {loading ? "Generating…" : "Generate complete resume"}
            </button>
            <p className="inline-status">
              {loading
                ? "Running JD-isolated resume pipeline…"
                : "Ready when profile, career history, education, and JD are filled in."}
            </p>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="board" aria-live="polite">
          <div className="section-head">
            <div>
              <h2>Result</h2>
            </div>
          </div>

          {!resume ? (
            <div className="empty-board">
              <p>No resume yet. Generate once to preview and export.</p>
              <ol>
                <li>Confirm profile, career history, and education</li>
                <li>Paste the target job description</li>
                <li>Generate, review the paper preview, then export</li>
              </ol>
            </div>
          ) : (
            <ResumePreview resume={resume} />
          )}
        </section>
      </main>
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

  const readinessScore = resume.readiness?.internalScore;
  const firstExperience = resume.document.sections.find(
    (section) => section.id === "professional-experience",
  );
  const assignedRole =
    firstExperience && firstExperience.id === "professional-experience"
      ? firstExperience.content[0]?.assignedRole
      : undefined;

  return (
    <div className="job-row status-done">
      <div className="job-list-main">
        <div className="job-list-head">
          <div className="job-index">1</div>
          <div>
            <div className="job-title-row">
              <strong>{resume.context.generationId}</strong>
              <span className="badge badge-done">
                {resume.assemblyValidation.overallStatus}
              </span>
              {typeof readinessScore === "number" ? (
                <span className={`ats-score ${atsScoreClass(readinessScore)}`}>
                  ATS {readinessScore}
                </span>
              ) : null}
            </div>
            {assignedRole ? <p className="job-role">{assignedRole}</p> : null}
            <p className="job-role">
              {template.templateName} · {resume.orchestration.totalDurationMs} ms
            </p>
          </div>
        </div>

        <div className="download-row">
          <span className="download-label">Export</span>
          <div className="download-actions">
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
      </div>
    </div>
  );
}
