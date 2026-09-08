import { AdminLinesClient } from "./lines-client";

export default async function AdminLinesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const sp = await searchParams;
  return <AdminLinesClient editId={sp.edit ?? null} />;
}
