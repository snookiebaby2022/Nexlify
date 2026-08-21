"use client";

import { useEffect, useState } from "react";

type StaffUser = {
  id: string;
  username: string;
  permissions: string[];
  isActive: boolean;
};

export default function StaffPermissionsPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [presets, setPresets] = useState<Record<string, string[]>>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [preset, setPreset] = useState("support_agent");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/admin/staff");
    if (!res.ok) return;
    const data = await res.json();
    setStaff(data.staff ?? []);
    setPresets(data.presets ?? {});
  }

  useEffect(() => {
    void load();
  }, []);

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", username, password, preset }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setMessage(`Created ${data.user.username}. Password: ${data.password}`);
    setUsername("");
    setPassword("");
    void load();
  }

  return (
    <div className="xui-page">
      <h1 className="xui-page-title">Staff & Permissions</h1>
      <p className="xui-muted">
        Create support agents, content admins, and other staff with fine-grained module access.
      </p>

      <form onSubmit={createStaff} className="xui-card xui-stack" style={{ maxWidth: 520, marginTop: 16 }}>
        <h2>Create staff user</h2>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Preset
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {Object.keys(presets).map((key) => (
              <option key={key} value={key}>
                {key.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="xui-btn xui-btn-primary">
          Create staff
        </button>
        {message ? <p>{message}</p> : null}
      </form>

      <div className="xui-card" style={{ marginTop: 24 }}>
        <h2>Staff accounts</h2>
        <ul>
          {staff.map((u) => (
            <li key={u.id}>
              <strong>{u.username}</strong> — {u.permissions.length} permissions
            </li>
          ))}
          {staff.length === 0 ? <li>No staff users yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
