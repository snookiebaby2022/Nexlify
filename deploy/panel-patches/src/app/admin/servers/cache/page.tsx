import { redirect } from "next/navigation";

export default function ServersCacheRedirect() {
  redirect("/admin/settings/cache");
}
