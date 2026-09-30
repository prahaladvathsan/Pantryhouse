import type { OrderHandoff, OrderItem } from "../types";
import { formatMoney, formatQuantity } from "./domain";

export type Provider = "chatgpt" | "claude" | "chatgpt-desktop";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const pantryhouseConnectorUrl = supabaseUrl && !supabaseUrl.includes("your-project")
  ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/pantryhouse-mcp`
  : null;

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
  items: Pick<OrderItem, "id" | "name" | "name_key" | "quantity" | "unit" | "bought">[],
  history: OrderItem[] = [],
  handoff?: OrderHandoff,
) => {
  const boughtItems = items.filter((item) => item.bought);
  const lines = items
    .filter((item) => item.bought)
    .map((item) => `- ${item.name}: ${formatQuantity(item.quantity)} ${item.unit}${handoff ? ` [Pantryhouse requestedItemId: ${item.id}]` : ""}`)
    .join("\n");
  const preferences = preferenceLines(boughtItems, history);
  const preferenceBlock = preferences.length
    ? `\n\nHousehold product preferences learned from earlier orders:\n${preferences.join("\n")}`
    : "";

  const returnInstructions = handoff
    ? `After I say the cart is final, call the Pantryhouse connector tool record_order_result exactly once. Use orderId ${handoff.orderId} and orderCode ${handoff.code}. For each requested product, copy its Pantryhouse requestedItemId exactly; use null only for a genuinely ad-hoc product. Include requestedName, exact productName, brand, packageSize, quantity, unit, unitPrice, and lineTotal. Prices must be numbers in rupees. Do not repeat the order code in your reply. The tool only prepares a draft for my review; it does not place the order.\n\nIf the Pantryhouse connector is unavailable, fall back to PANTRYHOUSE_ORDER_RESULT followed by only the equivalent JSON array so I can import it manually.`
    : "After I finish reviewing, end your response with PANTRYHOUSE_ORDER_RESULT followed by only a JSON array. For every selected product include: requestedName, productName, brand, quantity, unit, packageSize, unitPrice, and lineTotal. Prices must be numbers in rupees. This lets me paste the exact purchase back into Pantryhouse.";

  return `Add these items to my Swiggy Instamart cart:\n\n${lines}${preferenceBlock}\n\nPlease search for sensible everyday options, ask me about any substitutions, and let me review the cart. Do not place the order or confirm payment.\n\n${returnInstructions}`;
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
