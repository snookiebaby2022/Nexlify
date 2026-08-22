import { describe, expect, it } from "vitest";
import { inferRemoteConnectionFromUrl } from "./stream-provider-probe";

describe("inferRemoteConnectionFromUrl", () => {
  it("derives host, default port, protocol, and panel origin from https URL", () => {
    expect(
      inferRemoteConnectionFromUrl("https://cdn.example.com/live/stream.m3u8?token=1")
    ).toEqual({
      remoteHost: "cdn.example.com",
      remotePort: 443,
      remoteProtocol: "https",
      remotePanelUrl: "https://cdn.example.com",
    });
  });

  it("keeps explicit port and adds http scheme when missing", () => {
    expect(inferRemoteConnectionFromUrl("192.168.1.10:8080/path/index.m3u8")).toEqual({
      remoteHost: "192.168.1.10",
      remotePort: 8080,
      remoteProtocol: "http",
      remotePanelUrl: "http://192.168.1.10:8080",
    });
  });

  it("returns nulls for invalid URLs", () => {
    expect(inferRemoteConnectionFromUrl("not a url")).toEqual({
      remoteHost: null,
      remotePort: null,
      remoteProtocol: null,
      remotePanelUrl: null,
    });
  });
});
