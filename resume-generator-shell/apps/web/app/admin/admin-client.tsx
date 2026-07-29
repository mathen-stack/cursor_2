"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CareerEntry, UserProfile } from "@resume/contracts";
import { PeriodDateControl } from "../components/period-date-control";
import { createEmptyProfile } from "../../lib/saved-profile-store";

type SessionUser = {
  username: string;
  displayName: string;
  role: "admin" | "user";
};

type ProfileSummary = {
  username: string;
  savedAt: string;
  updatedBy: string;
  fullName: string;
  email: string;
  hasProfile: boolean;
};

const PLACEHOLDERS = {
  fullName: "Enter full name",
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
} as const;

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

export default function AdminProfilesClient() {
  const router = useRouter();
  const [admin, setAdmin] = useState<SessionUser | null>(null);
  const [summaries, setSummaries] = useState<ProfileSummary[]>([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [draft, setDraft] = useState<UserProfile>(() => createEmptyProfile());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedSummary = useMemo(
    () => summaries.find((item) => item.username === selectedUsername) ?? null,
    [summaries, selectedUsername],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const sessionPayload = (await sessionResponse.json()) as {
          user?: SessionUser | null;
        };
        if (!sessionResponse.ok || !sessionPayload.user) {
          router.replace("/login?next=/admin");
          return;
        }
        if (sessionPayload.user.role !== "admin") {
          router.replace("/");
          return;
        }
        if (!cancelled) setAdmin(sessionPayload.user);

        const listResponse = await fetch("/api/admin/profiles", {
          cache: "no-store",
        });
        const listPayload = (await listResponse.json()) as {
          profiles?: ProfileSummary[];
          error?: { message?: string };
        };
        if (!listResponse.ok) {
          throw new Error(listPayload.error?.message ?? "Could not load users.");
        }
        const profiles = listPayload.profiles ?? [];
        if (!cancelled) {
          setSummaries(profiles);
          const first = profiles[0]?.username ?? "";
          setSelectedUsername(first);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Could not open admin.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedUsername) return;
    let cancelled = false;
    async function loadSelected() {
      setError("");
      setMessage("");
      try {
        const response = await fetch(
          `/api/admin/profiles/${encodeURIComponent(selectedUsername)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          profile?: UserProfile;
          savedAt?: string | null;
          updatedBy?: string | null;
          error?: { message?: string };
        };
        if (!response.ok || !payload.profile) {
          throw new Error(payload.error?.message ?? "Could not load profile.");
        }
        if (!cancelled) {
          setDraft(payload.profile);
          setSavedAt(payload.savedAt ?? null);
          setUpdatedBy(payload.updatedBy ?? null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Could not load profile.",
          );
        }
      }
    }
    void loadSelected();
    return () => {
      cancelled = true;
    };
  }, [selectedUsername]);

  async function refreshSummaries() {
    const listResponse = await fetch("/api/admin/profiles", { cache: "no-store" });
    const listPayload = (await listResponse.json()) as {
      profiles?: ProfileSummary[];
    };
    if (listResponse.ok) {
      setSummaries(listPayload.profiles ?? []);
    }
  }

  async function saveSelectedProfile() {
    if (!selectedUsername) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/profiles/${encodeURIComponent(selectedUsername)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: draft }),
        },
      );
      const payload = (await response.json()) as {
        profile?: UserProfile;
        savedAt?: string;
        updatedBy?: string;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error?.message ?? "Could not save profile.");
      }
      setDraft(payload.profile);
      setSavedAt(payload.savedAt ?? null);
      setUpdatedBy(payload.updatedBy ?? null);
      setMessage(`Saved profile for @${selectedUsername}`);
      await refreshSummaries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSelectedProfile() {
    if (!selectedUsername) return;
    if (
      !window.confirm(
        `Clear saved profile for @${selectedUsername}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/profiles/${encodeURIComponent(selectedUsername)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not clear profile.");
      }
      setDraft(createEmptyProfile());
      setSavedAt(null);
      setUpdatedBy(null);
      setMessage(`Cleared profile for @${selectedUsername}`);
      await refreshSummaries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Clear failed.");
    } finally {
      setSaving(false);
    }
  }

  function updatePersonal(
    field: keyof UserProfile["personalInformation"],
    value: string,
  ) {
    setDraft((current) => {
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

  if (loading) {
    return (
      <div className="page">
        <div className="atmosphere" aria-hidden />
        <main className="main">
          <p className="hint">Loading administrator console…</p>
        </main>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="page">
        <div className="atmosphere" aria-hidden />
        <main className="main">
          <p className="error">{error || "Administrator access required."}</p>
        </main>
      </div>
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
              <p className="header-username">Administrator</p>
              <p className="header-account">@{admin.username}</p>
            </div>
            <Link href="/" className="secondary-action topbar-logout">
              Generator
            </Link>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="profile-card">
          <div className="section-head">
            <div>
              <h2>Manage user profiles</h2>
              <p className="hint">
                View and edit saved profiles for every account. Users see these
                profiles when they sign in and generate resumes.
              </p>
            </div>
          </div>

          <div className="admin-layout">
            <aside className="admin-user-list" aria-label="Users">
              {summaries.map((summary) => (
                <button
                  key={summary.username}
                  type="button"
                  className={`admin-user-item${
                    summary.username === selectedUsername ? " is-active" : ""
                  }`}
                  onClick={() => setSelectedUsername(summary.username)}
                >
                  <strong>@{summary.username}</strong>
                  <span>
                    {summary.hasProfile
                      ? summary.fullName || "Profile saved"
                      : "No profile yet"}
                  </span>
                </button>
              ))}
            </aside>

            <div className="admin-editor">
              {selectedUsername ? (
                <>
                  <div className="section-head">
                    <div>
                      <h2>@{selectedUsername}</h2>
                      <p className="hint">
                        {savedAt
                          ? `Last saved ${new Date(savedAt).toLocaleString()}${
                              updatedBy ? ` by @${updatedBy}` : ""
                            }`
                          : "No saved profile yet"}
                        {selectedSummary?.email
                          ? ` · ${selectedSummary.email}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="profile-grid">
                    <label className="profile-field">
                      <span>Full Name</span>
                      <input
                        value={draft.personalInformation.fullName}
                        placeholder={PLACEHOLDERS.fullName}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updatePersonal("fullName", event.target.value)
                        }
                      />
                    </label>
                    <label className="profile-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={draft.personalInformation.email}
                        placeholder={PLACEHOLDERS.email}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updatePersonal("email", event.target.value)
                        }
                      />
                    </label>
                    <label className="profile-field">
                      <span>Phone</span>
                      <input
                        value={draft.personalInformation.phone}
                        placeholder={PLACEHOLDERS.phone}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updatePersonal("phone", event.target.value)
                        }
                      />
                    </label>
                    <label className="profile-field">
                      <span>Location</span>
                      <input
                        value={draft.personalInformation.location}
                        placeholder={PLACEHOLDERS.location}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updatePersonal("location", event.target.value)
                        }
                      />
                    </label>
                    <label className="profile-field">
                      <span>LinkedIn</span>
                      <input
                        value={draft.personalInformation.linkedin ?? ""}
                        placeholder={PLACEHOLDERS.linkedin}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updatePersonal("linkedin", event.target.value)
                        }
                      />
                    </label>
                    <label className="profile-field">
                      <span>Portfolio</span>
                      <input
                        value={draft.personalInformation.portfolio ?? ""}
                        placeholder={PLACEHOLDERS.portfolio}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updatePersonal("portfolio", event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <h3 className="admin-subtitle">Career history</h3>
                  {draft.careerHistory.map((entry, index) => (
                    <div key={entry.experienceId} className="entry-block">
                      <div className="profile-grid">
                        <label className="profile-field">
                          <span>Company</span>
                          <input
                            value={entry.companyName}
                            placeholder={PLACEHOLDERS.company}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setDraft((current) => ({
                                ...current,
                                careerHistory: current.careerHistory.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          companyName: event.target.value,
                                        }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <div className="profile-field">
                          <span>Period</span>
                          <PeriodDateControl
                            startValue={entry.startDate}
                            endValue={entry.endDate}
                            allowPresentEnd
                            startPlaceholder={PLACEHOLDERS.periodStart}
                            endPlaceholder={PLACEHOLDERS.periodEndPresent}
                            onStartChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                careerHistory: current.careerHistory.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, startDate: value }
                                      : item,
                                ),
                              }))
                            }
                            onEndChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                careerHistory: current.careerHistory.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, endDate: value }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="section-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          careerHistory: [
                            ...current.careerHistory,
                            newCareerEntry(current.careerHistory.length),
                          ],
                        }))
                      }
                    >
                      Add Experience
                    </button>
                  </div>

                  <h3 className="admin-subtitle">Education</h3>
                  {draft.education.map((entry, index) => (
                    <div key={entry.educationId} className="entry-block">
                      <div className="profile-grid">
                        <label className="profile-field">
                          <span>School</span>
                          <input
                            value={entry.institution}
                            placeholder={PLACEHOLDERS.school}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setDraft((current) => ({
                                ...current,
                                education: current.education.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          institution: event.target.value,
                                        }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label className="profile-field">
                          <span>Degree</span>
                          <input
                            value={entry.degree}
                            placeholder={PLACEHOLDERS.degree}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setDraft((current) => ({
                                ...current,
                                education: current.education.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, degree: event.target.value }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label className="profile-field">
                          <span>Field of Study</span>
                          <input
                            value={entry.field}
                            placeholder={PLACEHOLDERS.fieldOfStudy}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setDraft((current) => ({
                                ...current,
                                education: current.education.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, field: event.target.value }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <div className="profile-field">
                          <span>Period</span>
                          <PeriodDateControl
                            startValue={entry.startDate}
                            endValue={entry.endDate}
                            startPlaceholder={PLACEHOLDERS.periodStart}
                            endPlaceholder={PLACEHOLDERS.periodEnd}
                            onStartChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                education: current.education.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, startDate: value }
                                      : item,
                                ),
                              }))
                            }
                            onEndChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                education: current.education.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, endDate: value }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="section-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          education: [
                            ...current.education,
                            newEducationEntry(current.education.length),
                          ],
                        }))
                      }
                    >
                      Add Education
                    </button>
                  </div>

                  <div className="section-actions section-actions-end">
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={saving}
                      onClick={() => void clearSelectedProfile()}
                    >
                      Clear Profile
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={saving}
                      onClick={() => void saveSelectedProfile()}
                    >
                      {saving ? "Saving…" : "Save User Profile"}
                    </button>
                  </div>
                  {message ? (
                    <p className="profile-save-status">{message}</p>
                  ) : null}
                  {error ? <p className="error">{error}</p> : null}
                </>
              ) : (
                <p className="hint">No user accounts available.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
