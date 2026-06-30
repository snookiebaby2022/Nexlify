import { redirect } from "next/navigation";

/** XUI "recording" module maps to outbound webhooks in Nexlify. */
export default function RecordingPage() {
  redirect("/admin/webhooks");
}
