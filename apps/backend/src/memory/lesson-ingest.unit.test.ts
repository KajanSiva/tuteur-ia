import { describe, expect, it } from "vitest";

import { parseDataUrl } from "./lesson-ingest.js";

describe("parseDataUrl", () => {
  it("splits a base64 data url into its media type and payload", () => {
    expect(parseDataUrl("data:image/png;base64,QUJD")).toEqual({
      mediaType: "image/png",
      base64: "QUJD",
    });
  });

  it("returns null for a non-data url (nothing to decode)", () => {
    expect(parseDataUrl("https://example.com/a.png")).toBeNull();
  });

  it("returns null for a data url that is not base64-encoded", () => {
    expect(parseDataUrl("data:image/png,rawtext")).toBeNull();
  });
});
