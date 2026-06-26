import { redirect } from "next/navigation";

export default function GroupRedirect() {
  redirect("/admin/management/groups/add");
}
