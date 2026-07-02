import { redirect } from "next/navigation";

export default function GroupsRedirect() {
  redirect("/admin/management/groups");
}
