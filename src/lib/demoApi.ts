import type {
  DashboardData,
  HouseholdContext,
  InventoryInput,
  InventoryItem,
  InvitePreview,
  Member,
  NextOrderItem,
  Order,
  PantryApi,
  PlacementInput,
  ProductFeedback,
  UUID,
} from "../types";
import { addDays, isExpired, normaliseName, shouldAutoOrder, splitPaise } from "./domain";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const houseId = "11111111-1111-4111-8111-111111111111";
const memberIds = {
  asha: "22222222-2222-4222-8222-222222222221",
  kabir: "22222222-2222-4222-8222-222222222222",
  vathsan: "22222222-2222-4222-8222-222222222223",
};

const members: Member[] = [
  { id: memberIds.asha, household_id: houseId, name: "Asha", created_at: now() },
  { id: memberIds.kabir, household_id: houseId, name: "Kabir", created_at: now() },
  { id: memberIds.vathsan, household_id: houseId, name: "Vathsan", created_at: now() },
];

let context: HouseholdContext = {
  household: {
    id: houseId,
    name: "Sunday House",
    timezone: "Asia/Kolkata",
    default_expiry_days: 7,
    created_at: now(),
  },
  member: members[2],
};

const inventorySeed = (
  name: string,
  category: string,
  quantity: number,
  unit: string,
  expiryDate: string | null,
  recurring = true,
  defaultQuantity = 1,
): InventoryItem => ({
  id: id(),
  household_id: houseId,
  name,
  name_key: normaliseName(name),
  category,
  quantity,
  unit,
  expiry_date: expiryDate,
  is_recurring: recurring,
  default_quantity: defaultQuantity,
  default_expiry_days: expiryDate ? 7 : null,
  created_at: now(),
  updated_at: now(),
});

let inventory: InventoryItem[] = [
  inventorySeed("Full cream milk", "Dairy", 1, "carton", addDays(new Date(), 2), true, 2),
  inventorySeed("Eggs", "Dairy & eggs", 0, "tray", addDays(new Date(), 6), true, 1),
  inventorySeed("Basmati rice", "Pantry", 2.5, "kg", addDays(new Date(), 180), true, 5),
  inventorySeed("Tomatoes", "Produce", 6, "pcs", addDays(new Date(), 1), false, 6),
  inventorySeed("Dishwashing liquid", "Household", 0.4, "bottle", null, true, 1),
];

let nextOrder: NextOrderItem[] = [];
let orders: Order[] = [];
let inviteToken = "demo-sunday-house";
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const sync = () => {
  for (const item of inventory) {
    const existing = nextOrder.find((orderItem) => orderItem.name_key === item.name_key && !orderItem.locked_order_id);
    if (shouldAutoOrder(item)) {
      if (!existing) {
        nextOrder.push({
          id: id(),
          household_id: houseId,
          inventory_item_id: item.id,
          name: item.name,
          name_key: item.name_key,
          quantity: item.default_quantity,
          unit: item.unit,
          source_auto: true,
          source_manual: false,
          dismissed: false,
          locked_order_id: null,
          created_at: now(),
          updated_at: now(),
        });
      } else {
        existing.source_auto = true;
        existing.inventory_item_id = item.id;
      }
    } else if (existing?.source_auto) {
      if (existing.source_manual) existing.source_auto = false;
      else nextOrder = nextOrder.filter((candidate) => candidate.id !== existing.id);
    }
  }
};

sync();
nextOrder.push({
  id: id(),
  household_id: houseId,
  inventory_item_id: null,
  name: "Green chillies",
  name_key: "green chillies",
  quantity: 100,
  unit: "g",
  source_auto: false,
  source_manual: true,
  dismissed: false,
  locked_order_id: null,
  created_at: now(),
  updated_at: now(),
});

export const demoApi: PantryApi = {
  isDemo: true,
  async ensureSession() {},
  async getContext() {
    return structuredClone(context);
  },
  async previewInvite(token: string): Promise<InvitePreview> {
    if (token !== inviteToken) throw new Error("This invite link is no longer valid.");
    return { household_id: houseId, household_name: context.household.name, members: structuredClone(members) };
  },
  async createHousehold(householdName: string, memberName: string) {
    const member: Member = { id: id(), household_id: houseId, name: memberName, created_at: now() };
    context = {
      household: { ...context.household, name: householdName },
      member,
    };
    return { context: structuredClone(context), inviteToken };
  },
  async joinHousehold(_token: string, memberId: string | null, memberName: string | null) {
    let member = members.find((candidate) => candidate.id === memberId);
    if (!member && memberName) {
      member = { id: id(), household_id: houseId, name: memberName, created_at: now() };
      members.push(member);
    }
    if (!member) throw new Error("Choose a name or add a flatmate.");
    context = { ...context, member };
    emit();
    return structuredClone(context);
  },
  async rotateInvite() {
    inviteToken = `demo-${id()}`;
    return inviteToken;
  },
  async loadData(): Promise<DashboardData> {
    sync();
    return structuredClone({ inventory, nextOrder, members, orders });
  },
  subscribe(_householdId, onChange) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  },
  async saveInventory(_householdId: string, input: InventoryInput, itemId?: string) {
    if (itemId) {
      const item = inventory.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("Item not found.");
      Object.assign(item, input, { name_key: normaliseName(input.name), updated_at: now() });
    } else {
      inventory.push({
        ...input,
        id: id(),
        household_id: houseId,
        name_key: normaliseName(input.name),
        created_at: now(),
        updated_at: now(),
      });
    }
    sync();
    emit();
  },
  async deleteInventory(itemId: string) {
    inventory = inventory.filter((item) => item.id !== itemId);
    nextOrder = nextOrder.filter((item) => item.inventory_item_id !== itemId || item.source_manual);
    nextOrder.forEach((item) => {
      if (item.inventory_item_id === itemId) {
        item.inventory_item_id = null;
        item.source_auto = false;
        item.updated_at = now();
      }
    });
    emit();
  },
  async adjustInventory(itemId: string, delta: number) {
    const item = inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Item not found.");
    item.quantity = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
    item.updated_at = now();
    sync();
    emit();
  },
  async syncNextOrder() {
    sync();
    emit();
  },
  async addManualNextOrder(_householdId, name, quantity, unit) {
    const key = normaliseName(name);
    const existing = nextOrder.find((item) => item.name_key === key && !item.locked_order_id);
    if (existing) {
      existing.quantity = Math.round((existing.quantity + quantity) * 100) / 100;
      existing.unit = unit || existing.unit;
      existing.source_manual = true;
      existing.dismissed = false;
      existing.updated_at = now();
    } else {
      nextOrder.push({
        id: id(), household_id: houseId, inventory_item_id: null, name, name_key: key, quantity, unit,
        source_auto: false, source_manual: true, dismissed: false, locked_order_id: null, created_at: now(), updated_at: now(),
      });
    }
    emit();
  },
  async updateNextOrder(itemId, quantity, unit) {
    const item = nextOrder.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Order item not found.");
    item.quantity = quantity;
    item.unit = unit;
    item.updated_at = now();
    emit();
  },
  async dismissNextOrder(itemId) {
    const item = nextOrder.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (item.source_auto) {
      item.dismissed = true;
      item.source_manual = false;
    } else nextOrder = nextOrder.filter((candidate) => candidate.id !== itemId);
    emit();
  },
  async startOrder() {
    const currentDraft = orders.find((order) => order.status === "draft");
    if (currentDraft) return currentDraft.id;
    const orderId = id();
    const snapshot = nextOrder.filter((item) => !item.dismissed && !item.locked_order_id);
    if (!snapshot.length) throw new Error("Add at least one item before starting an order.");
    snapshot.forEach((item) => { item.locked_order_id = orderId; });
    orders.unshift({
      id: orderId,
      household_id: houseId,
      status: "draft",
      placed_by_member_id: context.member.id,
      total_amount_paise: null,
      started_at: now(),
      placed_at: null,
      cancelled_at: null,
      assistant_capture_received_at: null,
      assistant_capture_total_amount_paise: null,
      order_items: snapshot.map((item) => ({
        id: id(), order_id: orderId, inventory_item_id: item.inventory_item_id, next_order_item_id: item.id,
        name: item.name, name_key: item.name_key, quantity: item.quantity, unit: item.unit,
        category: inventory.find((inv) => inv.id === item.inventory_item_id)?.category ?? "Other",
        expiry_date: addDays(new Date(), inventory.find((inv) => inv.id === item.inventory_item_id)?.default_expiry_days ?? 7),
        product_name: null, brand: null, package_size: null, unit_price_paise: null, line_total_paise: null, feedback: 0,
        bought: true, source: "next_order",
      })),
      order_splits: [],
    });
    emit();
    return orderId;
  },
  async startImportOrder() {
    const currentDraft = orders.find((order) => order.status === "draft");
    if (currentDraft) return currentDraft.id;
    const orderId = id();
    orders.unshift({
      id: orderId,
      household_id: houseId,
      status: "draft",
      placed_by_member_id: context.member.id,
      total_amount_paise: null,
      started_at: now(),
      placed_at: null,
      cancelled_at: null,
      assistant_capture_received_at: null,
      assistant_capture_total_amount_paise: null,
      order_items: [],
      order_splits: [],
    });
    emit();
    return orderId;
  },
  async createOrderHandoff(orderId) {
    const order = orders.find((candidate) => candidate.id === orderId);
    if (!order || order.status !== "draft") throw new Error("This order is no longer open.");
    return { orderId, code: "d".repeat(64), expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() };
  },
  async cancelOrder(orderId) {
    const order = orders.find((candidate) => candidate.id === orderId);
    if (!order || order.status !== "draft") return;
    order.status = "cancelled";
    order.cancelled_at = now();
    nextOrder.forEach((item) => { if (item.locked_order_id === orderId) item.locked_order_id = null; });
    emit();
  },
  async placeOrder(input: PlacementInput) {
    const order = orders.find((candidate) => candidate.id === input.orderId);
    if (!order || order.status !== "draft") throw new Error("This order is no longer open.");
    order.order_items = input.items.map((item) => ({ ...item, id: id(), order_id: order.id, name_key: normaliseName(item.name), feedback: 0 }));
    for (const item of input.items.filter((candidate) => candidate.bought)) {
      const key = normaliseName(item.name);
      const existing = inventory.find((candidate) => candidate.id === item.inventory_item_id || candidate.name_key === key);
      if (existing) {
        const replace = existing.quantity <= 0 || isExpired(existing);
        existing.quantity = replace ? item.quantity : Math.round((existing.quantity + item.quantity) * 100) / 100;
        existing.expiry_date = replace || !existing.expiry_date
          ? item.expiry_date
          : [existing.expiry_date, item.expiry_date].filter(Boolean).sort()[0] ?? null;
        existing.updated_at = now();
      } else {
        inventory.push({
          id: id(), household_id: houseId, name: item.name, name_key: key, category: item.category,
          quantity: item.quantity, unit: item.unit, expiry_date: item.expiry_date, is_recurring: false,
          default_quantity: item.quantity, default_expiry_days: item.expiry_date ? 7 : null, created_at: now(), updated_at: now(),
        });
      }
    }
    const snapshotIds = new Set(order.order_items.map((item) => item.next_order_item_id).filter(Boolean));
    nextOrder = nextOrder.filter((item) => !snapshotIds.has(item.id));
    order.status = "placed";
    order.total_amount_paise = input.totalPaise;
    order.placed_at = now();
    const participants = members.filter((member) => input.participantIds.includes(member.id));
    order.order_splits = splitPaise(input.totalPaise, participants).map(({ member, amountPaise }) => ({
      order_id: order.id,
      member_id: member.id,
      amount_paise: amountPaise,
      settled_at: member.id === order.placed_by_member_id ? now() : null,
      member,
    }));
    sync();
    emit();
  },
  async rateOrderItem(orderItemId: string, feedback: ProductFeedback) {
    const item = orders.flatMap((order) => order.order_items).find((candidate) => candidate.id === orderItemId);
    if (!item) throw new Error("Order item not found.");
    item.feedback = feedback;
    emit();
  },
  async setSplitSettled(orderId, memberId, settled) {
    const split = orders.find((order) => order.id === orderId)?.order_splits.find((candidate) => candidate.member_id === memberId);
    if (!split) throw new Error("Split not found.");
    split.settled_at = settled ? now() : null;
    emit();
  },
};
