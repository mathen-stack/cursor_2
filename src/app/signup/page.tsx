import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="main auth-main">
        <p className="brand">Resume Tailor</p>
        <p className="brand-sub auth-lead">Create an account, then enter the profile to tailor.</p>
        <Suspense>
          <AuthForm mode="signup" />
        </Suspense>
      </main>
    </div>
  );
}
