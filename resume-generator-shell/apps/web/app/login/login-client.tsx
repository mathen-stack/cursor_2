"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => {
    const value = searchParams.get("next");
    return value && value.startsWith("/") ? value : "/";
  }, [searchParams]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        user?: { username: string };
      };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error?.message ?? "Login failed.");
      }
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="atmosphere" aria-hidden />
      <main className="login-main">
        <section className="login-card" aria-labelledby="login-title">
          <p className="brand login-brand">Resume Tailor</p>
          <h1 id="login-title">Sign in</h1>
          <p className="hint">
            Log in to load your saved profile and generate resumes.
          </p>

          <form className="login-form" onSubmit={onSubmit}>
            <label className="profile-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Enter your username"
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
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error ? <p className="error">{error}</p> : null}

            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="login-demo-hint">
            Demo user: <code>demo</code> / <code>demo123</code>
            <br />
            Admin: <code>admin</code> / <code>admin123</code>
          </p>
        </section>
      </main>
    </div>
  );
}
