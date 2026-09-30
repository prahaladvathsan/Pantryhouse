import { z } from "zod";

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date")
  .transform((value) => value || null);

export const inventorySchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(80),
  category: z.string().trim().min(1, "Category is required").max(40),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative").max(100_000),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  expiry_date: optionalDate,
  is_recurring: z.boolean(),
  default_quantity: z.coerce.number().positive("Default quantity must be greater than zero").max(100_000),
  default_expiry_days: z.union([z.coerce.number().int().min(1).max(3650), z.null()]),
});

export const manualOrderSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(80),
  quantity: z.coerce.number().positive("Quantity must be greater than zero").max(100_000),
  unit: z.string().trim().min(1, "Unit is required").max(20),
});

export const householdSchema = z.object({
  householdName: z.string().trim().min(2, "Use at least two characters").max(60),
  memberName: z.string().trim().min(1, "Your name is required").max(60),
});

export const placementSchema = z.object({
  totalPaise: z.number().int().nonnegative(),
  participantIds: z.array(z.string().uuid()).min(1, "Choose at least one person"),
  items: z.array(
    z.object({
      name: z.string().trim().min(1),
      quantity: z.number().positive(),
      unit: z.string().trim().min(1),
      category: z.string().trim().min(1),
      expiry_date: optionalDate,
      product_name: z.string().trim().max(160).nullable(),
      brand: z.string().trim().max(80).nullable(),
      package_size: z.string().trim().max(60).nullable(),
      unit_price_paise: z.number().int().nonnegative().nullable(),
      line_total_paise: z.number().int().nonnegative().nullable(),
      bought: z.boolean(),
      source: z.enum(["next_order", "ad_hoc"]),
      inventory_item_id: z.string().uuid().nullable(),
      next_order_item_id: z.string().uuid().nullable(),
    }),
  ),
});
