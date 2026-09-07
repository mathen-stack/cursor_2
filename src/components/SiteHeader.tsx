"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CandidateProfile } from "@/lib/types";

export default function SiteHeader({
  email,
  profile,
  active,
}: {
  email: string;
  profile: CandidateProfile;
  active: "generate" | "profile";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const name = profile.personal.name.trim() || email;

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-block">
          <p className="brand">Resume Tailor</p>
          <p className="brand-sub">ATS packets from job URLs</p>
          <nav className="site-nav" aria-label="Main">
            <Link
              className={active === "generate" ? "nav-link active" : "nav-link"}
              href="/"
            >
              Generate
            </Link>
            <Link
              className={active === "profile" ? "nav-link active" : "nav-link"}
              href="/profile"
            >
              Profile
            </Link>
            <button type="button" className="nav-link nav-button" onClick={() => void logout()} disabled={busy}>
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </nav>
        </div>
        <div className="identity">
          <p className="identity-name">{name}</p>
          <p className="identity-meta">
            {(profile.headline || "Add a headline").trim()}
            {profile.personal.location ? ` · ${profile.personal.location}` : ""}
          </p>
          <p className="identity-contact">
            {profile.personal.email ? (
              <a href={`mailto:${profile.personal.email}`}>{profile.personal.email}</a>
            ) : (
              <span>{email}</span>
            )}
            {profile.personal.phone ? (
              <>
                <span aria-hidden>·</span>
                <a href={`tel:${profile.personal.phone.replace(/\s+/g, "")}`}>
                  {profile.personal.phone}
                </a>
              </>
            ) : null}
            {profile.personal.linkedin ? (
              <>
                <span aria-hidden>·</span>
                <a href={profile.personal.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </header>
  );
}
