export type SubscriptionPaths = {
  isReseller: boolean;
  lines: string;
  connections: string;
  magList: string;
  magAdd: string;
  magBulk: string;
  magConvert: string;
  magEdit: (id: string) => string | null;
  enigmaList: string;
  enigmaAdd: string;
  enigmaBulk: string | null;
  enigmaEdit: (id: string) => string | null;
  streamEdit: (id: string) => string | null;
};

export function subscriptionPaths(pathname: string): SubscriptionPaths {
  if (pathname.startsWith("/reseller")) {
    return {
      isReseller: true,
      lines: "/reseller/lines",
      connections: "/reseller/live_connections",
      magList: "/reseller/mags",
      magAdd: "/reseller/mags/add",
      magBulk: "/reseller/mags/bulk",
      magConvert: "/reseller/mags/convert-to-line",
      magEdit: () => null,
      enigmaList: "/reseller/enigmas",
      enigmaAdd: "/reseller/enigmas/add",
      enigmaBulk: null,
      enigmaEdit: () => null,
      streamEdit: () => null,
    };
  }
  return {
    isReseller: false,
    lines: "/admin/lines",
    connections: "/admin/connections",
    magList: "/admin/mag",
    magAdd: "/admin/mag/add",
    magBulk: "/admin/mag/bulk",
    magConvert: "/admin/mag/convert-to-line",
    magEdit: (id) => `/admin/mag/${id}/edit`,
    enigmaList: "/admin/enigmas",
    enigmaAdd: "/admin/enigmas/add",
    enigmaBulk: "/admin/enigmas/bulk",
    enigmaEdit: (id) => `/admin/enigmas/${id}/edit`,
    streamEdit: (id) => `/admin/servers/streams?edit=${id}`,
  };
}
