import { MassDeletePanel } from "@/components/mass-delete-panel";

export default function MassDeleteLinesPage() {
  return <MassDeletePanel entity="lines" title="Mass delete — lines" loadUrl="/api/admin/lines" labelKey="username" />;
}
