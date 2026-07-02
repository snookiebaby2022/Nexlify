import { createPrivateKey, sign } from "crypto";
import fs from "fs";
import path from "path";

export function loadPrivateKeyPem() {
  const fromEnv = process.env.LICENSE_SERVER_PRIVATE_PEM?.trim();
  if (fromEnv) return fromEnv;
  const privPath = path.join(process.cwd(), ".license-keys", "private.pem");
  if (!fs.existsSync(privPath)) {
    throw new Error(
      "Missing .license-keys/private.pem — run npm run license:setup or set LICENSE_SERVER_PRIVATE_PEM"
    );
  }
  return fs.readFileSync(privPath, "utf8");
}

export function signLicensePayload(payload) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const priv = createPrivateKey(loadPrivateKeyPem());
  const sig = sign(null, Buffer.from(payloadB64), priv);
  const key = `NXLF1.${payloadB64}.${sig.toString("base64url")}`;
  return { key, payload, exp: payload.exp };
}
