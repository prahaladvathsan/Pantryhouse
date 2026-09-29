import type { InventoryItem, Member } from "../types";

export const normaliseName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");

export const toDateInput = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return toDateInput(next);
};

export const dayDistance = (isoDate: string | null, now = new Date()) => {
  if (!isoDate) return null;
  const today = new Date(`${toDateInput(now)}T00:00:00`);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export const isExpired = (item: Pick<InventoryItem, "expiry_date">, now = new Date()) => {
  const distance = dayDistance(item.expiry_date, now);
  return distance !== null && distance < 0;
};

export const isExpiringSoon = (item: Pick<InventoryItem, "expiry_date">, now = new Date()) => {
  const distance = dayDistance(item.expiry_date, now);
  return distance !== null && distance >= 0 && distance <= 3;
};

export const shouldAutoOrder = (
  item: Pick<InventoryItem, "is_recurring" | "quantity" | "expiry_date">,
  now = new Date(),
) => item.is_recurring && (item.quantity <= 0 || isExpired(item, now));

export const formatQuantity = (quantity: number) =>
  Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

export const formatMoney = (paise: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);

export const formatFriendlyDate = (isoDate: string | null) => {
  if (!isoDate) return "No expiry";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${isoDate}T00:00:00`),
  );
};

export const splitPaise = (totalPaise: number, members: Member[]) => {
  if (!members.length) return [];
  const ordered = [...members].sort((a, b) => a.name.localeCompare(b.name, "en-IN", { sensitivity: "base" }));
  const base = Math.floor(totalPaise / ordered.length);
  let remainder = totalPaise % ordered.length;
  return ordered.map((member) => ({
    member,
    amountPaise: base + (remainder-- > 0 ? 1 : 0),
  }));
};

export const mergeExpiry = (existing: string | null, incoming: string | null) => {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return existing < incoming ? existing : incoming;
};
