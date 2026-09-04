import { redirect } from "next/navigation";

export default function StreamHealthPage() {
  redirect("/admin/stream_errors?kind=unstable");
}
