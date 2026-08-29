import { redirect } from "next/navigation";

export default function LegacySourcesPage() {
  redirect("/admin/streams/sources");
}
