"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import type {
  CareerEntry,
  ExternalResumeFeedbackCategory,
  ExternalResumeTestRecord,
  FinalResumeData,
  UserProfile,
} from "@resume/contracts";

/** Original sample JD retained for backward-compatible demo behavior. */
const SAMPLE_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

/** Additive multi-stack sample JDs; original ML sample remains available. */
const STACK_SAMPLE_JDS: ReadonlyArray<{ id: string; label: string; text: string }> = [
  { id: "ai-ml", label: "AI/ML (original)", text: SAMPLE_JD },
  {
    id: "backend",
    label: "Backend",
    text: `Senior Backend Engineer
Design and implement scalable microservices and REST APIs in production environments.
Optimize query performance, improve service reliability, and automate CI/CD workflows.
Collaborate with product and platform teams to translate business requirements into technical solutions.
Experience with Java, Spring Boot, PostgreSQL, Kafka, Docker, Kubernetes, and AWS is required.`,
  },
  {
    id: "frontend",
    label: "Frontend",
    text: `Senior Frontend Engineer
Build accessible user interfaces and scalable front-end applications with React.js and TypeScript.
Implement real-time communication features using WebSockets and improve rendering performance.
Collaborate with product and design partners on delivery priorities and design systems.
Experience with Next.js, Tailwind CSS, Vitest, Cypress, and CI/CD workflows is required.`,
  },
  {
    id: "mobile",
    label: "Mobile",
    text: `Senior Mobile Engineer
Build and ship high-quality iOS and Android mobile applications with React Native and Kotlin.
Improve mobile UI performance, offline reliability, and release automation.
Collaborate with product and design teams on mobile application delivery.
Experience with Swift, Flutter, mobile UI development, and CI/CD is required.`,
  },
  {
    id: "qa",
    label: "QA",
    text: `Senior QA Engineer
Design test strategy and implement test automation for web and API platforms.
Build reliable end-to-end suites with Playwright and Selenium, and improve release quality gates.
Collaborate with engineering and product teams on defect prevention.
Experience with Cypress, JUnit, CI/CD, and quality assurance practices is required.`,
  },
  {
    id: "devops",
    label: "DevOps",
    text: `Senior DevOps Engineer
Build CI/CD pipelines, infrastructure as code, and observability for production platforms.
Improve deployment automation, Kubernetes reliability, and incident response.
Collaborate with platform and application teams on developer experience.
Experience with Terraform, Docker, Prometheus, Grafana, and AWS is required.`,
  },
  {
    id: "security",
    label: "Security",
    text: `Senior Security Engineer
Lead application security, threat modeling, and vulnerability remediation for production systems.
Implement identity and access management, OAuth, and encryption controls.
Collaborate with engineering teams on secure software delivery.
Experience with cybersecurity practices, SOC 2 readiness, and secure CI/CD is required.`,
  },
  {
    id: "blockchain",
    label: "Blockchain",
    text: `Senior Blockchain Engineer
Design and implement smart contracts and blockchain platforms with Solidity and Ethereum.
Improve Web3 reliability, audit readiness, and on-chain integration quality.
Collaborate with product and security partners on decentralized application delivery.
Experience with Hardhat, Rust, and smart contract development is required.`,
  },
];

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px 12px",
  font: "inherit",
};

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
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ background: "white", padding: 24, borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Resume input</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <label>
            <strong>Job description</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {STACK_SAMPLE_JDS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => setJobDescriptionText(sample.text)}
                  style={{ padding: "6px 10px", borderRadius: 7 }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
            <textarea
              style={{ ...inputStyle, minHeight: 210, marginTop: 6, resize: "vertical" }}
              value={jobDescriptionText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setJobDescriptionText(event.target.value)
              }
            />
          </label>

          <div>
            <strong>Profile and contact</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 8,
              }}
            >
              <input
                style={inputStyle}
                aria-label="Profile ID"
                placeholder="Profile ID"
                value={profile.profileId}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setProfile((current) => ({ ...current, profileId: event.target.value }))
                }
              />
              {(["fullName", "email", "phone", "location", "linkedin", "portfolio"] as const).map(
                (field) => (
                  <input
                    key={field}
                    style={inputStyle}
                    aria-label={field}
                    placeholder={field}
                    value={profile.personalInformation[field] ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updatePersonal(field, event.target.value)}
                  />
                ),
              )}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Career history</strong>
              <button type="button" onClick={addCareer}>Add company</button>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {profile.careerHistory.map((entry, index) => (
                <div
                  key={entry.experienceId}
                  style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8 }}
                >
                  <input
                    style={inputStyle}
                    placeholder="Company"
                    value={entry.companyName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateCareer(index, "companyName", event.target.value)}
                  />
                  <input
                    style={inputStyle}
                    placeholder="2022-01"
                    value={entry.startDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateCareer(index, "startDate", event.target.value)}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Present"
                    value={entry.endDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateCareer(index, "endDate", event.target.value)}
                  />
                  <button
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
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Education</strong>
              <button type="button" onClick={addEducation}>Add education</button>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {profile.education.map((entry, index) => (
                <div
                  key={entry.educationId}
                  style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1.4fr 1fr auto", gap: 8 }}
                >
                  {(["institution", "degree", "field", "graduationDate"] as const).map(
                    (field) => (
                      <input
                        key={field}
                        style={inputStyle}
                        placeholder={field}
                        value={entry[field] ?? ""}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => updateEducation(index, field, event.target.value)}
                      />
                    ),
                  )}
                  <button type="button" onClick={() => removeEducation(index)}>Remove</button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!canGenerate || loading}
            onClick={generate}
            style={{ padding: "12px 18px", borderRadius: 8, fontWeight: 700 }}
          >
            {loading ? "Generating complete resume…" : "Generate complete resume"}
          </button>
          {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        </div>
      </section>

      {resume ? <ResumePreview resume={resume} /> : null}
    </div>
  );
}

function ResumePreview({ resume }: { resume: FinalResumeData }) {
  const template = resume.template.template;
  const [exporting, setExporting] = useState<"docx" | "pdf" | "txt" | null>(null);
  const [exportError, setExportError] = useState("");
  const [externalOverallScore, setExternalOverallScore] = useState("");
  const [externalRelevancyScore, setExternalRelevancyScore] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<ExternalResumeFeedbackCategory>("impact");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [calibrationRecord, setCalibrationRecord] = useState<ExternalResumeTestRecord | null>(null);
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
    <section style={{ background: "white", padding: 24, borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Final assembled resume</h2>
          <code>{resume.context.generationId}</code>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong>{resume.assemblyValidation.overallStatus.toUpperCase()}</strong>
          <div>{resume.orchestration.totalDurationMs} ms</div>
          <div>{template.templateName}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {(["docx", "pdf", "txt"] as const).map((format) => (
          <button
            key={format}
            type="button"
            disabled={exporting !== null}
            onClick={() => exportResume(format)}
            style={{ padding: "9px 14px", borderRadius: 7, fontWeight: 700 }}
          >
            {exporting === format ? `Exporting ${format.toUpperCase()}…` : `Export ${format.toUpperCase()}`}
          </button>
        ))}
      </div>
      {exportError ? <p style={{ color: "#b91c1c" }}>{exportError}</p> : null}

      {resume.stackContext ? (
        <section
          style={{
            marginTop: 20,
            padding: 18,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#f8fafc",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Detected engineering stack</h3>
          <p style={{ margin: "4px 0 0" }}>
            Primary: <strong>{resume.stackContext.primaryStack}</strong>
            {resume.stackContext.secondaryStacks.length > 0
              ? ` · Secondary: ${resume.stackContext.secondaryStacks.join(", ")}`
              : ""}
            {` · Confidence: ${Math.round(resume.stackContext.confidence * 100)}%`}
          </p>
        </section>
      ) : null}

      {resume.readiness ? (
        <section
          style={{
            marginTop: 20,
            padding: 18,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: resume.readiness.readyForExternalTest ? "#f0fdf4" : "#fff7ed",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>Resume Worded readiness</h3>
              <p style={{ margin: "5px 0 0" }}>
                Internal quality gate: {resume.readiness.targetInternalScore}+. External goal: 90+.
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong style={{ fontSize: 28 }}>{resume.readiness.internalScore}</strong>
              <div>{resume.readiness.readyForExternalTest ? "Ready for external test" : "Needs targeted improvement"}</div>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 8,
              marginTop: 14,
            }}
          >
            {resume.readiness.categories.map((category) => (
              <div key={category.categoryId} style={{ padding: 10, background: "white", borderRadius: 8 }}>
                <strong>{category.label}</strong>
                <div>{category.score}/100</div>
              </div>
            ))}
          </div>
          {resume.readiness.issues.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <strong>Targeted findings</strong>
              <ul style={{ marginBottom: 0 }}>
                {resume.readiness.issues.slice(0, 6).map((issue) => (
                  <li key={issue.issueCode} style={{ marginTop: 5 }}>
                    {issue.message} <em>Owner: {issue.owner}</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p style={{ marginBottom: 0, fontSize: 13 }}>{resume.readiness.disclaimer}</p>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #cbd5e1" }}>
            <strong>Record an external Resume Worded test</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
                marginTop: 8,
              }}
            >
              <input
                style={inputStyle}
                inputMode="decimal"
                placeholder="Overall score (0–100)"
                value={externalOverallScore}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setExternalOverallScore(event.target.value)}
              />
              <input
                style={inputStyle}
                inputMode="decimal"
                placeholder="Relevancy score (optional)"
                value={externalRelevancyScore}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setExternalRelevancyScore(event.target.value)}
              />
              <select
                style={inputStyle}
                value={feedbackCategory}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setFeedbackCategory(event.target.value as ExternalResumeFeedbackCategory)
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
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <textarea
              style={{ ...inputStyle, minHeight: 76, marginTop: 8 }}
              placeholder="Paste one feedback item from Resume Worded (optional)"
              value={feedbackMessage}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setFeedbackMessage(event.target.value)}
            />
            <button
              type="button"
              disabled={calibrating || !externalOverallScore.trim()}
              onClick={submitCalibration}
              style={{ marginTop: 8, padding: "9px 14px", borderRadius: 7, fontWeight: 700 }}
            >
              {calibrating ? "Recording…" : "Record external test"}
            </button>
            {calibrationError ? <p style={{ color: "#b91c1c" }}>{calibrationError}</p> : null}
            {calibrationRecord ? (
              <p style={{ marginBottom: 0 }}>
                Recorded {calibrationRecord.externalOverallScore}/100 for this exact resume. Internal-to-external delta: {calibrationRecord.overallScoreDelta >= 0 ? "+" : ""}{calibrationRecord.overallScoreDelta}.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <div
        style={{
          maxWidth: template.pageSize === "a4" ? 794 : 816,
          margin: "24px auto 0",
          padding: 48,
          border: "1px solid #cbd5e1",
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
                <h1 style={{ margin: 0, fontSize: template.typography.nameSizePt + 4 }}>
                  {contact.fullName}
                </h1>
                <div style={{ marginTop: 6 }}>
                  {[contact.email, contact.phone, contact.location, contact.linkedin, contact.portfolio]
                    .filter(Boolean)
                    .join(" | ")}
                </div>
              </header>
            );
          }
          return (
            <section key={section.id} style={{ marginTop: 20 }}>
              <h2
                style={{
                  margin: "0 0 7px",
                  fontSize: template.typography.sectionHeadingSizePt,
                  borderBottom: "1px solid #0f172a",
                }}
              >
                {section.heading}
              </h2>
              {section.id === "professional-summary" ? <p>{section.content}</p> : null}
              {section.id === "skills" ? (
                <div style={{ display: "grid", gap: 5 }}>
                  {section.content.map((category) => (
                    <div key={category.name}>
                      <strong>{category.name}:</strong> {category.skills.join(", ")}
                    </div>
                  ))}
                </div>
              ) : null}
              {section.id === "professional-experience"
                ? section.content.map((entry) => (
                    <article key={entry.experienceId} style={{ marginTop: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                        <strong>{entry.assignedRole} | {entry.companyName}</strong>
                        <span>{entry.startDate} – {entry.endDate}</span>
                      </div>
                      <ul style={{ marginTop: 7 }}>
                        {entry.bullets.map((bullet, index) => (
                          <li key={`${entry.experienceId}-${index}`} style={{ marginTop: 5 }}>{bullet}</li>
                        ))}
                      </ul>
                    </article>
                  ))
                : null}
              {section.id === "education"
                ? section.content.map((entry) => (
                    <div key={entry.educationId} style={{ marginTop: 8 }}>
                      <strong>{entry.degree} in {entry.field}</strong>, {entry.institution}
                      {entry.graduationDate ? ` | ${entry.graduationDate}` : ""}
                    </div>
                  ))
                : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
