"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        message?: string;
        account?: { username: string };
      };
      if (!response.ok || !payload.account) {
        throw new Error(payload.error?.message ?? "Sign up failed.");
      }
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setSuccess(
        payload.message ??
          "Account created. Wait for an administrator to approve it, then sign in.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="atmosphere" aria-hidden />
      <main className="login-main">
        <section className="login-card" aria-labelledby="signup-title">
          <p className="brand login-brand">Resume Tailor</p>
          <h1 id="signup-title">Create account</h1>
          <p className="hint">
            Sign up for an account. An administrator must approve it before you
            can sign in.
          </p>

          <form className="login-form" onSubmit={onSubmit}>
            <label className="profile-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Choose a username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
            <label className="profile-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>
            <label className="profile-field">
              <span>Confirm password</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>

            {error ? <p className="error">{error}</p> : null}
            {success ? <p className="profile-save-status">{success}</p> : null}

            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </button>
          </form>

          <p className="login-demo-hint">
            Already have an account?{" "}
            <Link href="/login" className="login-inline-link">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
