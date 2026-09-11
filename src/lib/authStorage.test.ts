import { describe, expect, it } from "vitest";
import { resolvePostLoginPath } from "./authStorage";

describe("resolvePostLoginPath", () => {
  it("sends partner organization managers to organisations", () => {
    expect(resolvePostLoginPath("organization_manager", null, "partner")).toBe("/organisations");
  });

  it("still sends partner phlebos to the console", () => {
    expect(resolvePostLoginPath("phlebo", null, "partner")).toBe("/engagements/console");
  });

  it("still sends partner experts to the expert portal", () => {
    expect(resolvePostLoginPath("expert", null, "partner")).toBe("/experts/portal");
  });
});
