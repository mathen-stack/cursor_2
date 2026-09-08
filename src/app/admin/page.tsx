import AdminPanel from "@/components/AdminPanel";
import SiteHeader from "@/components/SiteHeader";
import { requireAdmin } from "@/app/actions/auth";
import { listPublicUsers } from "@/lib/users";

export const metadata = {
  title: "Admin | Resume Tailor",
  description: "Administrator database for user accounts and saved profiles.",
};

export default async function AdminPage() {
  const { session, user } = await requireAdmin();
  const users = await listPublicUsers();

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <SiteHeader
        name={session.name}
        email={session.email}
        isAdmin
        current="admin"
      />
      <main className="main admin-main">
        <AdminPanel adminId={user.id} initialUsers={users} />
      </main>
    </div>
  );
}
