import { spawn } from "child_process";
import bcrypt from "bcryptjs";
import { BCRYPT_HASH_RE, secretsEqual } from "@/lib/secrets-equal";

/** XUI / Xtream / glibc SHA-512 crypt (`$6$` / `$6$rounds=N$`). */
export const SHA512_CRYPT_RE = /^\$6\$(?:rounds=\d+\$)?[^$]+\$[./A-Za-z0-9]+$/;

/** True when the string is already a password hash (do not bcrypt again on migrate). */
export function isPrehashedPassword(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (BCRYPT_HASH_RE.test(v)) return true;
  if (v.startsWith("$6$")) return true;
  if (v.startsWith("$1$") || v.startsWith("$5$")) return true;
  // 32-char hex MD5 common in older panels
  if (/^[a-fA-F0-9]{32}$/.test(v)) return true;
  return false;
}

/**
 * Verify a password against bcrypt or SHA-512 crypt (XUI reseller hashes).
 * Uses python3 crypt(3) for `$6$` so rounds=20000$xui$ salts match glibc.
 */
export async function verifyStoredPassword(password: string, storedHash: string): Promise<boolean> {
  const hash = storedHash.trim();
  if (!password || !hash) return false;

  if (BCRYPT_HASH_RE.test(hash)) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  if (hash.startsWith("$6$")) {
    return verifySha512CryptPython(password, hash);
  }

  // Last resort: constant-time compare for accidental plaintext storage
  return secretsEqual(password, hash);
}

function verifySha512CryptPython(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      "python3",
      [
        "-c",
        "import crypt,sys,os\n"
          + "h=os.environ.get('NX_HASH','')\n"
          + "p=sys.stdin.read()\n"
          + "sys.exit(0 if h and crypt.crypt(p,h)==h else 1)\n",
      ],
      {
        env: { ...process.env, NX_HASH: hash },
        stdio: ["pipe", "ignore", "ignore"],
      }
    );
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve(false);
    }, 8000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.stdin.write(password, "utf8");
    child.stdin.end();
  });
}
