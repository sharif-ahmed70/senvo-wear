import { z } from "zod";

const id = z.uuid();
const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();
const money = z.number().int().nonnegative();
const paymentMethod = z.enum([
  "CASH",
  "CARD",
  "MOBILE_BANKING",
  "BANK_TRANSFER",
]);
const status = z.enum(["ACTIVE", "INACTIVE"]);

export const commerceEmptyInputSchema = z.object({}).strict();
export const commerceIdInputSchema = z.object({ id }).strict();

export const createCustomerServiceInputSchema = z
  .object({
    address: optionalText(500),
    email: z.email().max(254).nullable().optional(),
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(5).max(40),
  })
  .strict();

export const updateCustomerServiceInputSchema = createCustomerServiceInputSchema
  .extend({
    customerId: id,
    expectedVersion: z.number().int().positive(),
    status,
  })
  .strict();

export const createVendorServiceInputSchema = z
  .object({
    address: optionalText(500),
    location: optionalText(160),
    name: z.string().trim().min(1).max(160),
    phone: optionalText(40),
  })
  .strict();

export const updateVendorServiceInputSchema = createVendorServiceInputSchema
  .extend({
    expectedVersion: z.number().int().positive(),
    status,
    vendorId: id,
  })
  .strict();

export const receivePurchaseServiceInputSchema = z
  .object({
    destinationLocationId: id,
    idempotencyKey: z.string().trim().min(8).max(128),
    lines: z
      .array(
        z
          .object({
            productVariantId: id,
            quantity: z.number().int().positive(),
            unitCostMinor: money,
          })
          .strict(),
      )
      .min(1)
      .max(500),
    note: optionalText(1000),
    paidMinor: money.default(0),
    paymentMethod: paymentMethod.nullable().optional(),
    paymentReference: optionalText(120),
    vendorId: id,
  })
  .strict()
  .superRefine((input, context) => {
    const total = input.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitCostMinor,
      0,
    );
    if (input.paidMinor > total)
      context.addIssue({
        code: "custom",
        message: "Paid amount cannot exceed the purchase total.",
        path: ["paidMinor"],
      });
    if (input.paidMinor > 0 && !input.paymentMethod)
      context.addIssue({
        code: "custom",
        message: "Payment method is required when a payment is recorded.",
        path: ["paymentMethod"],
      });
    if (
      new Set(input.lines.map((line) => line.productVariantId)).size !==
      input.lines.length
    )
      context.addIssue({
        code: "custom",
        message: "Each variant can appear only once.",
        path: ["lines"],
      });
  });

export const recordVendorPaymentServiceInputSchema = z
  .object({
    amountMinor: money.positive(),
    idempotencyKey: z.string().trim().min(8).max(128),
    method: paymentMethod,
    purchaseOrderId: id.nullable().optional(),
    reference: optionalText(120),
    vendorId: id,
  })
  .strict();

const dateString = z.iso.datetime({ offset: true });

export const customerSummaryContractSchema = z
  .object({
    address: z.string().nullable(),
    dueMinor: money,
    email: z.string().nullable(),
    id,
    name: z.string(),
    phone: z.string(),
    status,
    totalPurchaseMinor: money,
    updatedAt: dateString,
    version: z.number().int().positive(),
  })
  .strict();

export const customerProfileContractSchema = customerSummaryContractSchema
  .extend({
    orders: z.array(
      z
        .object({
          createdAt: dateString,
          id,
          orderNumber: z.string(),
          paidMinor: money,
          status: z.string(),
          totalMinor: money,
        })
        .strict(),
    ),
  })
  .strict();

export const vendorSummaryContractSchema = z
  .object({
    address: z.string().nullable(),
    dueMinor: money,
    id,
    location: z.string().nullable(),
    name: z.string(),
    paidMinor: money,
    phone: z.string().nullable(),
    purchaseMinor: money,
    status,
    updatedAt: dateString,
    version: z.number().int().positive(),
  })
  .strict();

export const purchaseOrderSummaryContractSchema = z
  .object({
    destinationLocationId: id,
    destinationLocationName: z.string(),
    dueMinor: money,
    id,
    inventoryMovementId: id.nullable(),
    lines: z.array(
      z
        .object({
          lineTotalMinor: money,
          productName: z.string(),
          productVariantId: id,
          quantity: z.number().int().positive(),
          sku: z.string(),
          unitCostMinor: money,
        })
        .strict(),
    ),
    orderedAt: dateString,
    paidMinor: money,
    purchaseNumber: z.string(),
    receivedAt: dateString.nullable(),
    status: z.enum(["DRAFT", "RECEIVED", "CANCELLED"]),
    totalMinor: money,
    vendorId: id,
    vendorName: z.string(),
    version: z.number().int().positive(),
  })
  .strict();

export const vendorPaymentContractSchema = z
  .object({
    amountMinor: money.positive(),
    id,
    method: paymentMethod,
    paidAt: dateString,
    purchaseOrderId: id.nullable(),
    reference: z.string().nullable(),
    vendorId: id,
  })
  .strict();

export type CreateCustomerServiceInputContract = z.infer<
  typeof createCustomerServiceInputSchema
>;
export type UpdateCustomerServiceInputContract = z.infer<
  typeof updateCustomerServiceInputSchema
>;
export type CreateVendorServiceInputContract = z.infer<
  typeof createVendorServiceInputSchema
>;
export type UpdateVendorServiceInputContract = z.infer<
  typeof updateVendorServiceInputSchema
>;
export type ReceivePurchaseServiceInputContract = z.infer<
  typeof receivePurchaseServiceInputSchema
>;
export type RecordVendorPaymentServiceInputContract = z.infer<
  typeof recordVendorPaymentServiceInputSchema
>;
export type CustomerSummaryContract = z.infer<
  typeof customerSummaryContractSchema
>;
export type CustomerProfileContract = z.infer<
  typeof customerProfileContractSchema
>;
export type VendorSummaryContract = z.infer<typeof vendorSummaryContractSchema>;
export type PurchaseOrderSummaryContract = z.infer<
  typeof purchaseOrderSummaryContractSchema
>;
export type VendorPaymentContract = z.infer<typeof vendorPaymentContractSchema>;
