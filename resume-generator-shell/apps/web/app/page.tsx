import ResumeGenerator from "./components/resume-generator";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 80px" }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>Resume Generator</p>
        <h1 style={{ margin: 0, fontSize: 38 }}>JD-Isolated Complete Resume Pipeline</h1>
        <p style={{ maxWidth: 820, lineHeight: 1.6 }}>
          One immutable job description is processed independently by the Summary,
          Skills, Experience, and Template engines. The final assembler combines
          approved outputs unchanged with user-entered contact and education data.
        </p>
      </header>
      <ResumeGenerator />
    </main>
  );
}
