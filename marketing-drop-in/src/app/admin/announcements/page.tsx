import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pageSeo } from "@/lib/seo-pages";
import { AdminAnnouncements } from "@/components/AdminAnnouncements";

export const metadata = pageSeo("/admin");

export default async function AdminAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/announcements");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="mesh-bg mx-auto max-w-4xl px-4 py-16 md:py-24">
      <div className="mb-10">
        <h1 className="font-display text-3xl font-bold text-white">Announcements</h1>
        <p className="mt-2 text-[var(--muted)]">
          Create site-wide banners visible to all visitors.
        </p>
      </div>
      <AdminAnnouncements />
    </div>
  );
}
