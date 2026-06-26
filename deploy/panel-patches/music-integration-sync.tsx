// Snippet to add to music-integration-page.tsx after testConnection function:

  async function syncToPanel() {
    if (!row) {
      setMsg("Save integration first.");
      return;
    }
    setMsg("Syncing to panel streams…");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id: row.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Sync failed");
      return;
    }
    setMsg(
      `Synced ${data.imported ?? 0} item(s) into bouquet “Plugin imports”. Assign that bouquet to lines if needed.`
    );
    load();
  }

// Add button next to Test connection:
// <button type="button" className="btn-positive rounded px-4 py-2 text-sm cursor-pointer" onClick={syncToPanel}>
//   Sync to panel
// </button>
