#!/usr/bin/env node
/**
 * Nexlify license server — run on your MAIN panel server (vendor only).
 *
 *   LICENSE_SERVER_API_SECRET=your-secret node license-server/server.mjs
 *   # or: npm run license:server
 *
 * Customer panels: NEXLIFY_LICENSE_API_URL=http://YOUR_MAIN_IP:8787
 */
import http from "http";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveLicenseTerm } from "../scripts/license-terms.mjs";
import { signLicensePayload } from "../scripts/license-sign.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LICENSE_SERVER_PORT ?? "8787");
const API_SECRET = process.env.LICENSE_SERVER_API_SECRET?.trim() ?? "";
const DATA_FILE =
  process.env.LICENSE_SERVER_DATA ??
  path.join(__dirname, "activations.json");

function loadActivations() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return ensureAdminStatus(data);
    }
  } catch {
    /* fresh */
  }
  return { byKeyHash: {}, issued: [], adminStatus: {} };
}

function ensureAdminStatus(store) {
  if (!store.adminStatus || typeof store.adminStatus !== "object") {
    store.adminStatus = {};
  }
  return store;
}

function saveActivations(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

let store = ensureAdminStatus(loadActivations());

function parseKey(raw) {
  const key = String(raw).trim();
  if (!key.startsWith("NXLF1.")) return null;
  const rest = key.slice(6);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(rest.slice(0, dot), "base64url").toString("utf8")
    );
    return { key, payload };
  } catch {
    return null;
  }
}

function keyHash(key) {
  return createHash("sha256").update(key).digest("hex");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function checkSecret(req) {
  if (!API_SECRET) return true;
  const h = req.headers["x-license-secret"] ?? req.headers.authorization ?? "";
  const token = String(h).replace(/^Bearer\s+/i, "").trim();
  return token === API_SECRET;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const url = req.url?.split("?")[0] ?? "";

  if (req.method === "GET" && url === "/health") {
    res.end(JSON.stringify({ ok: true, service: "nexlify-license" }));
    return;
  }

  if (req.method === "GET" && url === "/v1/terms") {
    const { LICENSE_TERMS } = await import("../scripts/license-terms.mjs");
    res.end(JSON.stringify({ ok: true, terms: LICENSE_TERMS }));
    return;
  }

  if (req.method === "POST" && url === "/v1/issue") {
    if (!checkSecret(req)) {
      res.writeHead(401);
      res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
      return;
    }
    try {
      const data = JSON.parse(await readBody(req));
      const email = String(data.email ?? data.sub ?? "").trim();
      if (!email) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "email required" }));
        return;
      }
      const termCfg = resolveLicenseTerm(data.term ?? "1y");
      const bind = data.bind !== false;
      const domain = data.domain ? String(data.domain) : "";
      const lid = data.lid ?? `NX-${Date.now().toString(36)}`;
      const exp = Math.floor(Date.now() / 1000) + termCfg.days * 86400;
      const payload = {
        v: 1,
        lid,
        sub: email,
        exp,
        term: termCfg.term,
        tier: termCfg.tier,
        iat: Math.floor(Date.now() / 1000),
        ...(domain ? { dom: domain.split(",").map((d) => d.trim()) } : {}),
        ...(bind ? { iid: "BIND_ON_ACTIVATE" } : {}),
      };
      const { key } = signLicensePayload(payload);
      store.issued.push({
        lid,
        email,
        term: termCfg.term,
        issuedAt: new Date().toISOString(),
        exp: new Date(exp * 1000).toISOString(),
      });
      saveActivations(store);
      res.end(
        JSON.stringify({
          ok: true,
          license_key: key,
          term: termCfg.term,
          term_label: termCfg.label,
          expires_at: new Date(exp * 1000).toISOString(),
          lid,
        })
      );
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  if (req.method === "POST" && url === "/v1/validate") {
    try {
      const data = JSON.parse(await readBody(req));
      const parsed = parseKey(data.license_key);
      if (!parsed) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "Invalid license key" }));
        return;
      }
      const { key, payload } = parsed;
      const hash = keyHash(key);
      const instanceId = String(data.instance_id ?? "").trim();
      const admin = store.adminStatus[payload.lid];
      if (admin?.status === "REVOKED") {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, status: "REVOKED", error: "License revoked" }));
        return;
      }
      if (admin?.status === "SUSPENDED") {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, status: "SUSPENDED", error: "License suspended" }));
        return;
      }
      if (payload.exp * 1000 < Date.now()) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, status: "EXPIRED", error: "License expired" }));
        return;
      }
      const bound = store.byKeyHash[hash];
      if (bound && instanceId && bound.instanceId !== instanceId) {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            ok: false,
            error: "License activated on another server",
          })
        );
        return;
      }
      res.end(
        JSON.stringify({
          ok: true,
          status: admin?.status ?? "ACTIVE",
          lid: payload.lid,
          tier: payload.tier,
          term: payload.term,
          expires_at: new Date(payload.exp * 1000).toISOString(),
        })
      );
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  if (req.method === "POST" && url === "/v1/admin/status") {
    if (!checkSecret(req)) {
      res.writeHead(401);
      res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
      return;
    }
    try {
      const data = JSON.parse(await readBody(req));
      const status = String(data.status ?? "").toUpperCase();
      if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "status must be ACTIVE, SUSPENDED, or REVOKED" }));
        return;
      }
      let lid = String(data.lid ?? "").trim();
      if (!lid && data.license_key) {
        const parsed = parseKey(data.license_key);
        if (parsed) lid = parsed.payload.lid;
      }
      if (!lid) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "lid or license_key required" }));
        return;
      }
      store.adminStatus[lid] = {
        status,
        updatedAt: new Date().toISOString(),
      };
      saveActivations(store);
      res.end(JSON.stringify({ ok: true, lid, status }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  if (req.method === "POST" && url === "/v1/admin/clear-binding") {
    if (!checkSecret(req)) {
      res.writeHead(401);
      res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
      return;
    }
    try {
      const data = JSON.parse(await readBody(req));
      let hash = null;
      if (data.license_key) {
        const parsed = parseKey(data.license_key);
        if (parsed) hash = keyHash(parsed.key);
      }
      if (!hash && data.lid) {
        for (const [h, row] of Object.entries(store.byKeyHash)) {
          if (row.lid === data.lid) {
            hash = h;
            break;
          }
        }
      }
      if (hash && store.byKeyHash[hash]) {
        delete store.byKeyHash[hash];
        saveActivations(store);
      }
      res.end(JSON.stringify({ ok: true, cleared: Boolean(hash) }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  if (req.method === "POST" && url === "/v1/activate") {
    try {
      const data = JSON.parse(await readBody(req));
      const parsed = parseKey(data.license_key);
      if (!parsed) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "Invalid license key" }));
        return;
      }
      if (parsed.payload.exp * 1000 < Date.now()) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "License expired" }));
        return;
      }
      const hash = keyHash(parsed.key);
      const instanceId = String(data.instance_id ?? "").trim();
      if (!instanceId) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "instance_id required" }));
        return;
      }
      const prev = store.byKeyHash[hash];
      if (prev && prev.instanceId !== instanceId) {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            ok: false,
            error: "License already activated on another server",
          })
        );
        return;
      }
      store.byKeyHash[hash] = {
        instanceId,
        domain: data.domain ?? "",
        activatedAt: new Date().toISOString(),
        lid: parsed.payload.lid,
        term: parsed.payload.term,
        tier: parsed.payload.tier,
      };
      saveActivations(store);
      res.end(
        JSON.stringify({
          ok: true,
          lid: parsed.payload.lid,
          tier: parsed.payload.tier,
          term: parsed.payload.term,
          expires_at: new Date(parsed.payload.exp * 1000).toISOString(),
        })
      );
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Nexlify license server listening on 0.0.0.0:${PORT}`);
  if (!API_SECRET) {
    console.warn("WARN: LICENSE_SERVER_API_SECRET not set — /v1/issue is open");
  }
});
