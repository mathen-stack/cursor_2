import { Suspense } from "react";
import LoginPage from "./login-client";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="page login-page">
          <div className="atmosphere" aria-hidden />
          <main className="login-main">
            <section className="login-card">
              <p className="brand login-brand">Resume Tailor</p>
              <p className="hint">Loading sign-in…</p>
            </section>
          </main>
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
