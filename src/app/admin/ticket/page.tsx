import { redirect } from "next/navigation";

export default function AdminTicketAliasPage() {
  redirect("/admin/tickets?status=OPEN");
}
