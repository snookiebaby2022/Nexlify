import { describe, expect, it } from "vitest";
import { mergeLineNotesForSave, mergeResellerNotes, splitLineNotes } from "./line-notes";

describe("splitLineNotes", () => {
  it("treats undelimited text as reseller notes for reseller viewer", () => {
    expect(splitLineNotes("grump signal", "reseller")).toEqual({
      admin: "",
      reseller: "grump signal",
    });
  });

  it("treats undelimited text as admin notes for admin viewer", () => {
    expect(splitLineNotes("internal only", "admin")).toEqual({
      admin: "internal only",
      reseller: "",
    });
  });

  it("splits on delimiter", () => {
    expect(splitLineNotes("admin bit\n---\nreseller bit", "reseller")).toEqual({
      admin: "admin bit",
      reseller: "reseller bit",
    });
  });
});

describe("mergeLineNotesForSave", () => {
  it("preserves hidden admin notes when reseller saves", () => {
    expect(
      mergeLineNotesForSave("reseller", "admin secret\n---\nold", "", "new note")
    ).toBe("admin secret\n---\nnew note");
  });

  it("stores reseller-only notes without delimiter", () => {
    expect(mergeResellerNotes(null, "solo")).toBe("solo");
  });
});
