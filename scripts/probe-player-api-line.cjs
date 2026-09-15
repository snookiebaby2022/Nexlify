#!/usr/bin/env node
/** Test player_api login for one active line (localhost panel). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { username: true, password: true },
    orderBy: { lastWatchedAt: "desc" },
  });
  await p.$disconnect();
  if (!line) {
    console.log(JSON.stringify({ error: "no_active_line" }));
    process.exit(1);
  }
  const q = new URLSearchParams({
    username: line.username,
    password: line.password,
  });
  const port = Number(process.env.PORT || 13000);
  const path = `/player_api.php?${q}`;
  const body = await new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: { "user-agent": "TiviMate/5.0" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
  let json;
  try {
    json = JSON.parse(body.data);
  } catch {
    json = { raw: body.data.slice(0, 300) };
  }
  const edge = await new Promise((resolve, reject) => {
    const path2 = `/player_api.php?${q}`;
    const req = http.request(
      {
        hostname: "209.237.141.15",
        port: 8080,
        path: path2,
        method: "GET",
        headers: { "user-agent": "TiviMate/5.0" },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("edge_timeout"));
    });
    req.end();
  });
  let edgeJson;
  try {
    edgeJson = JSON.parse(edge.data);
  } catch {
    edgeJson = { raw: edge.data.slice(0, 300) };
  }

  console.log(
    JSON.stringify(
      {
        user: line.username,
        local: {
          status: body.status,
          auth: json?.user_info?.auth,
          userStatus: json?.user_info?.status,
          message: json?.user_info?.message,
          serverUrl: json?.server_info?.url,
        },
        edge8080: {
          status: edge.status,
          auth: edgeJson?.user_info?.auth,
          userStatus: edgeJson?.user_info?.status,
          message: edgeJson?.user_info?.message,
          serverUrl: edgeJson?.server_info?.url,
        },
      },
      null,
      2
    )
  );
  process.exit(json?.user_info?.auth === 1 ? 0 : 2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
