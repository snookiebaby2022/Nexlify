import { PanelMigrateForm } from "@/components/panel-migrate-form";
import { PanelAdvantages } from "@/components/panel-advantages";

export default function PanelMigratePage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Panel migration</h1>
        <p className="text-sm opacity-70">
          Move lines, bouquets, streams, and MAG from XUI.one, 1-stream (PostgreSQL live), Xtream UI, or
          Midnight Streamers.
        </p>
      </div>
      <PanelAdvantages />
      <PanelMigrateForm />
    </div>
  );
}
