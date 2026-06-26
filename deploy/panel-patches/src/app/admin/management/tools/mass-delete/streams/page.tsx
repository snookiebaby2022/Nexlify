import { redirect } from "next/navigation";

export default function MassDeleteStreamsRedirect() {
  redirect("/admin/management/tools/mass-delete/live");
}
