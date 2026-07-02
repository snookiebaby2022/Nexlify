import { Suspense } from "react";
import AdminVideoLogPage from "@/components/admin-videolog-page";

export default function VideoLogPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm p-6" style={{ color: "var(--muted)" }}>
          Loading video log…
        </p>
      }
    >
      <AdminVideoLogPage />
    </Suspense>
  );
}
