import { redirect } from "next/navigation";

/** Legacy growth /campaign URL — send to live demo. */
export default function PromoIndexPage() {
  redirect("/demo");
}
