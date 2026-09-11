import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectVpnKindFromConfig,
  detectVpnKindFromFilename,
  mergeVpnKind,
  validateVpnConfigText,
} from "./vpn-config";

describe("vpn-config", () => {
  it("detects WireGuard from [Interface]", () => {
    assert.equal(
      detectVpnKindFromConfig("[Interface]\nPrivateKey = abc\n[Peer]\nPublicKey = def\n"),
      "WIREGUARD"
    );
  });

  it("detects OpenVPN from client directive", () => {
    assert.equal(
      detectVpnKindFromConfig("client\ndev tun\nremote vpn.example.com 1194\n"),
      "OPENVPN"
    );
  });

  it("uses .ovpn extension", () => {
    assert.equal(detectVpnKindFromFilename("provider.ovpn"), "OPENVPN");
  });

  it("rejects placeholder WireGuard keys", () => {
    const v = validateVpnConfigText(
      "WIREGUARD",
      "[Interface]\nPrivateKey = <insert_your_private_key_here>\n"
    );
    assert.equal(v.valid, false);
    assert.match(v.errors.join(" "), /placeholder/i);
  });

  it("accepts minimal valid WireGuard stub", () => {
    const v = validateVpnConfigText(
      "WIREGUARD",
      "[Interface]\nPrivateKey = cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n[Peer]\nPublicKey = x\n"
    );
    assert.equal(v.valid, true);
  });

  it("mergeVpnKind prefers filename for .ovpn", () => {
    assert.equal(
      mergeVpnKind("x.ovpn", "[Interface]\nPrivateKey = a\n", "WIREGUARD"),
      "OPENVPN"
    );
  });
});
