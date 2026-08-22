import { redirect } from "next/navigation";

type Props = { params: Promise<{ folder: string }> };

export default async function ResellerContentFolderPage(_props: Props) {
  redirect("/reseller/dashboard");
}
