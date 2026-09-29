import { render, screen } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Pantryhouse app", () => {
  it("opens the working pantry surface with demo data", async () => {
    window.location.hash = "#/pantry";
    render(<HashRouter><App /></HashRouter>);
    expect(await screen.findByRole("heading", { name: "What’s at home" })).toBeInTheDocument();
    expect(screen.getByText("Full cream milk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeEnabled();
  });
});
