import ResumeGenerator from "./components/resume-generator";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="hero">
        <p className="brand">Resume Generator</p>
        <p className="hero-copy">
          Shape one job description into a clean, ATS-ready resume—composed on
          the left, previewed like paper on the right.
        </p>
      </header>
      <ResumeGenerator />
    </main>
  );
}
