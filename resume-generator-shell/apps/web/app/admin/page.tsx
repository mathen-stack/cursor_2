import AdminProfilesClient from "./admin-client";

export const metadata = {
  title: "Database | Resume Tailor",
  description: "Administrator database for user accounts and saved profiles.",
};

export default function AdminPage() {
  return <AdminProfilesClient />;
}

