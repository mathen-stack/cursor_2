import AuthenticatedApp from "./components/authenticated-app";

export const metadata = {
  title: "Home | Resume Tailor",
  description:
    "Paste a job description and generate an ATS-optimized, JD-isolated resume.",
};

export default function HomePage() {
  return <AuthenticatedApp />;
}

