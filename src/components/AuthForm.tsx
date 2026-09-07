"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (isSignup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Request failed.");
      }
      const target =
        nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      router.push(isSignup ? "/profile" : target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card composer" onSubmit={onSubmit}>
      <div className="section-head">
        <div>
          <h2>{isSignup ? "Create account" : "Sign in"}</h2>
          <p className="hint">
            {isSignup
              ? "Save your profile and generate tailored resume packages."
              : "Use the email and password for your Resume Tailor account."}
          </p>
        </div>
      </div>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {isSignup && (
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <div className="composer-footer">
        <button type="submit" className="primary" disabled={loading}>
          {loading
            ? isSignup
              ? "Creating…"
              : "Signing in…"
            : isSignup
              ? "Sign up"
              : "Sign in"}
        </button>
        <p className="inline-status">
          {isSignup ? (
            <>
              Already have an account? <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/signup">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
