import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  displayCatalogStreamName,
  isGarbageStreamName,
  nameFromStreamIcon,
} from "./stream-catalog-name";

describe("displayCatalogStreamName", () => {
  it("prefers a real catalog name over garbage EPG text", () => {
    assert.equal(
      displayCatalogStreamName("(424) (2098-12-31 08:02:04)", "ESPN+ 424"),
      "ESPN+ 424"
    );
  });

  it("treats space-separated EPG dates as garbage and uses the logo name", () => {
    assert.equal(isGarbageStreamName("(424) (2098 12 31 08:02:04)"), true);
    assert.equal(
      displayCatalogStreamName(
        "(424) (2098 12 31 08:02:04)",
        "(424) (2098 12 31 08:02:04)",
        "https://iptvboss.xyz/logos/USA/ESPN%2B424.png"
      ),
      "ESPN+ 424"
    );
  });

  it("uses the stored name when it is valid", () => {
    assert.equal(displayCatalogStreamName("Sky Sports Action FHD", "other"), "Sky Sports Action FHD");
  });

  it("reads a name from a logo filename", () => {
    assert.equal(nameFromStreamIcon("https://cdn.example/logos/ESPN+_424.png"), "ESPN+ 424");
    assert.equal(
      displayCatalogStreamName("", "https://cdn.example/logos/ESPN+_425.png"),
      "ESPN+ 425"
    );
  });

  it("treats untitled as garbage", () => {
    assert.equal(isGarbageStreamName("Untitled channel"), true);
  });
});
