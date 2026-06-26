import { redirect } from "next/navigation";

export default function MassEditLinesRedirect() {
  redirect("/admin/lines/mass-edit");
}
