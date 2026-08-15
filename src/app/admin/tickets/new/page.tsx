import { redirect } from "next/navigation";

/** Admins manage reseller/end-user tickets — do not create tickets as admin. */
export default function AdminNewTicketRedirect() {
  redirect("/admin/tickets?status=OPEN");
}
