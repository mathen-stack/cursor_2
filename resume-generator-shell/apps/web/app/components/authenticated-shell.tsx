"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type SessionUser = {
  username: string;
  displayName: string;
  role: "admin" | "user";
};

export default function AuthenticatedShell({
  children,
}: {
  children: (input: {
    user: SessionUser;
    logout: () => Promise<void>;
  }) => ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          user?: SessionUser | null;
          error?: { message?: string };
        };
        if (!response.ok || !payload.user) {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          router.replace("/login");
          return;
        }
        if (!cancelled) setUser(payload.user);
      } catch {
        if (!cancelled) {
          setError("Could not verify login session.");
          router.replace("/login");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="page">
        <div className="atmosphere" aria-hidden />
        <main className="main">
          <p className="hint">Checking login…</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <div className="atmosphere" aria-hidden />
        <main className="main">
          <p className="error">{error || "Redirecting to sign in…"}</p>
        </main>
      </div>
    );
  }

  return <>{children({ user, logout })}</>;
}
