import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { describe, it } from "node:test";
import {
  buildVpnApplyEnv,
  ffmpegHttpProxyArg,
  ffmpegProxyEnv,
  isLoopbackHost,
  materializeServerOutboundProxy,
  outboundProxyToUrl,
  parseOutboundProxyUrl,
  sanitizeVpnInterfaceName,
  vpnProfileToLocalHttpProxy,
} from "./outbound-egress";
import { connectViaSocks5 } from "./socks5-connect";
import { connectOriginSocket } from "./http-via-proxy";

describe("outbound egress materialize", () => {
  it("returns null for NONE without legacy proxyId", () => {
    assert.equal(materializeServerOutboundProxy({ outboundMode: "NONE" }), null);
  });

  it("uses HTTP/HTTPS/SOCKS5 proxy in PROXY mode", () => {
    const socks = materializeServerOutboundProxy({
      outboundMode: "PROXY",
      proxy: {
        type: "SOCKS5",
        host: "1.2.3.4",
        port: 1080,
        username: "u",
        password: "p",
        isActive: true,
      },
    });
    assert.deepEqual(socks, {
      type: "SOCKS5",
      host: "1.2.3.4",
      port: 1080,
      username: "u",
      password: "p",
      allowLoopback: false,
    });
  });

  it("legacy NONE + proxyId still uses proxy", () => {
    const p = materializeServerOutboundProxy({
      outboundMode: "NONE",
      proxyId: "px1",
      proxy: { type: "HTTP", host: "9.9.9.9", port: 8080, isActive: true },
    });
    assert.equal(p?.host, "9.9.9.9");
    assert.equal(p?.type, "HTTP");
  });

  it("VPN mode maps to loopback HTTP gateway", () => {
    const p = materializeServerOutboundProxy({
      outboundMode: "VPN",
      vpnProfile: { isActive: true, localHttpPort: 18080 },
    });
    assert.deepEqual(p, {
      type: "HTTP",
      host: "127.0.0.1",
      port: 18080,
      username: null,
      password: null,
      allowLoopback: true,
    });
    assert.equal(vpnProfileToLocalHttpProxy({ isActive: true, localHttpPort: 19000 }).port, 19000);
  });

  it("inactive VPN or proxy yields null", () => {
    assert.equal(
      materializeServerOutboundProxy({
        outboundMode: "VPN",
        vpnProfile: { isActive: false, localHttpPort: 18080 },
      }),
      null
    );
    assert.equal(
      materializeServerOutboundProxy({
        outboundMode: "PROXY",
        proxy: { type: "HTTP", host: "1.1.1.1", port: 80, isActive: false },
      }),
      null
    );
  });
});

describe("outbound proxy URL round-trip", () => {
  it("encodes socks5 and loopback flag", () => {
    const url = outboundProxyToUrl({
      type: "SOCKS5",
      host: "10.0.0.2",
      port: 1080,
      username: "a",
      password: "b",
    });
    assert.match(url, /^socks5:\/\//);
    const parsed = parseOutboundProxyUrl(url);
    assert.equal(parsed?.type, "SOCKS5");
    assert.equal(parsed?.host, "10.0.0.2");
    assert.equal(parsed?.username, "a");

    const vpnUrl = outboundProxyToUrl({
      type: "HTTP",
      host: "127.0.0.1",
      port: 18080,
      allowLoopback: true,
    });
    assert.match(vpnUrl, /nexlify_loopback=1/);
    const vpnParsed = parseOutboundProxyUrl(vpnUrl);
    assert.equal(vpnParsed?.allowLoopback, true);
    assert.equal(isLoopbackHost("127.0.0.1"), true);
  });

  it("ffmpeg args skip SOCKS5 for -http_proxy and set ALL_PROXY", () => {
    assert.equal(ffmpegHttpProxyArg({ type: "SOCKS5", host: "1.1.1.1", port: 1080 }), null);
    assert.equal(ffmpegHttpProxyArg({ type: "HTTP", host: "1.1.1.1", port: 8080 }), "http://1.1.1.1:8080");
    const env = ffmpegProxyEnv({ type: "SOCKS5", host: "1.1.1.1", port: 1080 });
    assert.match(env.ALL_PROXY, /^socks5:\/\//);
  });

  it("sanitizes wireguard iface names to 15 chars", () => {
    assert.equal(sanitizeVpnInterfaceName("WG-Nexlify_ExtraLong!!!"), "wg-nexlify_extr");
    assert.equal(sanitizeVpnInterfaceName("wg-nexlify0"), "wg-nexlify0");
  });
});

describe("buildVpnApplyEnv", () => {
  it("base64-encodes config for remote apply", () => {
    const env = buildVpnApplyEnv({
      kind: "WIREGUARD",
      interfaceName: "wg-nexlify0",
      localHttpPort: 18080,
      configText: "[Interface]\nPrivateKey=abc\n",
    });
    assert.equal(env.NEXLIFY_VPN_KIND, "WIREGUARD");
    assert.equal(env.NEXLIFY_VPN_IFACE, "wg-nexlify0");
    assert.equal(Buffer.from(env.NEXLIFY_VPN_CONFIG_B64, "base64").toString("utf8"), "[Interface]\nPrivateKey=abc\n");
  });
});

describe("SOCKS5 CONNECT", () => {
  it("tunnels TCP through a mock SOCKS5 server", async () => {
    const echo = net.createServer((socket) => {
      socket.on("data", (d) => socket.write(Buffer.concat([Buffer.from("ECHO:"), d])));
    });
    await new Promise<void>((r) => echo.listen(0, "127.0.0.1", () => r()));
    const echoPort = (echo.address() as net.AddressInfo).port;

    const socks = net.createServer((client) => {
      const onGreeting = (chunk: Buffer) => {
        if (chunk[0] !== 0x05) {
          client.destroy();
          return;
        }
        client.removeListener("data", onGreeting);
        client.write(Buffer.from([0x05, 0x00]));
        client.once("data", (req) => {
          if (req[0] !== 0x05 || req[1] !== 0x01 || req[3] !== 0x03) {
            client.destroy();
            return;
          }
          const hostLen = req[4]!;
          const host = req.subarray(5, 5 + hostLen).toString("utf8");
          const port = req.readUInt16BE(5 + hostLen);
          assert.equal(host, "127.0.0.1");
          assert.equal(port, echoPort);
          const upstream = net.connect({ host: "127.0.0.1", port }, () => {
            client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
            client.pipe(upstream);
            upstream.pipe(client);
          });
          upstream.on("error", () => client.destroy());
        });
      };
      client.on("data", onGreeting);
    });
    await new Promise<void>((r) => socks.listen(0, "127.0.0.1", () => r()));
    const socksPort = (socks.address() as net.AddressInfo).port;

    const tunneled = await connectViaSocks5(
      { host: "127.0.0.1", port: socksPort },
      "127.0.0.1",
      echoPort,
      5000
    );
    const reply = await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("echo timeout")), 3000);
      tunneled.once("data", (d) => {
        clearTimeout(timer);
        resolve(d);
      });
      tunneled.on("error", reject);
      tunneled.write("ping");
    });
    assert.equal(reply.toString("utf8"), "ECHO:ping");
    tunneled.destroy();
    await new Promise<void>((r) => socks.close(() => r()));
    await new Promise<void>((r) => echo.close(() => r()));
  });
});

describe("HTTP CONNECT via local VPN gateway", () => {
  it("connectOriginSocket works through local HTTP CONNECT proxy", async () => {
    const origin = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok-origin");
    });
    await new Promise<void>((r) => origin.listen(0, "127.0.0.1", () => r()));
    const originPort = (origin.address() as net.AddressInfo).port;

    const gateway = http.createServer((_req, res) => {
      res.writeHead(405);
      res.end();
    });
    gateway.on("connect", (req, clientSocket, head) => {
      const [host, portStr] = String(req.url || "").split(":");
      const upstream = net.connect({ host, port: Number(portStr) }, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head?.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on("error", () => clientSocket.destroy());
    });
    await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", () => r()));
    const gwPort = (gateway.address() as net.AddressInfo).port;

    const socket = await connectOriginSocket(
      `http://127.0.0.1:${originPort}/`,
      { type: "HTTP", host: "127.0.0.1", port: gwPort, allowLoopback: true },
      5000
    );

    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          createConnection: () => socket,
          path: "/",
          headers: { Host: `127.0.0.1:${originPort}` },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        }
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(body, "ok-origin");
    gateway.close();
    origin.close();
  });
});
