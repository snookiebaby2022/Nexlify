"use client";

const PAGE_SIZES = [10, 25, 50, 100] as const;

type TablePagerProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  disabled?: boolean;
};

export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled,
}: TablePagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div
      className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 px-1 py-2 text-sm"
      style={{ color: "var(--muted)" }}
    >
      <label className="flex items-center gap-2">
        Show
        <select
          className="panel-select rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border)", background: "#fff", color: "#111" }}
          value={pageSize}
          disabled={disabled}
          onChange={(e) => {
            onPageSizeChange(parseInt(e.target.value, 10));
            onPageChange(1);
          }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        entries
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <span>
          {total === 0
            ? "No entries"
            : `Showing ${start} to ${end} of ${total} entries`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled || safePage <= 1}
            className="rounded border px-3 py-2 text-sm disabled:opacity-40 cursor-pointer min-w-[4.5rem]"
            style={{ borderColor: "var(--border)" }}
            onClick={() => onPageChange(safePage - 1)}
          >
            Prev
          </button>
          <span className="px-2 text-xs tabular-nums">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={disabled || safePage >= totalPages}
            className="rounded border px-3 py-2 text-sm disabled:opacity-40 cursor-pointer min-w-[4.5rem]"
            style={{ borderColor: "var(--border)" }}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
