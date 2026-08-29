"use client";

type ListPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  noun?: string;
};

export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun = "entries",
}: ListPaginationProps) {
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * size + 1;
  const to = Math.min(safePage * size, total);

  function go(next: number) {
    const clamped = Math.min(totalPages, Math.max(1, next));
    if (clamped === page) return;
    onPageChange(clamped);
  }

  return (
    <div className="xui-streams-footer">
      <span>
        {total === 0 ? `No ${noun}` : `Showing ${from} to ${to} of ${total} ${noun}`}
      </span>
      <div className="xui-streams-pagination">
        <button
          type="button"
          disabled={safePage <= 1}
          aria-label="Previous page"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            go(safePage - 1);
          }}
        >
          Previous
        </button>
        <span className="xui-streams-page-num" aria-live="polite">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          aria-label="Next page"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            go(safePage + 1);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
