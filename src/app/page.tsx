import ResumeForm from "@/components/ResumeForm";
import SignOutButton from "@/components/SignOutButton";
import { requireSession } from "@/app/actions/auth";
import { findUserById, profileFromUser } from "@/lib/users";

export default async function Home() {
  const session = await requireSession();
  const user = await findUserById(session.userId);

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">
              ATS packets from your background and a job description
            </p>
          </div>
          <div className="session-box">
            <p className="session-name">{session.name}</p>
            <p className="session-email">{session.email}</p>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="main">
        <ResumeForm initialProfile={profileFromUser(user)} />
      </main>
    </div>
  );
}
