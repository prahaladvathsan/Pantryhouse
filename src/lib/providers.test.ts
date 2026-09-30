import { describe, expect, it } from "vitest";
import type { OrderItem } from "../types";
import { buildOrderPrompt, parseOrderResult } from "./providers";

const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  id: crypto.randomUUID(),
  order_id: crypto.randomUUID(),
  inventory_item_id: null,
  next_order_item_id: null,
  name: "Milk",
  name_key: "milk",
  quantity: 2,
  unit: "cartons",
  category: "Dairy & eggs",
  expiry_date: null,
  product_name: null,
  brand: null,
  package_size: null,
  unit_price_paise: null,
  line_total_paise: null,
  feedback: 0,
  bought: true,
  source: "next_order",
  ...overrides,
});

describe("assistant order handoff", () => {
  it("adds liked and disliked product history to the next prompt", () => {
    const prompt = buildOrderPrompt([item()], [
      item({ product_name: "Taaza Toned Milk", brand: "Amul", package_size: "1 L", feedback: 1, unit_price_paise: 6500 }),
      item({ product_name: "Slim Milk", brand: "Example", package_size: "1 L", feedback: -1 }),
    ]);

    expect(prompt).toContain("prefer Amul · Taaza Toned Milk · 1 L");
    expect(prompt).toContain("avoid Example · Slim Milk · 1 L");
    expect(prompt).toContain("PANTRYHOUSE_ORDER_RESULT");
  });

  it("parses the structured product result from surrounding assistant text", () => {
    const result = parseOrderResult(`Done.\nPANTRYHOUSE_ORDER_RESULT\n\`\`\`json\n[{"requestedName":"Milk","productName":"Taaza Toned Milk","brand":"Amul","quantity":2,"unit":"cartons","packageSize":"1 L","unitPrice":65,"lineTotal":130}]\n\`\`\``);

    expect(result).toEqual([{
      requestedName: "Milk",
      productName: "Taaza Toned Milk",
      brand: "Amul",
      quantity: 2,
      unit: "cartons",
      packageSize: "1 L",
      unitPrice: 65,
      lineTotal: 130,
    }]);
  });
});
