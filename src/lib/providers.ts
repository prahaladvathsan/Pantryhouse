import type { OrderItem } from "../types";
import { formatMoney, formatQuantity } from "./domain";

export type Provider = "chatgpt" | "claude" | "chatgpt-desktop";

export type AssistantOrderResult = {
  requestedName: string;
  productName: string;
  brand: string | null;
  quantity: number;
  unit: string;
  packageSize: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
};

const productLabel = (item: Pick<OrderItem, "product_name" | "brand" | "package_size">) =>
  [item.brand, item.product_name, item.package_size].filter(Boolean).join(" · ");

const preferenceLines = (requestedItems: Pick<OrderItem, "name" | "name_key">[], history: OrderItem[]) => {
  const notes: string[] = [];
  for (const requested of requestedItems) {
    const matches = history.filter((item) => item.bought && item.name_key === requested.name_key && item.product_name);
    const liked = matches.find((item) => item.feedback === 1);
    const disliked = matches.filter((item) => item.feedback === -1).slice(0, 2);
    const latest = matches[0];
    const parts: string[] = [];
    if (liked) parts.push(`prefer ${productLabel(liked)}${liked.unit_price_paise !== null ? ` (last seen at ${formatMoney(liked.unit_price_paise)})` : ""}`);
    else if (latest) parts.push(`previously bought ${productLabel(latest)}`);
    if (disliked.length) parts.push(`avoid ${disliked.map(productLabel).join(" or ")}`);
    if (parts.length) notes.push(`- ${requested.name}: ${parts.join("; ")}`);
  }
  return notes;
};

export const buildOrderPrompt = (
  items: Pick<OrderItem, "name" | "name_key" | "quantity" | "unit" | "bought">[],
  history: OrderItem[] = [],
) => {
  const boughtItems = items.filter((item) => item.bought);
  const lines = items
    .filter((item) => item.bought)
    .map((item) => `- ${item.name}: ${formatQuantity(item.quantity)} ${item.unit}`)
    .join("\n");
  const preferences = preferenceLines(boughtItems, history);
  const preferenceBlock = preferences.length
    ? `\n\nHousehold product preferences learned from earlier orders:\n${preferences.join("\n")}`
    : "";

  return `Add these items to my Swiggy Instamart cart:\n\n${lines}${preferenceBlock}\n\nPlease search for sensible everyday options, ask me about any substitutions, and let me review the cart. Do not place the order or confirm payment.\n\nAfter I finish reviewing, end your response with PANTRYHOUSE_ORDER_RESULT followed by only a JSON array. For every selected product include: requestedName, productName, brand, quantity, unit, packageSize, unitPrice, and lineTotal. Prices must be numbers in rupees. This lets me paste the exact purchase back into Pantryhouse.`;
};

export const parseOrderResult = (value: string): AssistantOrderResult[] => {
  const markerIndex = value.lastIndexOf("PANTRYHOUSE_ORDER_RESULT");
  const source = markerIndex >= 0 ? value.slice(markerIndex + "PANTRYHOUSE_ORDER_RESULT".length) : value;
  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Paste the JSON array from the assistant’s PANTRYHOUSE_ORDER_RESULT section.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    throw new Error("That order result is not valid JSON yet.");
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("The order result does not contain any products.");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Product ${index + 1} is not an object.`);
    const row = entry as Record<string, unknown>;
    const requestedName = String(row.requestedName ?? "").trim();
    const productName = String(row.productName ?? "").trim();
    const quantity = Number(row.quantity);
    const unit = String(row.unit ?? "").trim();
    const nullableText = (input: unknown) => input === null || input === undefined || String(input).trim() === "" ? null : String(input).trim();
    const nullablePrice = (input: unknown) => input === null || input === undefined || input === "" ? null : Number(input);
    const unitPrice = nullablePrice(row.unitPrice);
    const lineTotal = nullablePrice(row.lineTotal);
    if (!requestedName || !productName || !unit || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Product ${index + 1} needs requestedName, productName, a positive quantity, and unit.`);
    }
    if ((unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) || (lineTotal !== null && (!Number.isFinite(lineTotal) || lineTotal < 0))) {
      throw new Error(`Product ${index + 1} has an invalid price.`);
    }
    return {
      requestedName,
      productName,
      brand: nullableText(row.brand),
      quantity,
      unit,
      packageSize: nullableText(row.packageSize),
      unitPrice,
      lineTotal,
    };
  });
};

export const providerUrl = (provider: Provider, prompt: string) => {
  const encoded = encodeURIComponent(prompt);
  if (provider === "claude") return `https://claude.ai/new?q=${encoded}`;
  if (provider === "chatgpt-desktop") return `codex://new?prompt=${encoded}`;
  return `https://chatgpt.com/?q=${encoded}`;
};
