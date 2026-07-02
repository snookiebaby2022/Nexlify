export type TriState = "unchanged" | "yes" | "no";

export type TextFieldState = { unchanged: true } | { unchanged: false; value: string };

export type MassEditPatch = {
  password?: TextFieldState;
  resellerNotes?: TextFieldState;
  enabled?: TriState;
  canWatchAdult?: TriState;
  allowedCountries?: TextFieldState;
  allowedIps?: TextFieldState;
  allowedUserAgents?: TextFieldState;
  disallowedUserAgents?: TextFieldState;
  allowedOutputs?: TextFieldState;
  lockToIp?: TriState;
};

export function splitLineNotes(notes: string | null | undefined) {
  if (!notes?.trim()) return { admin: "", reseller: "" };
  const parts = notes.split("\n---\n");
  return { admin: parts[0]?.trim() ?? "", reseller: parts[1]?.trim() ?? "" };
}

export function mergeResellerNotes(existing: string | null | undefined, reseller: string) {
  const { admin } = splitLineNotes(existing);
  if (admin) return `${admin}\n---\n${reseller}`;
  return reseller;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** XUI-style expire: DD.MM.YYYY HH:mm:ss with human-relative suffix */
export function formatMassEditExpire(iso: string) {
  const exp = new Date(iso);
  const now = new Date();
  const dateTime = `${pad2(exp.getDate())}.${pad2(exp.getMonth() + 1)}.${exp.getFullYear()} ${pad2(exp.getHours())}:${pad2(exp.getMinutes())}:${pad2(exp.getSeconds())}`;

  const diffMs = exp.getTime() - now.getTime();
  const expired = diffMs < 0;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);
  const absMin = Math.floor(absSec / 60);
  const absHr = Math.floor(absMin / 60);
  const absDay = Math.floor(absHr / 24);
  const absMonth = Math.floor(absDay / 30);
  const absYear = Math.floor(absDay / 365);

  let relative: string;
  if (expired) {
    if (absHr < 1) {
      const m = Math.max(1, absMin);
      relative = `${m} minute${m === 1 ? "" : "s"} ago`;
    } else if (absHr < 24) {
      relative = `${absHr} hour${absHr === 1 ? "" : "s"} ago`;
    } else if (absDay < 30) {
      relative = `${absDay} day${absDay === 1 ? "" : "s"} ago`;
    } else if (absDay < 365) {
      relative = `${absMonth} month${absMonth === 1 ? "" : "s"} ago`;
    } else {
      relative = `${absYear} year${absYear === 1 ? "" : "s"} ago`;
    }
  } else if (absYear >= 2) {
    relative = `in ${absYear} years`;
  } else if (absYear >= 1) {
    relative = "in a year";
  } else if (absMonth >= 2) {
    relative = `in ${absMonth} months`;
  } else if (absMonth >= 1) {
    relative = "in a month";
  } else if (absDay >= 2) {
    relative = `in ${absDay} days`;
  } else if (absDay >= 1) {
    relative = "in a day";
  } else if (absHr >= 2) {
    relative = `in ${absHr} hours`;
  } else if (absHr >= 1) {
    relative = "in an hour";
  } else {
    const m = Math.max(1, absMin);
    relative = `in ${m} minute${m === 1 ? "" : "s"}`;
  }

  return { dateTime, relative, expired };
}
