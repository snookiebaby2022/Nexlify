#!/usr/bin/env node
/**
 * After grey-clouding darkcdn.site → 209.237.141.15:
 * - StreamServer 10gbs advertises :80 (not :8080)
 * - Main Server domain is login hosts only (no darkcdn.site)
 * - 45 nginx server_name drops darkcdn.site (play hits 10gbs)
 * Run on 45: node scripts/apply-45-grey-play-origin.cjs
 */
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const ROOT = fs.existsSync("/opt/nexlify-panel/package.json") ? "/opt/nexlify-panel" : path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "scripts/load-env.cjs")).loadEnv();

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", timeout: 20_000 });
}

async function main() {
  const { PrismaClient } = require(path.join(ROOT, "node_modules/@prisma/client"));
  const p = new PrismaClient();

  const lb = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!lb) throw new Error("10gbs StreamServer missing");
  const updatedLb = await p.streamServer.update({
    where: { id: lb.id },
    data: {
      domain: "darkcdn.site",
      protocol: "http",
      port: 80,
      httpsPort: 443,
    },
    select: { name: true, host: true, domain: true, protocol: true, port: true, httpsPort: true },
  });
  console.log("10gbs row", updatedLb);

  const main = await p.streamServer.findFirst({ where: { name: "Main Server" } });
  if (main) {
    const domains = String(main.domain || "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && s !== "darkcdn.site");
    const updatedMain = await p.streamServer.update({
      where: { id: main.id },
      data: { domain: domains.join(",") },
      select: { name: true, domain: true },
    });
    console.log("Main Server row", updatedMain);
  }

  const env = "/opt/nexlify-panel/.env";
  let envBody = fs.readFileSync(env, "utf8");
  if (!/^NEXLIFY_MEDIA_ORIGIN=/m.test(envBody)) {
    envBody += "\nNEXLIFY_MEDIA_ORIGIN=http://darkcdn.site\n";
  } else {
    envBody = envBody.replace(/^NEXLIFY_MEDIA_ORIGIN=.*/m, "NEXLIFY_MEDIA_ORIGIN=http://darkcdn.site");
  }
  fs.writeFileSync(env, envBody);
  console.log(sh("grep ^NEXLIFY_MEDIA_ORIGIN= /opt/nexlify-panel/.env"));

  const nginxFiles = [
    "/etc/nginx/conf.d/nexlify-panel-http.conf",
    "/etc/nginx/conf.d/nexlify-panel-https.conf",
  ];
  for (const f of nginxFiles) {
    try {
      execSync(`chattr -i ${JSON.stringify(f)}`, { stdio: "ignore" });
    } catch {
      /* not immutable */
    }
    const before = fs.readFileSync(f, "utf8");
    const after = before.replace(/(\s)darkcdn\.site(?=\s|;)/g, "");
    if (after !== before) {
      fs.writeFileSync(f, after);
      console.log("nginx stripped darkcdn.site from", f);
    } else {
      console.log("nginx unchanged", f);
    }
  }
  sh("nginx -t");
  sh("nginx -s reload");
  try {
    execSync(
      "chattr +i /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf /etc/nginx/conf.d/nexlify-live-remote-edge.conf",
      { stdio: "ignore" }
    );
  } catch {
    /* ignore */
  }
  console.log(
    sh(
      "grep -n server_name /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf"
    )
  );

  await p.$disconnect();
  console.log("GREY_PLAY_ORIGIN_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
