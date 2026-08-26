"use client";

import { createContext, useContext } from "react";
import {
  DEFAULT_RESELLER_GROUP_FLAGS,
  type ResellerGroupFlags,
} from "@/lib/reseller-group-flags";

const ResellerGroupFlagsContext = createContext<ResellerGroupFlags>(DEFAULT_RESELLER_GROUP_FLAGS);

export function ResellerGroupFlagsProvider({
  flags,
  children,
}: {
  flags: ResellerGroupFlags;
  children: React.ReactNode;
}) {
  return (
    <ResellerGroupFlagsContext.Provider value={flags}>{children}</ResellerGroupFlagsContext.Provider>
  );
}

export function useResellerGroupFlags(): ResellerGroupFlags {
  return useContext(ResellerGroupFlagsContext);
}
