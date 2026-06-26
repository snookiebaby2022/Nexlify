from pathlib import Path

path = Path("/home/nexlify-panel/src/middleware.ts")
text = path.read_text(encoding="utf-8")

bad = """import {
  
  isPanelLicenseExempt,
  
import {
  isPanelDemoHost,
  isDemoPlaybackPath,
  isDemoMutationAllowed,
  demoModeBlockedResponse,
} from "@/lib/panel-demo-mode";
} from "@/lib/panel-demo-host";"""

good = """import { isPanelLicenseExempt } from "@/lib/panel-demo-host";
import {
  isPanelDemoHost,
  isDemoPlaybackPath,
  isDemoMutationAllowed,
  demoModeBlockedResponse,
} from "@/lib/panel-demo-mode";"""

if bad not in text:
    raise SystemExit("bad import block not found — fix middleware manually")

path.write_text(text.replace(bad, good), encoding="utf-8")
print("fixed imports")
