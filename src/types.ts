export type UUID = string;

export type ProductFeedback = -1 | 0 | 1;

export type Household = {
  id: UUID;
  name: string;
  timezone: string;
  default_expiry_days: number;
  created_at: string;
};

export type Member = {
  id: UUID;
  household_id: UUID;
  name: string;
  created_at: string;
};

export type HouseholdContext = {
  household: Household;
  member: Member;
};

export type InventoryItem = {
  id: UUID;
  household_id: UUID;
  name: string;
  name_key: string;
  category: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  is_recurring: boolean;
  default_quantity: number;
  default_expiry_days: number | null;
  created_at: string;
  updated_at: string;
};

export type NextOrderItem = {
  id: UUID;
  household_id: UUID;
  inventory_item_id: UUID | null;
  name: string;
  name_key: string;
  quantity: number;
  unit: string;
  source_auto: boolean;
  source_manual: boolean;
  dismissed: boolean;
  locked_order_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: UUID;
  order_id: UUID;
  inventory_item_id: UUID | null;
  next_order_item_id: UUID | null;
  name: string;
  name_key: string;
  quantity: number;
  unit: string;
  category: string;
  expiry_date: string | null;
  product_name: string | null;
  brand: string | null;
  package_size: string | null;
  unit_price_paise: number | null;
  line_total_paise: number | null;
  feedback: ProductFeedback;
  bought: boolean;
  source: "next_order" | "ad_hoc";
};

export type OrderSplit = {
  order_id: UUID;
  member_id: UUID;
  amount_paise: number;
  settled_at: string | null;
  member?: Member;
};

export type Order = {
  id: UUID;
  household_id: UUID;
  status: "draft" | "placed" | "cancelled";
  placed_by_member_id: UUID;
  total_amount_paise: number | null;
  started_at: string;
  placed_at: string | null;
  cancelled_at: string | null;
  assistant_capture_received_at: string | null;
  assistant_capture_total_amount_paise: number | null;
  order_items: OrderItem[];
  order_splits: OrderSplit[];
};

export type OrderHandoff = {
  orderId: UUID;
  code: string;
  expiresAt: string;
};

export type DashboardData = {
  inventory: InventoryItem[];
  nextOrder: NextOrderItem[];
  members: Member[];
  orders: Order[];
};

export type InventoryInput = Pick<
  InventoryItem,
  "name" | "category" | "quantity" | "unit" | "expiry_date" | "is_recurring" | "default_quantity" | "default_expiry_days"
>;

export type PlacementItem = Pick<
  OrderItem,
  | "inventory_item_id"
  | "next_order_item_id"
  | "name"
  | "quantity"
  | "unit"
  | "category"
  | "expiry_date"
  | "product_name"
  | "brand"
  | "package_size"
  | "unit_price_paise"
  | "line_total_paise"
  | "bought"
  | "source"
>;

export type PlacementInput = {
  orderId: UUID;
  totalPaise: number;
  participantIds: UUID[];
  items: PlacementItem[];
};

export type InvitePreview = {
  household_id: UUID;
  household_name: string;
  members: Member[];
};

export interface PantryApi {
  readonly isDemo: boolean;
  ensureSession(): Promise<void>;
  getContext(): Promise<HouseholdContext | null>;
  previewInvite(token: string): Promise<InvitePreview>;
  createHousehold(householdName: string, memberName: string): Promise<{ context: HouseholdContext; inviteToken: string }>;
  joinHousehold(token: string, memberId: UUID | null, memberName: string | null): Promise<HouseholdContext>;
  rotateInvite(): Promise<string>;
  loadData(householdId: UUID): Promise<DashboardData>;
  subscribe(householdId: UUID, onChange: () => void): () => void;
  saveInventory(householdId: UUID, input: InventoryInput, id?: UUID): Promise<void>;
  deleteInventory(id: UUID): Promise<void>;
  adjustInventory(id: UUID, delta: number): Promise<void>;
  syncNextOrder(householdId: UUID): Promise<void>;
  addManualNextOrder(householdId: UUID, name: string, quantity: number, unit: string): Promise<void>;
  updateNextOrder(id: UUID, quantity: number, unit: string): Promise<void>;
  dismissNextOrder(id: UUID): Promise<void>;
  startOrder(householdId: UUID): Promise<UUID>;
  startImportOrder(householdId: UUID): Promise<UUID>;
  createOrderHandoff(orderId: UUID): Promise<OrderHandoff>;
  cancelOrder(orderId: UUID): Promise<void>;
  placeOrder(input: PlacementInput): Promise<void>;
  rateOrderItem(orderItemId: UUID, feedback: ProductFeedback): Promise<void>;
  setSplitSettled(orderId: UUID, memberId: UUID, settled: boolean): Promise<void>;
}
