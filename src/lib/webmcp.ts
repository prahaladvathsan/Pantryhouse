import type { DashboardData, HouseholdContext, PantryApi } from "../types";

type ToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

export function registerPantryTools({
  api,
  context,
  data,
  refresh,
}: {
  api: PantryApi;
  context: HouseholdContext;
  data: DashboardData;
  refresh: (quiet?: boolean) => Promise<void>;
}) {
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) return () => undefined;

  const lifecycle = new AbortController();
  const register = (tool: ToolDefinition) => {
    try {
      void Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {
      // Browser implementations may reject unsupported schemas; the visible app remains fully usable.
    }
  };

  register({
    name: "list_pantry_inventory",
    title: "List pantry inventory",
    description: "Read the household pantry with quantities, expiry dates, and recurring status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => ({
      household: context.household.name,
      items: data.inventory.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiry_date,
        recurring: item.is_recurring,
      })),
    }),
  });

  register({
    name: "adjust_pantry_quantity",
    title: "Adjust pantry quantity",
    description: "Increase or decrease the quantity of one existing pantry item. Quantity never goes below zero.",
    inputSchema: {
      type: "object",
      properties: {
        inventoryItemId: { type: "string", description: "Inventory item UUID from list_pantry_inventory." },
        delta: { type: "number", description: "Signed amount to add, for example -1 or 0.5." },
      },
      required: ["inventoryItemId", "delta"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      const inventoryItemId = String(input.inventoryItemId ?? "");
      const delta = Number(input.delta);
      if (!data.inventory.some((item) => item.id === inventoryItemId) || !Number.isFinite(delta) || delta === 0) {
        throw new Error("Provide an existing inventory item ID and a non-zero numeric delta.");
      }
      await api.adjustInventory(inventoryItemId, delta);
      await refresh(true);
      return { inventoryItemId, adjustedBy: delta, status: "updated" };
    },
  });

  register({
    name: "add_to_next_order",
    title: "Add to Next Order",
    description: "Add a manual grocery item to the household's Next Order list, merging a duplicate name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        quantity: { type: "number", exclusiveMinimum: 0 },
        unit: { type: "string", minLength: 1, maxLength: 20 },
      },
      required: ["name", "quantity", "unit"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      const name = String(input.name ?? "").trim();
      const quantity = Number(input.quantity);
      const unit = String(input.unit ?? "").trim();
      if (!name || !unit || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Name, positive quantity, and unit are required.");
      await api.addManualNextOrder(context.household.id, name, quantity, unit);
      await refresh(true);
      return { name, quantity, unit, status: "added" };
    },
  });

  return () => lifecycle.abort();
}
