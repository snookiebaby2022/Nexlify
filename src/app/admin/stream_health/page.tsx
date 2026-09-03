import { redirect } from "next/navigation";

export default function StreamHealthPage() {
  redirect("/admin/content/streams?status=offline&sourceIssue=unstable");
}
