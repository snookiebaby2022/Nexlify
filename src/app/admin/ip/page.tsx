import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin/management/blocked-ips");
}
