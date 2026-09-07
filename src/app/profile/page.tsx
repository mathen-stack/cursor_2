import { redirect } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { createBlankProfile } from "@/lib/profile";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <SiteHeader email={user.email} profile={user.profile} active="profile" />
      <main className="main">
        <ProfileForm
          initial={user.profile.personal.name ? user.profile : createBlankProfile(user.email)}
          accountEmail={user.email}
        />
      </main>
    </div>
  );
}
