import { redirect } from "next/navigation";

export default function LegacyStreamsPage() {
  redirect("/admin/servers/streams");
}
