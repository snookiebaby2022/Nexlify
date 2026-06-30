/** Stable UTC formatting — same output on server and client */
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDateTime(iso: string) {
  return dateTimeFmt.format(new Date(iso));
}

export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

export function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return sec <= 5 ? "just now" : `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "a minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return hr === 1 ? "an hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return day === 1 ? "a day ago" : `${day} days ago`;
  return formatDateTime(iso);
}

export function formatExpireXui(iso: string) {
  const exp = new Date(iso);
  const now = new Date();
  const years = (exp.getTime() - now.getTime()) / (86400000 * 365);
  if (years > 8) return { kind: "unlimited" as const, text: "UNLIMITED" };

  const dateStr = [
    String(exp.getUTCDate()).padStart(2, "0"),
    String(exp.getUTCMonth() + 1).padStart(2, "0"),
    exp.getUTCFullYear(),
  ].join(".");

  if (exp < now) {
    const days = Math.floor((now.getTime() - exp.getTime()) / 86400000);
    return { kind: "expired" as const, text: `${dateStr} (${days} day${days === 1 ? "" : "s"} ago)` };
  }

  const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
  let rel = "";
  if (days >= 365) {
    const y = Math.round(days / 365);
    rel = y === 1 ? "in a year" : `in ${y} years`;
  } else if (days >= 30) {
    const m = Math.round(days / 30);
    rel = m === 1 ? "in a month" : `in ${m} months`;
  } else if (days >= 1) {
    rel = days === 1 ? "in a day" : `in ${days} days`;
  } else {
    rel = "today";
  }
  return { kind: "active" as const, text: `${dateStr} (${rel})` };
}
