import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="main auth-main">
        <p className="brand">Resume Tailor</p>
        <p className="brand-sub auth-lead">Sign in to generate ATS packages from your profile.</p>
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </main>
    </div>
  );
}
