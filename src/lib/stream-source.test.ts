import { describe, expect, it } from "vitest";
import { repairMalformedStreamUrl, normalizeStreamSource } from "./stream-source";

describe("repairMalformedStreamUrl", () => {
  it("fixes missing scheme with stray colon path", () => {
    expect(repairMalformedStreamUrl("://junki3monk3y.com:/Blade2nd/PaaJhvNbqX/56209")).toBe(
      "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/56209"
    );
  });

  it("normalizes https host:443 slash path", () => {
    expect(repairMalformedStreamUrl("https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/56209")).toBe(
      "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/56209"
    );
  });

  it("runs inside normalizeStreamSource", () => {
    expect(normalizeStreamSource("://example.com:/live/a/b")).toBe("https://example.com/live/a/b");
  });
});
