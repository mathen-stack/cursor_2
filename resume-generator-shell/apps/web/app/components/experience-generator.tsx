"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import type {
  CareerEntry,
  ExperienceGenerationRunRecord,
} from "@resume/contracts";

type ExperienceBullet = NonNullable<
  ExperienceGenerationRunRecord["output"]
>["experiences"][number]["bullets"][number];

const SAMPLE_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

function createCareerEntry(index: number): CareerEntry {
  return {
    experienceId: `EXP-${String(index + 1).padStart(3, "0")}`,
    companyName: "",
    startDate: "",
    endDate: index === 0 ? "Present" : "",
  };
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px 12px",
  font: "inherit",
};

export default function ExperienceGenerator() {
  const [profileId, setProfileId] = useState("PROFILE-DEMO");
  const [jobDescriptionText, setJobDescriptionText] = useState(SAMPLE_JD);
  const [careerHistory, setCareerHistory] = useState<CareerEntry[]>([
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
  ]);
  const [run, setRun] = useState<ExperienceGenerationRunRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canGenerate = useMemo(
    () =>
      profileId.trim().length > 0 &&
      jobDescriptionText.trim().length >= 50 &&
      careerHistory.length > 0 &&
      careerHistory.every(
        (entry) =>
          entry.companyName.trim() &&
          entry.startDate.trim() &&
          entry.endDate.trim(),
      ),
    [careerHistory, jobDescriptionText, profileId],
  );

  function updateCareerEntry(
    index: number,
    field: keyof CareerEntry,
    value: string,
  ) {
    setCareerHistory((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function addCareerEntry() {
    setCareerHistory((current) => [
      ...current,
      createCareerEntry(current.length),
    ]);
  }

  function removeCareerEntry(index: number) {
    setCareerHistory((current) =>
      current
        .filter((_, entryIndex) => entryIndex !== index)
        .map((entry, entryIndex) => ({
          ...entry,
          experienceId: `EXP-${String(entryIndex + 1).padStart(3, "0")}`,
        })),
    );
  }

  async function generate() {
    setLoading(true);
    setError("");
    setRun(null);
    try {
      const response = await fetch("/api/experience/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          jobDescriptionText,
          careerHistory,
          locale: "en-US",
        }),
      });
      const payload = (await response.json()) as
        | ExperienceGenerationRunRecord
        | { error?: { message?: string } };
      if (!response.ok || !("context" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error?.message ?? "Generation failed."
            : "Generation failed.",
        );
      }
      setRun(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ background: "white", padding: 24, borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Generate Experience</h2>
        <div style={{ display: "grid", gap: 14 }}>
          <label>
            <strong>Profile ID</strong>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={profileId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setProfileId(event.target.value)}
            />
          </label>
          <label>
            <strong>Job description</strong>
            <textarea
              style={{ ...inputStyle, minHeight: 220, marginTop: 6, resize: "vertical" }}
              value={jobDescriptionText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setJobDescriptionText(event.target.value)}
            />
          </label>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Career history</strong>
              <button type="button" onClick={addCareerEntry}>Add company</button>
            </div>
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {careerHistory.map((entry, index) => (
                <div
                  key={entry.experienceId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr auto",
                    gap: 8,
                    alignItems: "end",
                  }}
                >
                  <label>
                    <small>Company</small>
                    <input
                      style={inputStyle}
                      value={entry.companyName}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateCareerEntry(index, "companyName", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <small>Start</small>
                    <input
                      style={inputStyle}
                      placeholder="2022-01"
                      value={entry.startDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateCareerEntry(index, "startDate", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <small>End</small>
                    <input
                      style={inputStyle}
                      placeholder="Present"
                      value={entry.endDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateCareerEntry(index, "endDate", event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={careerHistory.length === 1}
                    onClick={() => removeCareerEntry(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!canGenerate || loading}
            onClick={generate}
            style={{
              padding: "12px 18px",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              cursor: canGenerate && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Generating…" : "Generate experience"}
          </button>
          {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        </div>
      </section>

      {run ? (
        <section style={{ background: "white", padding: 24, borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0 }}>Experience Preview</h2>
              <p style={{ marginBottom: 0 }}>
                Run: <code>{run.context.generationId}</code>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong>{run.status.toUpperCase()}</strong>
              <div>{run.telemetry.totalDurationMs ?? 0} ms</div>
            </div>
          </div>

          {run.output?.experiences.map((experience) => (
            <article key={experience.experienceId} style={{ marginTop: 28 }}>
              <h3 style={{ marginBottom: 4 }}>{experience.assignedRole}</h3>
              <div>
                {experience.companyName} · {experience.startDate}–{experience.endDate}
              </div>
              <ul style={{ lineHeight: 1.55 }}>
                {experience.bullets.map((bullet: ExperienceBullet) => (
                  <li key={bullet.bulletId} style={{ marginTop: 8 }}>
                    {bullet.finalBullet}
                    <small style={{ display: "block", color: "#475569" }}>
                      Strength {bullet.strengthScore.toFixed(1)} · Distinctiveness{" "}
                      {bullet.distinctivenessScore.toFixed(1)}
                    </small>
                  </li>
                ))}
              </ul>
            </article>
          ))}

          {run.error ? (
            <p style={{ color: "#b91c1c" }}>{run.error.message}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
