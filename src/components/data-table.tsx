function headerLabel(h: string | React.ReactNode, i: number) {
  return typeof h === "string" ? h : `Column ${i + 1}`;
}

export function DataTable({
  headers,
  rows,
}: {
  headers: (string | React.ReactNode)[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <div className="md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No records yet
          </p>
        ) : (
          rows.map((row, i) => (
            <article key={i} className="panel-mobile-card p-4 space-y-2.5">
              {row.map((cell, j) => {
                const label = headerLabel(headers[j], j);
                if (j === 0) {
                  return (
                    <div key={j} className="font-medium text-base pb-1 border-b" style={{ borderColor: "var(--border)" }}>
                      {cell}
                    </div>
                  );
                }
                if (cell == null || cell === "" || cell === "—") return null;
                return (
                  <div key={j} className="flex justify-between gap-3 text-sm items-start">
                    <span className="shrink-0 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      {label}
                    </span>
                    <span className="text-right min-w-0 break-words">{cell}</span>
                  </div>
                );
              })}
            </article>
          ))
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--bg-card)" }}>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={typeof h === "string" ? h : `col-${i}`}
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: "var(--muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-8 text-center"
                  style={{ color: "var(--muted)" }}
                >
                  No records yet
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`px-4 py-3 ${j >= headers.length - 2 ? "relative overflow-visible" : ""}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
