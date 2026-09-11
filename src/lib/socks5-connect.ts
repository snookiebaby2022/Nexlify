import net from "node:net";

export type Socks5Proxy = {
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
};

class SocksReader {
  private buf = Buffer.alloc(0);
  private wait: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null;

  constructor(
    private socket: net.Socket,
    private timeoutMs: number
  ) {
    this.socket.on("data", (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this.pump();
    });
    this.socket.on("error", (err) => {
      if (this.wait) {
        const w = this.wait;
        this.wait = null;
        w.reject(err);
      }
    });
  }

  private pump() {
    if (!this.wait || this.buf.length < this.wait.n) return;
    const w = this.wait;
    this.wait = null;
    const out = this.buf.subarray(0, w.n);
    this.buf = this.buf.subarray(w.n);
    w.resolve(out);
  }

  readExact(n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (this.wait) {
        reject(new Error("SOCKS5 reader busy"));
        return;
      }
      const timer = setTimeout(() => {
        this.wait = null;
        reject(new Error("SOCKS5 handshake timeout"));
      }, this.timeoutMs);
      this.wait = {
        n,
        resolve: (b) => {
          clearTimeout(timer);
          resolve(b);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.pump();
    });
  }
}

function writeAll(socket: net.Socket, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

/** Open a TCP connection to destHost:destPort via a SOCKS5 proxy (RFC 1928 + optional user/pass). */
export async function connectViaSocks5(
  proxy: Socks5Proxy,
  destHost: string,
  destPort: number,
  timeoutMs: number
): Promise<net.Socket> {
  const socket = net.connect({ host: proxy.host, port: proxy.port });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      socket.destroy();
      reject(new Error("SOCKS5 connect timeout"));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(t);
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });

  const reader = new SocksReader(socket, timeoutMs);

  try {
    const user = proxy.username ? String(proxy.username) : "";
    const pass = proxy.password ? String(proxy.password) : "";
    const wantAuth = Boolean(user || pass);

    await writeAll(socket, Buffer.from(wantAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));
    const methodResp = await reader.readExact(2);
    if (methodResp[0] !== 0x05) throw new Error("SOCKS5 bad version");
    if (methodResp[1] === 0xff) throw new Error("SOCKS5 no acceptable method");

    if (methodResp[1] === 0x02) {
      const uBuf = Buffer.from(user, "utf8");
      const pBuf = Buffer.from(pass, "utf8");
      if (uBuf.length > 255 || pBuf.length > 255) throw new Error("SOCKS5 auth too long");
      const auth = Buffer.alloc(3 + uBuf.length + pBuf.length);
      auth[0] = 0x01;
      auth[1] = uBuf.length;
      uBuf.copy(auth, 2);
      auth[2 + uBuf.length] = pBuf.length;
      pBuf.copy(auth, 3 + uBuf.length);
      await writeAll(socket, auth);
      const authResp = await reader.readExact(2);
      if (authResp[1] !== 0x00) throw new Error("SOCKS5 auth failed");
    } else if (methodResp[1] !== 0x00) {
      throw new Error(`SOCKS5 unsupported method ${methodResp[1]}`);
    }

    const hostBuf = Buffer.from(destHost, "utf8");
    if (hostBuf.length > 255) throw new Error("SOCKS5 destination hostname too long");
    const req = Buffer.alloc(7 + hostBuf.length);
    req[0] = 0x05;
    req[1] = 0x01;
    req[2] = 0x00;
    req[3] = 0x03;
    req[4] = hostBuf.length;
    hostBuf.copy(req, 5);
    req.writeUInt16BE(destPort, 5 + hostBuf.length);
    await writeAll(socket, req);

    const head = await reader.readExact(4);
    if (head[0] !== 0x05) throw new Error("SOCKS5 bad reply version");
    if (head[1] !== 0x00) throw new Error(`SOCKS5 CONNECT failed status=${head[1]}`);
    const atyp = head[3];
    let restLen = 0;
    if (atyp === 0x01) restLen = 4 + 2;
    else if (atyp === 0x03) {
      const lenBuf = await reader.readExact(1);
      restLen = lenBuf[0]! + 2;
    } else if (atyp === 0x04) restLen = 16 + 2;
    else throw new Error(`SOCKS5 bad atyp ${atyp}`);
    if (restLen > 0) await reader.readExact(restLen);

    socket.setTimeout(0);
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    return socket;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}
