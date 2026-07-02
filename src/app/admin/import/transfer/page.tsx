import { PanelTransferTools } from "@/components/panel-transfer-tools";

export default function PanelTransferPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Panel transfer</h1>
        <p className="text-sm opacity-70">
          Export lines, streams, bouquets, resellers, and providers from this panel — or import a
          Nexlify transfer file from another panel.
        </p>
      </div>
      <PanelTransferTools />
    </div>
  );
}
