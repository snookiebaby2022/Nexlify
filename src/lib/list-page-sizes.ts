/** Shared list pagination defaults for admin/reseller tables. */
export const DEFAULT_LIST_PAGE_SIZE = 50;
export const LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];
