import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeLineNotesForSave, mergeResellerNotes, splitLineNotes } from "./line-notes";

describe("splitLineNotes", () => {
  it("treats undelimited text as reseller notes for reseller viewer", () => {
    assert.deepEqual(splitLineNotes("grump signal", "reseller"), {
      admin: "",
      reseller: "grump signal",
    });
  });

  it("treats undelimited text as admin notes for admin viewer", () => {
    assert.deepEqual(splitLineNotes("internal only", "admin"), {
      admin: "internal only",
      reseller: "",
    });
  });

  it("splits on delimiter", () => {
    assert.deepEqual(splitLineNotes("admin bit\n---\nreseller bit", "reseller"), {
      admin: "admin bit",
      reseller: "reseller bit",
    });
  });
});

describe("mergeLineNotesForSave", () => {
  it("preserves hidden admin notes when reseller saves", () => {
    assert.equal(
      mergeLineNotesForSave("reseller", "admin secret\n---\nold", "", "new note"),
      "admin secret\n---\nnew note"
    );
  });

  it("stores reseller-only notes without delimiter", () => {
    assert.equal(mergeResellerNotes(null, "solo"), "solo");
  });
});
