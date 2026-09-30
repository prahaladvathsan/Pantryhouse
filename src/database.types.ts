// Baseline generated-style types for the initial Pantryhouse migration.
// Regenerate from the linked Supabase project after every schema change.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; invite_token_hash: string; timezone: string; default_expiry_days: number; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; invite_token_hash: string; timezone?: string; default_expiry_days?: number; created_at?: string; updated_at?: string };
        Update: { name?: string; invite_token_hash?: string; timezone?: string; default_expiry_days?: number; updated_at?: string };
        Relationships: [];
      };
      members: {
        Row: { id: string; household_id: string; name: string; name_key: string; created_at: string; updated_at: string };
        Insert: { id?: string; household_id: string; name: string; name_key: string; created_at?: string; updated_at?: string };
        Update: { name?: string; name_key?: string; updated_at?: string };
        Relationships: [];
      };
      member_sessions: {
        Row: { auth_user_id: string; household_id: string; member_id: string; created_at: string };
        Insert: { auth_user_id: string; household_id: string; member_id: string; created_at?: string };
        Update: { member_id?: string };
        Relationships: [];
      };
      inventory_items: {
        Row: { id: string; household_id: string; name: string; name_key: string; category: string; quantity: number; unit: string; expiry_date: string | null; is_recurring: boolean; default_quantity: number; default_expiry_days: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; household_id: string; name: string; name_key: string; category?: string; quantity?: number; unit?: string; expiry_date?: string | null; is_recurring?: boolean; default_quantity?: number; default_expiry_days?: number | null; created_at?: string; updated_at?: string };
        Update: { name?: string; name_key?: string; category?: string; quantity?: number; unit?: string; expiry_date?: string | null; is_recurring?: boolean; default_quantity?: number; default_expiry_days?: number | null; updated_at?: string };
        Relationships: [];
      };
      next_order_items: {
        Row: { id: string; household_id: string; inventory_item_id: string | null; name: string; name_key: string; quantity: number; unit: string; source_auto: boolean; source_manual: boolean; dismissed: boolean; locked_order_id: string | null; added_by_member_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; household_id: string; inventory_item_id?: string | null; name: string; name_key: string; quantity: number; unit: string; source_auto?: boolean; source_manual?: boolean; dismissed?: boolean; locked_order_id?: string | null; added_by_member_id?: string | null; created_at?: string; updated_at?: string };
        Update: { inventory_item_id?: string | null; quantity?: number; unit?: string; source_auto?: boolean; source_manual?: boolean; dismissed?: boolean; locked_order_id?: string | null; updated_at?: string };
        Relationships: [];
      };
      orders: {
        Row: { id: string; household_id: string; status: Database["public"]["Enums"]["order_status"]; placed_by_member_id: string; total_amount_paise: number | null; started_at: string; placed_at: string | null; cancelled_at: string | null; assistant_capture_received_at: string | null; assistant_capture_total_amount_paise: number | null; updated_at: string };
        Insert: { id?: string; household_id: string; status?: Database["public"]["Enums"]["order_status"]; placed_by_member_id: string; total_amount_paise?: number | null; started_at?: string; placed_at?: string | null; cancelled_at?: string | null; assistant_capture_received_at?: string | null; assistant_capture_total_amount_paise?: number | null; updated_at?: string };
        Update: { status?: Database["public"]["Enums"]["order_status"]; total_amount_paise?: number | null; placed_at?: string | null; cancelled_at?: string | null; assistant_capture_received_at?: string | null; assistant_capture_total_amount_paise?: number | null; updated_at?: string };
        Relationships: [];
      };
      order_items: {
        Row: { id: string; household_id: string; order_id: string; inventory_item_id: string | null; next_order_item_id: string | null; name: string; name_key: string; quantity: number; unit: string; category: string; expiry_date: string | null; product_name: string | null; brand: string | null; package_size: string | null; unit_price_paise: number | null; line_total_paise: number | null; feedback: number; bought: boolean; source: Database["public"]["Enums"]["order_item_source"]; created_at: string };
        Insert: { id?: string; household_id: string; order_id: string; inventory_item_id?: string | null; next_order_item_id?: string | null; name: string; name_key: string; quantity: number; unit: string; category?: string; expiry_date?: string | null; product_name?: string | null; brand?: string | null; package_size?: string | null; unit_price_paise?: number | null; line_total_paise?: number | null; feedback?: number; bought?: boolean; source?: Database["public"]["Enums"]["order_item_source"]; created_at?: string };
        Update: { bought?: boolean; quantity?: number; unit?: string; category?: string; expiry_date?: string | null; product_name?: string | null; brand?: string | null; package_size?: string | null; unit_price_paise?: number | null; line_total_paise?: number | null; feedback?: number };
        Relationships: [];
      };
      order_splits: {
        Row: { household_id: string; order_id: string; member_id: string; amount_paise: number; settled_at: string | null; created_at: string };
        Insert: { household_id: string; order_id: string; member_id: string; amount_paise: number; settled_at?: string | null; created_at?: string };
        Update: { settled_at?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_household_context: { Args: Record<PropertyKey, never>; Returns: Json };
      create_household: { Args: { p_household_name: string; p_member_name: string }; Returns: Json };
      preview_household_invite: { Args: { p_token: string }; Returns: Json };
      join_household: { Args: { p_token: string; p_member_id?: string | null; p_member_name?: string | null }; Returns: Json };
      rotate_household_invite: { Args: Record<PropertyKey, never>; Returns: string };
      sync_next_order: { Args: { p_household_id: string }; Returns: undefined };
      adjust_inventory_quantity: { Args: { p_inventory_id: string; p_delta: number }; Returns: number };
      add_manual_next_order: { Args: { p_household_id: string; p_name: string; p_quantity: number; p_unit: string }; Returns: string };
      dismiss_next_order_item: { Args: { p_item_id: string }; Returns: undefined };
      start_order: { Args: { p_household_id: string }; Returns: string };
      create_order_handoff: { Args: { p_order_id: string }; Returns: Json };
      submit_order_capture: { Args: { p_order_id: string; p_code: string; p_total_amount_paise: number | null; p_items: Json }; Returns: Json };
      cancel_order: { Args: { p_order_id: string }; Returns: undefined };
      place_order: { Args: { p_order_id: string; p_total_amount_paise: number; p_participant_ids: string[]; p_items: Json }; Returns: undefined };
      rate_order_item: { Args: { p_order_item_id: string; p_feedback: number }; Returns: undefined };
      set_split_settled: { Args: { p_order_id: string; p_member_id: string; p_settled: boolean }; Returns: undefined };
    };
    Enums: {
      order_status: "draft" | "placed" | "cancelled";
      order_item_source: "next_order" | "ad_hoc";
    };
    CompositeTypes: Record<string, never>;
  };
};
