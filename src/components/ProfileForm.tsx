"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateProfile, EducationInput, ExperienceInput } from "@/lib/types";
import { SAMPLE_PROFILE, createBlankProfile } from "@/lib/profile";

type RowKey = { key: string };

function withKeys<T>(rows: T[]): Array<T & RowKey> {
  return rows.map((row) => ({ ...row, key: crypto.randomUUID() }));
}

function blankExperience(): ExperienceInput & RowKey {
  return { key: crypto.randomUUID(), company: "", title: "", period: "", location: "" };
}

function blankEducation(): EducationInput & RowKey {
  return { key: crypto.randomUUID(), school: "", degree: "", period: "", location: "" };
}

export default function ProfileForm({
  initial,
  accountEmail,
}: {
  initial: CandidateProfile;
  accountEmail: string;
}) {
  const router = useRouter();
  const [headline, setHeadline] = useState(initial.headline);
  const [personal, setPersonal] = useState({
    ...initial.personal,
    email: initial.personal.email || accountEmail,
  });
  const [experiences, setExperiences] = useState(
    withKeys(
      initial.experiences.length ? initial.experiences : createBlankProfile().experiences,
    ),
  );
  const [education, setEducation] = useState(
    withKeys(initial.education.length ? initial.education : createBlankProfile().education),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function applySample() {
    setHeadline(SAMPLE_PROFILE.headline);
    setPersonal({ ...SAMPLE_PROFILE.personal, email: personal.email || accountEmail });
    setExperiences(withKeys(SAMPLE_PROFILE.experiences));
    setEducation(withKeys(SAMPLE_PROFILE.education));
    setStatus("Sample profile loaded. Save to keep it.");
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const payload: CandidateProfile = {
        headline,
        personal,
        experiences: experiences.map((row) => ({
          company: row.company,
          title: row.title,
          period: row.period,
          location: row.location,
        })),
        education: education.map((row) => ({
          school: row.school,
          degree: row.degree,
          period: row.period,
          location: row.location,
        })),
      };
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not save profile.");
      }
      setStatus("Profile saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="composer profile-form" onSubmit={onSubmit}>
      <div className="section-head">
        <div>
          <h2>Your profile</h2>
          <p className="hint">
            This is the candidate record used when tailoring resumes. Add real
            employers, titles, and dates — bullets are generated per job later.
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={applySample}>
          Load sample
        </button>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Full name</span>
          <input
            required
            value={personal.name}
            onChange={(e) => setPersonal({ ...personal, name: e.target.value })}
            placeholder="Ada Lovelace"
          />
        </label>
        <label className="field">
          <span>Headline</span>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Senior Software Engineer"
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={personal.email}
            onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Phone</span>
          <input
            value={personal.phone}
            onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
            placeholder="+1 555 0100"
          />
        </label>
        <label className="field">
          <span>Location</span>
          <input
            value={personal.location}
            onChange={(e) => setPersonal({ ...personal, location: e.target.value })}
            placeholder="City, Country"
          />
        </label>
        <label className="field">
          <span>LinkedIn URL</span>
          <input
            value={personal.linkedin}
            onChange={(e) => setPersonal({ ...personal, linkedin: e.target.value })}
            placeholder="https://www.linkedin.com/in/…"
          />
        </label>
      </div>

      <div className="profile-block">
        <div className="block-head">
          <h3>Experience</h3>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setExperiences((rows) => [...rows, blankExperience()])}
          >
            Add role
          </button>
        </div>
        <div className="row-stack">
          {experiences.map((row, index) => (
            <div key={row.key} className="row-card">
              <div className="row-card-top">
                <span>Role {index + 1}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    setExperiences((rows) =>
                      rows.length === 1
                        ? [blankExperience()]
                        : rows.filter((item) => item.key !== row.key),
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Company</span>
                  <input
                    value={row.company}
                    onChange={(e) =>
                      setExperiences((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, company: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input
                    value={row.title}
                    onChange={(e) =>
                      setExperiences((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, title: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Period</span>
                  <input
                    value={row.period}
                    onChange={(e) =>
                      setExperiences((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, period: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Jan 2020 – Present"
                  />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    value={row.location}
                    onChange={(e) =>
                      setExperiences((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, location: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Remote"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="profile-block">
        <div className="block-head">
          <h3>Education</h3>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setEducation((rows) => [...rows, blankEducation()])}
          >
            Add school
          </button>
        </div>
        <div className="row-stack">
          {education.map((row, index) => (
            <div key={row.key} className="row-card">
              <div className="row-card-top">
                <span>School {index + 1}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    setEducation((rows) =>
                      rows.length === 1
                        ? [blankEducation()]
                        : rows.filter((item) => item.key !== row.key),
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>School</span>
                  <input
                    value={row.school}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, school: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Degree</span>
                  <input
                    value={row.degree}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, degree: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Period</span>
                  <input
                    value={row.period}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, period: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    value={row.location}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, location: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="composer-footer">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {status && <p className="inline-status">{status}</p>}
      </div>
    </form>
  );
}
