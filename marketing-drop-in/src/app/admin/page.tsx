import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { getSessionUser } from "@/lib/auth";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/admin");

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="mesh-bg mx-auto max-w-6xl px-4 py-16 md:py-24">
      <div className="mb-10">
        <h1 className="font-display text-3xl font-bold text-white">Admin</h1>
        <p className="mt-2 text-[var(--muted)]">
          Licenses, orders, users, support, newsletter, and marketing analytics.
        </p>
      </div>

      <AdminDashboard />
    </div>
  );
}
