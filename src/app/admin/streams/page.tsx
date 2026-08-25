import { redirect } from "next/navigation";

/** Legacy /admin/streams → manage live streams (preserve ?status= etc.). */
export default async function LegacyStreamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((v) => q.append(key, v));
    else q.set(key, value);
  }
  const qs = q.toString();
  redirect(qs ? `/admin/content/streams?${qs}` : "/admin/content/streams");
}
