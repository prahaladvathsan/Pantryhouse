import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardData,
  HouseholdContext,
  InventoryInput,
  InvitePreview,
  Order,
  OrderHandoff,
  PantryApi,
  PlacementInput,
  UUID,
} from "../types";
import type { Database } from "../database.types";
import { normaliseName } from "./domain";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(url && key && !url.includes("your-project"));

export const createSupabaseApi = (): PantryApi => {
  const client = createClient<Database>(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const rpc = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> => {
    const result = await client.rpc(fn as never, args as never);
    if (result.error) throw new Error(result.error.message);
    return result.data as T | null;
  };

  const requiredRpc = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const data = await rpc<T>(fn, args);
    if (data === null) throw new Error("The server returned no data.");
    return data;
  };

  const api: PantryApi = {
    isDemo: false,
    async ensureSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(error.message);
      if (!data.session) {
        const signedIn = await client.auth.signInAnonymously();
        if (signedIn.error) throw new Error(signedIn.error.message);
      }
    },
    async getContext() {
      return rpc<HouseholdContext>("current_household_context");
    },
    async previewInvite(token: string) {
      return requiredRpc<InvitePreview>("preview_household_invite", { p_token: token });
    },
    async createHousehold(householdName: string, memberName: string) {
      return requiredRpc<{ context: HouseholdContext; inviteToken: string }>("create_household", {
        p_household_name: householdName,
        p_member_name: memberName,
      });
    },
    async joinHousehold(token: string, memberId: UUID | null, memberName: string | null) {
      return requiredRpc<HouseholdContext>("join_household", {
        p_token: token,
        p_member_id: memberId,
        p_member_name: memberName,
      });
    },
    async rotateInvite() {
      return requiredRpc<string>("rotate_household_invite");
    },
    async loadData(householdId: UUID): Promise<DashboardData> {
      const [inventoryResult, nextResult, memberResult, orderResult] = await Promise.all([
        client.from("inventory_items").select("*").eq("household_id", householdId).order("name"),
        client.from("next_order_items").select("*").eq("household_id", householdId).order("created_at"),
        client.from("members").select("*").eq("household_id", householdId).order("name"),
        client
          .from("orders")
          .select("*, order_items(*), order_splits(*, member:members(*))")
          .eq("household_id", householdId)
          .order("started_at", { ascending: false }),
      ]);
      for (const result of [inventoryResult, nextResult, memberResult, orderResult]) {
        if (result.error) throw new Error(result.error.message);
      }
      return {
        inventory: (inventoryResult.data ?? []) as DashboardData["inventory"],
        nextOrder: (nextResult.data ?? []) as DashboardData["nextOrder"],
        members: (memberResult.data ?? []) as DashboardData["members"],
        orders: (orderResult.data ?? []) as unknown as Order[],
      };
    },
    subscribe(householdId: UUID, onChange: () => void) {
      const tables = ["inventory_items", "next_order_items", "members", "orders", "order_items", "order_splits"];
      const channel: RealtimeChannel = client.channel(`household:${householdId}`);
      for (const table of tables) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` }, onChange);
      }
      channel.subscribe();
      return () => { void client.removeChannel(channel); };
    },
    async saveInventory(householdId, input, id) {
      const values = { ...input, name_key: normaliseName(input.name) };
      const result = id
        ? await client.from("inventory_items").update(values).eq("id", id)
        : await client.from("inventory_items").insert({ ...values, household_id: householdId });
      if (result.error) throw new Error(result.error.message);
      await api.syncNextOrder(householdId);
    },
    async deleteInventory(id) {
      const related = await client.from("next_order_items").select("id, source_manual").eq("inventory_item_id", id);
      if (related.error) throw new Error(related.error.message);
      const manualIds = (related.data ?? []).filter((item) => item.source_manual).map((item) => item.id);
      const automaticIds = (related.data ?? []).filter((item) => !item.source_manual).map((item) => item.id);
      if (manualIds.length) {
        const kept = await client.from("next_order_items").update({ inventory_item_id: null, source_auto: false }).in("id", manualIds);
        if (kept.error) throw new Error(kept.error.message);
      }
      if (automaticIds.length) {
        const removed = await client.from("next_order_items").delete().in("id", automaticIds);
        if (removed.error) throw new Error(removed.error.message);
      }
      const result = await client.from("inventory_items").delete().eq("id", id);
      if (result.error) throw new Error(result.error.message);
    },
    async adjustInventory(id, delta) {
      await rpc("adjust_inventory_quantity", { p_inventory_id: id, p_delta: delta });
    },
    async syncNextOrder(householdId) {
      await rpc("sync_next_order", { p_household_id: householdId });
    },
    async addManualNextOrder(householdId, name, quantity, unit) {
      await rpc("add_manual_next_order", { p_household_id: householdId, p_name: name, p_quantity: quantity, p_unit: unit });
    },
    async updateNextOrder(id, quantity, unit) {
      const result = await client.from("next_order_items").update({ quantity, unit }).eq("id", id);
      if (result.error) throw new Error(result.error.message);
    },
    async dismissNextOrder(id) {
      await rpc("dismiss_next_order_item", { p_item_id: id });
    },
    async startOrder(householdId) {
      return requiredRpc<UUID>("start_order", { p_household_id: householdId });
    },
    async createOrderHandoff(orderId) {
      return requiredRpc<OrderHandoff>("create_order_handoff", { p_order_id: orderId });
    },
    async cancelOrder(orderId) {
      await rpc("cancel_order", { p_order_id: orderId });
    },
    async placeOrder(input: PlacementInput) {
      await rpc("place_order", {
        p_order_id: input.orderId,
        p_total_amount_paise: input.totalPaise,
        p_participant_ids: input.participantIds,
        p_items: input.items,
      });
    },
    async rateOrderItem(orderItemId, feedback) {
      await rpc("rate_order_item", { p_order_item_id: orderItemId, p_feedback: feedback });
    },
    async setSplitSettled(orderId, memberId, settled) {
      await rpc("set_split_settled", { p_order_id: orderId, p_member_id: memberId, p_settled: settled });
    },
  };

  return api;
};

export type PantrySupabaseClient = SupabaseClient;
