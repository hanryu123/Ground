import { isAdminAuthenticated } from "@/lib/adminAuth";
import { LoginGate } from "./LoginGate";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "GROUND · Admin",
  description: "Curate the home screen poster — Master & Publish.",
};

export default async function AdminPage() {
  const authed = await isAdminAuthenticated();
  if (!authed) return <LoginGate />;
  return <AdminDashboard />;
}
