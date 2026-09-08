import ResumeForm from "@/components/ResumeForm";

export default function Home() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">ATS packets from your background and a job description</p>
          </div>
        </div>
      </header>

      <main className="main">
        <ResumeForm />
      </main>
    </div>
  );
}
