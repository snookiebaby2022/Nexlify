import { ResellerLinesClient } from "./lines-client";

export default async function ResellerLinesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const sp = await searchParams;
  return <ResellerLinesClient editId={sp.edit ?? null} />;
}
