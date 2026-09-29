import type { PantryApi } from "../types";
import { demoApi } from "./demoApi";
import { createSupabaseApi, hasSupabaseConfig } from "./supabaseApi";

export const api: PantryApi = hasSupabaseConfig ? createSupabaseApi() : demoApi;
