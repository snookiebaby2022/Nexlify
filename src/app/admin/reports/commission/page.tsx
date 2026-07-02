"use client";



import { useEffect, useState } from "react";



export default function CommissionReportPage() {

  const [from, setFrom] = useState(() => {

    const d = new Date(Date.now() - 90 * 86400000);

    return d.toISOString().slice(0, 10);

  });

  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [data, setData] = useState<{

    summary: { lines: number; totalEstimatedProfitCredits: number };

    rows: {

      lineUsername: string;

      owner: string;

      status: string;

      daysActive: number;

      estimatedProfitCredits: number;

    }[];

  } | null>(null);



  function load() {

    const params = new URLSearchParams({ from, to });

    fetch(`/api/admin/commission-report?${params}`)

      .then((r) => r.json())

      .then(setData);

  }



  useEffect(() => {

    load();

  }, [from, to]);



  function exportCsv() {

    if (!data?.rows.length) return;

    const header = "line,owner,status,days_active,est_profit_credits\n";

    const body = data.rows

      .map(

        (r) =>

          `${r.lineUsername},${r.owner},${r.status},${r.daysActive},${r.estimatedProfitCredits}`

      )

      .join("\n");

    const blob = new Blob([header + body], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = `commission-report-${from}-${to}.csv`;

    a.click();

    URL.revokeObjectURL(url);

  }



  if (!data) {

    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading commission report…</p>;

  }



  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-2xl font-semibold">Reseller commission / profit</h1>

        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>

          Estimated profit credits by line and owner for the selected date range.

        </p>

      </div>



      <div className="flex flex-wrap gap-3 items-end">

        <label className="text-sm">

          <span style={{ color: "var(--muted)" }}>From</span>

          <input

            type="date"

            className="block mt-1 rounded border px-2 py-1.5 bg-transparent"

            style={{ borderColor: "var(--border)" }}

            value={from}

            onChange={(e) => setFrom(e.target.value)}

          />

        </label>

        <label className="text-sm">

          <span style={{ color: "var(--muted)" }}>To</span>

          <input

            type="date"

            className="block mt-1 rounded border px-2 py-1.5 bg-transparent"

            style={{ borderColor: "var(--border)" }}

            value={to}

            onChange={(e) => setTo(e.target.value)}

          />

        </label>

        <button

          type="button"

          onClick={exportCsv}

          className="rounded px-4 py-2 text-sm border cursor-pointer"

          style={{ borderColor: "var(--border)" }}

        >

          Export CSV

        </button>

      </div>



      <div className="grid sm:grid-cols-2 gap-4 max-w-xl">

        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>

          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>

            Lines

          </div>

          <div className="text-2xl font-semibold">{data.summary.lines}</div>

        </div>

        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>

          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>

            Est. profit (credits)

          </div>

          <div className="text-2xl font-semibold">{data.summary.totalEstimatedProfitCredits}</div>

        </div>

      </div>



      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>

        <table className="w-full text-sm">

          <thead>

            <tr style={{ background: "var(--bg-card)" }}>

              <th className="text-left p-3">Line</th>

              <th className="text-left p-3">Owner</th>

              <th className="text-left p-3">Status</th>

              <th className="text-right p-3">Days active</th>

              <th className="text-right p-3">Est. profit</th>

            </tr>

          </thead>

          <tbody>

            {data.rows.slice(0, 200).map((r) => (

              <tr key={r.lineUsername} className="border-t" style={{ borderColor: "var(--border)" }}>

                <td className="p-3">{r.lineUsername}</td>

                <td className="p-3">{r.owner}</td>

                <td className="p-3">{r.status}</td>

                <td className="p-3 text-right tabular-nums">{r.daysActive}</td>

                <td className="p-3 text-right tabular-nums">{r.estimatedProfitCredits}</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}

