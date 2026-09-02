import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value) q.set(key, value);
    else if (Array.isArray(value)) {
      for (const v of value) {
        if (v) q.append(key, v);
      }
    }
  }
  const suffix = q.toString();
  redirect(suffix ? `/reseller/lines?${suffix}` : "/reseller/lines");
}
