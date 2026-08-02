"use client";

import AuthenticatedShell from "./authenticated-shell";
import BaseResumeTailor from "./base-resume-tailor";

export default function TailorApp() {
  return (
    <AuthenticatedShell>
      {({ user, logout }) => (
        <BaseResumeTailor user={user} onLogout={logout} />
      )}
    </AuthenticatedShell>
  );
}
