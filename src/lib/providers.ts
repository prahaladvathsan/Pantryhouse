import type { OrderItem } from "../types";
import { formatQuantity } from "./domain";

export type Provider = "chatgpt" | "claude" | "chatgpt-desktop";

export const buildOrderPrompt = (items: Pick<OrderItem, "name" | "quantity" | "unit" | "bought">[]) => {
  const lines = items
    .filter((item) => item.bought)
    .map((item) => `- ${item.name}: ${formatQuantity(item.quantity)} ${item.unit}`)
    .join("\n");

  return `Add these items to my Swiggy Instamart cart:\n\n${lines}\n\nPlease search for sensible everyday options, ask me about any substitutions, and let me review the cart. Do not place the order or confirm payment.`;
};

export const providerUrl = (provider: Provider, prompt: string) => {
  const encoded = encodeURIComponent(prompt);
  if (provider === "claude") return `https://claude.ai/new?q=${encoded}`;
  if (provider === "chatgpt-desktop") return `codex://new?prompt=${encoded}`;
  return `https://chatgpt.com/?q=${encoded}`;
};
