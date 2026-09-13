import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listedLinePassword } from "./listed-line-password";

describe("listedLinePassword C-05", () => {
  it("never echoes a stored password on list rows", () => {
    assert.equal(listedLinePassword("super-secret"), "");
    assert.equal(listedLinePassword(""), "");
    assert.equal(listedLinePassword(null), "");
  });
});
