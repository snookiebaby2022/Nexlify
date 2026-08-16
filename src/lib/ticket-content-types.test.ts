import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTicketSubject,
  classifyTicketSubject,
  emptyBreakdown,
  sumBreakdown,
} from "./ticket-content-types";

describe("ticket-content-types", () => {
  it("builds structured subjects", () => {
    assert.equal(buildTicketSubject("report", "channels", "BBC One"), "[Report Channels] BBC One");
    assert.equal(buildTicketSubject("request", "movies", "Dune"), "[New Movies] Dune");
    assert.equal(
      buildTicketSubject("request", "series", "The Bear S3"),
      "[New TV Series] The Bear S3"
    );
  });

  it("classifies structured subjects", () => {
    assert.deepEqual(classifyTicketSubject("[Report Channels] BBC One"), {
      intent: "report",
      content: "channels",
    });
    assert.deepEqual(classifyTicketSubject("[New Movies] Dune"), {
      intent: "request",
      content: "movies",
    });
    assert.deepEqual(classifyTicketSubject("[Report TV Series] Episode missing"), {
      intent: "report",
      content: "series",
    });
  });

  it("sums breakdowns", () => {
    const b = emptyBreakdown();
    b.channels = 2;
    b.movies = 1;
    b.series = 3;
    assert.equal(sumBreakdown(b), 6);
  });
});
