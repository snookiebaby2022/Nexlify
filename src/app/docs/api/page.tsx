import { redirect } from "next/navigation";
import { hreflangAlternates } from "@/lib/seo";
export const metadata = {
  alternates: hreflangAlternates("/docs/api"),
};


export default function DocsApiPage() {
  redirect("/install");
}
