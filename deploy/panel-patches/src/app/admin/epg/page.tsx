import { redirect } from "next/navigation";

export default function LegacyEpgPage() {
  redirect("/admin/epg/sources");
}
