import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@^2.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";
import { z } from "npm:zod@^4.3.6";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase function credentials are unavailable.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const nullableMoney = z.number().finite().min(0).max(1_000_000_000).nullable();

const capturedProductSchema = z.object({
  requestedItemId: z.string().uuid().nullable().describe(
    "The Pantryhouse item ID shown in the shopping prompt. Use null only for an unrequested ad-hoc product.",
  ),
  requestedName: z.string().trim().min(1).max(80).describe("The generic pantry item type, such as Milk."),
  productName: z.string().trim().min(1).max(160).describe("The exact catalogue product selected."),
  brand: nullableText(80).describe("The product brand, or null when the catalogue does not provide one."),
  packageSize: nullableText(60).describe("The package size printed in the catalogue, such as 1 L."),
  quantity: z.number().finite().positive().max(100_000).describe("The quantity that should enter pantry stock."),
  unit: z.string().trim().min(1).max(20).describe("The unit for that quantity, such as L, kg, pcs, or pack."),
  unitPrice: nullableMoney.describe("Unit price in rupees, or null if it is not shown."),
  lineTotal: nullableMoney.describe("Line total in rupees, or null if it is not shown."),
});

const toPaise = (value: number | null) => value === null ? null : Math.round(value * 100);

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: "Pantryhouse orders", version: "1.0.0" });

  server.registerTool(
    "record_order_result",
    {
      title: "Send selected products to Pantryhouse",
      description:
        "Populate an open Pantryhouse draft with the exact products selected in the shopping cart. " +
        "Call this only after the user says the cart is final. This does not place, pay for, or confirm the order; " +
        "the user reviews it in Pantryhouse first.",
      inputSchema: z.object({
        orderId: z.string().uuid().describe("The Pantryhouse order ID supplied in the user's shopping prompt."),
        orderCode: z.string().regex(/^[0-9a-f]{64}$/).describe(
          "The short-lived, single-order Pantryhouse authorization code supplied in the user's shopping prompt.",
        ),
        totalAmount: nullableMoney.describe("The current cart total in rupees, or null if it is not visible."),
        products: z.array(capturedProductSchema).min(1).max(100),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ orderId, orderCode, totalAmount, products }) => {
      const items = products.map((product) => ({
        requested_item_id: product.requestedItemId,
        requested_name: product.requestedName,
        product_name: product.productName,
        brand: product.brand,
        package_size: product.packageSize,
        quantity: product.quantity,
        unit: product.unit,
        unit_price_paise: toPaise(product.unitPrice),
        line_total_paise: toPaise(product.lineTotal),
      }));

      const { data, error } = await admin.rpc("submit_order_capture", {
        p_order_id: orderId,
        p_code: orderCode,
        p_total_amount_paise: toPaise(totalAmount),
        p_items: items,
      });

      if (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: error.message }],
        };
      }

      const result = data as { itemCount?: number; alreadyReceived?: boolean } | null;
      const count = result?.itemCount ?? products.length;
      return {
        content: [{
          type: "text" as const,
          text: result?.alreadyReceived
            ? `Pantryhouse had already received this order result. ${count} products are ready for review.`
            : `Sent ${count} products to Pantryhouse. The user can now review and confirm the order there.`,
        }],
        structuredContent: data ?? { orderId, itemCount: count },
      };
    },
  );

  return server;
});

Deno.serve((request) => handler.fetch(request));
