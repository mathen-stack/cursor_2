import ResumeGenerator from "./components/resume-generator";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="hero">
        <p className="brand">Resume Generator</p>
        <p className="hero-copy">
          Paste a job description, add your career history, and get a complete
          ATS-ready resume shaped to that role.
        </p>
      </header>
      <ResumeGenerator />
    </main>
  );
}
