import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AccessDenied } from "./AccessDenied";

describe("AccessDenied", () => {
  it("provides clear recovery UX", () => {
    render(
      <MemoryRouter>
        <AccessDenied />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Access denied" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute("href", "/");
  });

  it("supports the no-access dashboard state", () => {
    render(
      <MemoryRouter>
        <AccessDenied title="No admin access assigned" showHome={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
