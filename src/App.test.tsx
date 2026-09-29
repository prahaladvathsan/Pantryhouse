import { render, screen } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Pantryhouse app", () => {
  it("opens the working pantry surface with demo data", async () => {
    window.location.hash = "#/pantry";
    render(<HashRouter><App /></HashRouter>);
    expect(await screen.findByRole("group", { name: "Filter pantry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All \(\d+\)/ })).toBeEnabled();
    expect(screen.getByText("Full cream milk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeEnabled();
  });
});
