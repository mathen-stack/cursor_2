"use client";

import AuthenticatedShell from "./authenticated-shell";
import ResumeGenerator from "./resume-generator";

export default function AuthenticatedApp() {
  return (
    <AuthenticatedShell>
      {({ user, logout }) => (
        <ResumeGenerator user={user} onLogout={logout} />
      )}
    </AuthenticatedShell>
  );
}
