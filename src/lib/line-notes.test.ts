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

  it("always stores a delimiter so Manage Lines can split admin vs reseller notes", () => {
    assert.equal(mergeResellerNotes(null, "solo"), "\n---\nsolo");
    assert.equal(mergeLineNotesForSave("admin", null, "internal", ""), "internal\n---\n");
    assert.equal(mergeLineNotesForSave("admin", null, "", "visible"), "\n---\nvisible");
    assert.deepEqual(splitLineNotes("internal\n---\n", "admin"), { admin: "internal", reseller: "" });
    assert.deepEqual(splitLineNotes("\n---\nvisible", "admin"), { admin: "", reseller: "visible" });
    assert.deepEqual(splitLineNotes("\n---\nvisible", "reseller"), { admin: "", reseller: "visible" });
  });
});
