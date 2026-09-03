import { redirect } from "next/navigation";

export default function StreamErrorsPage() {
  redirect("/admin/content/streams?status=offline");
}
