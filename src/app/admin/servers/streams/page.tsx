import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ edit?: string; returnTo?: string }> };

/** Legacy full-page editor — open the manage-streams box instead. */
export default async function ServerStreamsPage({ searchParams }: Props) {
  const { edit, returnTo } = await searchParams;
  const dest =
    returnTo?.startsWith("/admin/") && !returnTo.startsWith("//")
      ? returnTo
      : "/admin/content/streams";
  const url = new URL(dest, "http://nexlify.local");
  if (edit?.trim()) url.searchParams.set("edit", edit.trim());
  redirect(`${url.pathname}${url.search}`);
}
