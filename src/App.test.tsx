import { fireEvent, render, screen } from "@testing-library/react";
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

  it("opens the recent Instamart order import flow", async () => {
    window.location.hash = "#/orders";
    render(<HashRouter><App /></HashRouter>);

    const importButton = await screen.findByRole("button", { name: "Import recent order" });
    fireEvent.click(importButton);

    expect(await screen.findByRole("dialog", { name: "Import your recent Instamart order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open ChatGPT/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Open Claude/ })).toBeEnabled();
  });
});
