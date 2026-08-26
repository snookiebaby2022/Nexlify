import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getResellerGroupFlags } from "@/lib/reseller-group-flags";
import { ResellerApiInfoPage } from "@/components/reseller-api-info-page";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  const flags = await getResellerGroupFlags(session.id);
  if (!flags.showStreamingApi) redirect("/reseller/dashboard");
  return <ResellerApiInfoPage />;
}
