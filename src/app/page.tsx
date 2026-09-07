import Link from "next/link";
import { redirect } from "next/navigation";
import ResumeForm from "@/components/ResumeForm";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { isProfileReady } from "@/lib/profile";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ready = isProfileReady(user.profile);

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <SiteHeader email={user.email} profile={user.profile} active="generate" />
      <main className="main">
        {!ready && (
          <p className="notice">
            Add your name and at least one job in{" "}
            <Link href="/profile">your profile</Link> before generating packages.
          </p>
        )}
        <ResumeForm canGenerate={ready} />
      </main>
    </div>
  );
}
