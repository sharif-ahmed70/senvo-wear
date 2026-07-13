import { z } from "zod";

export const apiErrorCategories = [
  "VALIDATION",
  "AUTHENTICATION",
  "AUTHORIZATION",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_RULE",
  "CONCURRENCY",
  "RATE_LIMIT",
  "INTEGRATION",
  "INTERNAL",
] as const;

export type ApiErrorCategory = (typeof apiErrorCategories)[number];

export type ApiErrorCode = `${ApiErrorCategory}.${string}`;

export type ApiSuccess<T, TMeta = undefined> = {
  success: true;
  data: T;
  meta?: TMeta;
  requestId: string;
};

export type PublicErrorDetails =
  | string
  | number
  | boolean
  | null
  | PublicErrorDetails[]
  | { [key: string]: PublicErrorDetails };

export type ApiFailure = {
  success: false;
  error: {
    code: ApiErrorCode;
    details?: PublicErrorDetails;
    fieldErrors?: Record<string, string[]>;
    message: string;
  };
  requestId: string;
};

export type ApiResponse<T, TMeta = undefined> =
  ApiSuccess<T, TMeta> | ApiFailure;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalCount?: number;
  totalPages?: number;
};

export type SortDirection = "asc" | "desc";

export type SortSpec<TField extends string = string> = {
  direction: SortDirection;
  field: TField;
};

export type FilterValue = string | number | boolean | null | string[];

export type FilterSpec<TField extends string = string> = Partial<
  Record<TField, FilterValue>
>;

export const requestIdSchema = z.string().min(8).max(128);

export const apiErrorCodeSchema = z
  .string()
  .regex(
    /^(VALIDATION|AUTHENTICATION|AUTHORIZATION|NOT_FOUND|CONFLICT|BUSINESS_RULE|CONCURRENCY|RATE_LIMIT|INTEGRATION|INTERNAL)\.[A-Z0-9_]+$/,
    "Error codes must use CATEGORY.SPECIFIC_REASON format.",
  );

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(250),
  totalCount: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
});

export function createApiSuccess<T, TMeta = undefined>(
  data: T,
  requestId: string,
  meta?: TMeta,
): ApiSuccess<T, TMeta> {
  return meta === undefined
    ? { data, requestId, success: true }
    : { data, meta, requestId, success: true };
}

export function createApiFailure(input: {
  code: ApiErrorCode;
  details?: PublicErrorDetails;
  fieldErrors?: Record<string, string[]>;
  message: string;
  requestId: string;
}): ApiFailure {
  return {
    error: {
      code: input.code,
      details: input.details,
      fieldErrors: input.fieldErrors,
      message: input.message,
    },
    requestId: input.requestId,
    success: false,
  };
}

const idSchema = z.string().uuid();
const displayNameSchema = z.string().trim().min(1).max(160);
const descriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .nullable()
  .optional();
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9-]+$/,
    "Codes may contain only letters, numbers, and hyphen.",
  );
const skuSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(
    /^[A-Za-z0-9-]+$/,
    "SKUs may contain only letters, numbers, and hyphen.",
  );
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slugs must be lowercase, URL-safe, and hyphen-separated.",
  );
const hexValueSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Hex values must use #RRGGBB format.")
  .nullable()
  .optional();
const optionalTextSchema = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable().optional();
const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Country codes must use two letters.")
  .optional();
const timezoneSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/,
    "Timezone must be an IANA-style timezone.",
  )
  .optional();
const emailSchema = z.string().trim().email().nullable().optional();
const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^[+0-9() .-]+$/,
    "Phone may contain only digits, spaces, +, -, ., and parentheses.",
  )
  .max(40)
  .nullable()
  .optional();
const isoTimestampSchema = z.string().datetime({ offset: true });
const expectedVersionSchema = z.number().int().positive();
const positiveInventoryQuantitySchema = z.number().int().positive();
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const cursorSchema = z
  .string()
  .max(256)
  .regex(/^v1\|[^|]+\|[0-9a-fA-F-]{36}$/, "Cursor format is invalid.");
const movementCursorSchema = z
  .string()
  .max(300)
  .regex(
    /^movement-v1\|[^|]+\|[0-9a-fA-F-]{36}$/,
    "Movement cursor format is invalid.",
  );
const balanceCursorSchema = z
  .string()
  .max(64)
  .regex(/^balance-v1\|[0-9a-fA-F-]{36}$/, "Balance cursor format is invalid.");
const reservationCursorSchema = z
  .string()
  .max(300)
  .regex(
    /^reservation-v1\|[^|]+\|[0-9a-fA-F-]{36}$/,
    "Reservation cursor format is invalid.",
  );
const availabilityCursorSchema = z
  .string()
  .max(80)
  .regex(
    /^availability-v1\|[0-9a-fA-F-]{36}$/,
    "Availability cursor format is invalid.",
  );
const salesOrderCursorSchema = z
  .string()
  .max(300)
  .regex(
    /^sales-order-v1\|[^|]+\|[0-9a-fA-F-]{36}$/,
    "Sales order cursor format is invalid.",
  );
const cursorPageRequestSchema = z
  .object({
    cursor: cursorSchema.optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();
const movementCursorPageRequestSchema = z
  .object({
    cursor: movementCursorSchema.optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();
const balanceCursorPageRequestSchema = z
  .object({
    cursor: balanceCursorSchema.optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();
const reservationCursorPageRequestSchema = z
  .object({
    cursor: reservationCursorSchema.optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();
const availabilityCursorPageRequestSchema = z
  .object({
    cursor: availabilityCursorSchema.optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();
const salesOrderCursorPageRequestSchema = z
  .object({
    cursor: salesOrderCursorSchema.optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();

export const branchStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const branchTypeSchema = z.enum([
  "SHOWROOM",
  "WAREHOUSE",
  "OFFICE",
  "FULFILMENT",
  "HYBRID",
]);
export const stockLocationStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);
export const stockLocationTypeSchema = z.enum([
  "WAREHOUSE",
  "SHOWROOM",
  "QC_HOLD",
  "DAMAGE_HOLD",
  "RETURN_HOLD",
  "TRANSIT",
  "OTHER",
]);
export const posCounterStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);
export const inventoryMovementTypeSchema = z.enum([
  "OPENING",
  "RECEIPT",
  "ISSUE",
  "TRANSFER",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
]);
export const inventoryMovementStatusSchema = z.enum(["DRAFT", "POSTED"]);
export const inventoryReservationStatusSchema = z.enum([
  "ACTIVE",
  "CONFIRMED",
  "RELEASED",
  "EXPIRED",
]);
export const inventoryAllocationPolicyStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);
export const inventoryAllocationStrategySchema = z.enum(["PRIORITY_ORDER"]);
export const salesOrderStatusSchema = z.enum([
  "DRAFT",
  "RESERVED",
  "CONFIRMED",
  "CANCELLED",
  "FULFILLED",
]);
export const salesOrderChannelSchema = z.enum(["ONLINE", "POS", "MANUAL"]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE", "LOCKED"]);
export const organizationMembershipStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
]);
export const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF"]);

export const inventoryMovementLineInputSchema = z
  .object({
    note: optionalTextSchema(500),
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
  })
  .strict();

export const createOrganizationInputSchema = z.object({
  code: codeSchema,
  name: displayNameSchema,
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createUserInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    name: optionalTextSchema(160),
    status: userStatusSchema.optional(),
  })
  .strict();

export const createOrganizationMembershipInputSchema = z
  .object({
    organizationId: idSchema,
    role: roleSchema,
    status: organizationMembershipStatusSchema.optional(),
    userId: idSchema,
  })
  .strict();

export const updateOrganizationMembershipStatusInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    membershipId: idSchema,
    organizationId: idSchema,
    status: organizationMembershipStatusSchema,
  })
  .strict();

export const assignOrganizationMembershipRoleInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    membershipId: idSchema,
    organizationId: idSchema,
    role: roleSchema,
  })
  .strict();

export const createCategoryInputSchema = z.object({
  description: descriptionSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  parentId: idSchema.nullable().optional(),
  slug: slugSchema,
  sortOrder: z.number().int().nonnegative().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createCollectionInputSchema = z.object({
  description: descriptionSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  slug: slugSchema,
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createColorInputSchema = z.object({
  code: codeSchema,
  hexValue: hexValueSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createSizeInputSchema = z.object({
  code: codeSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  sortOrder: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createProductInputSchema = z.object({
  categoryId: idSchema,
  description: descriptionSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  productCode: codeSchema,
  slug: slugSchema,
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const createProductVariantInputSchema = z.object({
  colorId: idSchema,
  organizationId: idSchema,
  productId: idSchema,
  sizeId: idSchema,
  sku: skuSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const createBranchInputSchema = z.object({
  addressLine1: optionalTextSchema(240),
  addressLine2: optionalTextSchema(240),
  city: optionalTextSchema(120),
  code: codeSchema,
  countryCode: countryCodeSchema,
  district: optionalTextSchema(120),
  email: emailSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  phone: phoneSchema,
  postalCode: optionalTextSchema(120),
  status: branchStatusSchema.optional(),
  timezone: timezoneSchema,
  type: branchTypeSchema.optional(),
});

export const createStockLocationInputSchema = z.object({
  branchId: idSchema,
  code: codeSchema,
  isSellable: z.boolean().optional(),
  name: displayNameSchema,
  organizationId: idSchema,
  status: stockLocationStatusSchema.optional(),
  type: stockLocationTypeSchema.optional(),
});

export const createPosCounterInputSchema = z.object({
  branchId: idSchema,
  code: codeSchema,
  name: displayNameSchema,
  organizationId: idSchema,
  status: posCounterStatusSchema.optional(),
});

export const createInventoryMovementInputSchema = z
  .object({
    destinationLocationId: idSchema.nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(inventoryMovementLineInputSchema).min(1).max(500),
    movementNumber: codeSchema,
    note: optionalTextSchema(1000),
    occurredAt: isoTimestampSchema.optional(),
    organizationId: idSchema,
    referenceId: optionalTextSchema(120),
    referenceType: optionalTextSchema(80),
    sourceLocationId: idSchema.nullable().optional(),
    type: inventoryMovementTypeSchema,
  })
  .strict();

export const replaceDraftMovementLinesInputSchema = z
  .object({
    lines: z.array(inventoryMovementLineInputSchema).min(1).max(500),
    movementId: idSchema,
    organizationId: idSchema,
  })
  .strict();

export const postInventoryMovementInputSchema = z
  .object({
    movementId: idSchema,
    organizationId: idSchema,
  })
  .strict();

export const reverseInventoryMovementInputSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    occurredAt: isoTimestampSchema.optional(),
    organizationId: idSchema,
    originalMovementId: idSchema,
    reason: z.string().trim().min(1).max(1000),
    referenceId: optionalTextSchema(120),
    referenceType: optionalTextSchema(80),
    reversalMovementNumber: codeSchema,
  })
  .strict();

export const inventoryReservationLineInputSchema = z
  .object({
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
  })
  .strict();

export const inventoryAllocationLineInputSchema = z
  .object({
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
  })
  .strict();

export const inventoryAllocationLinesInputSchema = z
  .array(inventoryAllocationLineInputSchema)
  .min(1)
  .max(500)
  .refine(
    (lines) =>
      new Set(lines.map((line) => line.productVariantId)).size === lines.length,
    "productVariantId must be unique per allocation.",
  );

export const inventoryAllocationPolicyLocationInputSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    priority: z.number().int().positive(),
    stockLocationId: idSchema,
  })
  .strict();

export const inventoryAllocationPolicyLocationsInputSchema = z
  .array(inventoryAllocationPolicyLocationInputSchema)
  .max(100)
  .superRefine((locations, context) => {
    const locationIds = new Set<string>();
    const priorities = new Set<number>();
    for (const [index, location] of locations.entries()) {
      if (locationIds.has(location.stockLocationId)) {
        context.addIssue({
          code: "custom",
          message: "stockLocationId must be unique per policy.",
          path: [index, "stockLocationId"],
        });
      }
      if (priorities.has(location.priority)) {
        context.addIssue({
          code: "custom",
          message: "priority must be unique per policy.",
          path: [index, "priority"],
        });
      }
      locationIds.add(location.stockLocationId);
      priorities.add(location.priority);
    }
  });

export const createInventoryReservationInputSchema = z
  .object({
    expiresAt: isoTimestampSchema.nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(inventoryReservationLineInputSchema).min(1).max(500),
    note: optionalTextSchema(1000),
    organizationId: idSchema,
    referenceId: optionalTextSchema(120),
    referenceType: optionalTextSchema(80),
    reservationNumber: codeSchema,
    stockLocationId: idSchema,
  })
  .strict();

export const confirmInventoryReservationInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    organizationId: idSchema,
    reservationId: idSchema,
  })
  .strict();

export const releaseInventoryReservationInputSchema =
  confirmInventoryReservationInputSchema;

export const expireInventoryReservationInputSchema =
  confirmInventoryReservationInputSchema;

export const consumeInventoryReservationInputSchema = z
  .object({
    expectedReservationVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    movementNumber: codeSchema,
    note: optionalTextSchema(1000),
    occurredAt: isoTimestampSchema,
    organizationId: idSchema,
    referenceId: optionalTextSchema(120),
    referenceType: optionalTextSchema(80),
    reservationId: idSchema,
  })
  .strict();

export const createInventoryAllocationPolicyInputSchema = z
  .object({
    code: codeSchema,
    name: displayNameSchema,
    organizationId: idSchema,
    requireSellableLocation: z.boolean().optional(),
  })
  .strict();

export const updateInventoryAllocationPolicyMetadataInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    name: displayNameSchema,
    organizationId: idSchema,
    policyId: idSchema,
    requireSellableLocation: z.boolean().optional(),
  })
  .strict();

export const replaceInventoryAllocationPolicyLocationsInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    locations: inventoryAllocationPolicyLocationsInputSchema,
    organizationId: idSchema,
    policyId: idSchema,
  })
  .strict();

export const changeInventoryAllocationPolicyStatusInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    organizationId: idSchema,
    policyId: idSchema,
    status: inventoryAllocationPolicyStatusSchema,
  })
  .strict();

export const previewInventoryAllocationInputSchema = z
  .object({
    lines: inventoryAllocationLinesInputSchema,
    organizationId: idSchema,
    policyId: idSchema,
    preferredBranchId: idSchema.nullable().optional(),
    preferredLocationId: idSchema.nullable().optional(),
  })
  .strict();

export const allocateAndCreateInventoryReservationInputSchema = z
  .object({
    expiresAt: isoTimestampSchema.nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
    lines: inventoryAllocationLinesInputSchema,
    note: optionalTextSchema(1000),
    organizationId: idSchema,
    policyId: idSchema,
    preferredBranchId: idSchema.nullable().optional(),
    preferredLocationId: idSchema.nullable().optional(),
    referenceId: optionalTextSchema(120),
    referenceType: optionalTextSchema(80),
    reservationNumber: codeSchema,
  })
  .strict();

const salesOrderCurrencyCodeSchema = z.literal("BDT");
const minorUnitAmountSchema = z.number().int().nonnegative().max(2_147_483_647);
const salesOrderLineInputSchema = z
  .object({
    discountMinor: minorUnitAmountSchema.optional(),
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
    unitPriceMinor: minorUnitAmountSchema,
  })
  .strict()
  .refine(
    (line) => (line.discountMinor ?? 0) <= line.quantity * line.unitPriceMinor,
    "Line discount cannot exceed line gross.",
  );

const salesOrderLinesInputSchema = z
  .array(salesOrderLineInputSchema)
  .min(1)
  .max(500)
  .superRefine((lines, context) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.productVariantId)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate product variants are not allowed.",
          path: [index, "productVariantId"],
        });
      }
      seen.add(line.productVariantId);
    });
  });

export const createSalesOrderInputSchema = z
  .object({
    allocationPolicyId: idSchema.nullable().optional(),
    channel: salesOrderChannelSchema,
    currencyCode: salesOrderCurrencyCodeSchema,
    customerEmail: emailSchema,
    customerName: optionalTextSchema(160),
    customerPhone: phoneSchema,
    deliveryAddressLine1: optionalTextSchema(240),
    deliveryAddressLine2: optionalTextSchema(240),
    deliveryCity: optionalTextSchema(120),
    deliveryDistrict: optionalTextSchema(120),
    deliveryMinor: minorUnitAmountSchema.optional(),
    deliveryPostalCode: optionalTextSchema(120),
    idempotencyKey: idempotencyKeySchema,
    lines: salesOrderLinesInputSchema,
    note: optionalTextSchema(1000),
    orderDiscountMinor: minorUnitAmountSchema.optional(),
    orderNumber: codeSchema,
    organizationId: idSchema,
  })
  .strict();

export const createSalesOrderServiceInputSchema = z
  .object({
    allocationPolicyId: idSchema.nullable().optional(),
    channel: salesOrderChannelSchema,
    currencyCode: salesOrderCurrencyCodeSchema,
    customerEmail: emailSchema,
    customerName: optionalTextSchema(160),
    customerPhone: phoneSchema,
    deliveryAddressLine1: optionalTextSchema(240),
    deliveryAddressLine2: optionalTextSchema(240),
    deliveryCity: optionalTextSchema(120),
    deliveryDistrict: optionalTextSchema(120),
    deliveryMinor: minorUnitAmountSchema.optional(),
    deliveryPostalCode: optionalTextSchema(120),
    idempotencyKey: idempotencyKeySchema,
    lines: salesOrderLinesInputSchema,
    note: optionalTextSchema(1000),
    orderDiscountMinor: minorUnitAmountSchema.optional(),
    orderNumber: codeSchema,
  })
  .strict();

const draftSalesOrderMetadataChangesSchema = z
  .object({
    allocationPolicyId: idSchema.nullable().optional(),
    customerEmail: emailSchema,
    customerName: optionalTextSchema(160),
    customerPhone: phoneSchema,
    deliveryAddressLine1: optionalTextSchema(240),
    deliveryAddressLine2: optionalTextSchema(240),
    deliveryCity: optionalTextSchema(120),
    deliveryDistrict: optionalTextSchema(120),
    deliveryMinor: minorUnitAmountSchema.optional(),
    deliveryPostalCode: optionalTextSchema(120),
    note: optionalTextSchema(1000),
    orderDiscountMinor: minorUnitAmountSchema.optional(),
  })
  .strict();

export const updateDraftSalesOrderMetadataInputSchema =
  draftSalesOrderMetadataChangesSchema
    .extend({
      expectedVersion: expectedVersionSchema,
      organizationId: idSchema,
      salesOrderId: idSchema,
    })
    .strict()
    .refine(
      (input) =>
        Object.keys(input).some(
          (key) =>
            !["expectedVersion", "organizationId", "salesOrderId"].includes(
              key,
            ),
        ),
      "At least one metadata field is required.",
    );

export const updateDraftSalesOrderMetadataServiceInputSchema =
  draftSalesOrderMetadataChangesSchema
    .extend({
      expectedVersion: expectedVersionSchema,
      salesOrderId: idSchema,
    })
    .strict()
    .refine(
      (input) =>
        Object.keys(input).some(
          (key) => !["expectedVersion", "salesOrderId"].includes(key),
        ),
      "At least one metadata field is required.",
    );

export const replaceDraftSalesOrderLinesInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    lines: salesOrderLinesInputSchema,
    organizationId: idSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const replaceDraftSalesOrderLinesServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    lines: salesOrderLinesInputSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const amendDraftSalesOrderInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    lines: salesOrderLinesInputSchema.optional(),
    metadata: draftSalesOrderMetadataChangesSchema.optional(),
    organizationId: idSchema,
    salesOrderId: idSchema,
  })
  .strict()
  .refine(
    (input) => input.lines !== undefined || input.metadata !== undefined,
    "At least one amendment change is required.",
  );

export const amendDraftSalesOrderServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    lines: salesOrderLinesInputSchema.optional(),
    metadata: draftSalesOrderMetadataChangesSchema.optional(),
    salesOrderId: idSchema,
  })
  .strict()
  .refine(
    (input) => input.lines !== undefined || input.metadata !== undefined,
    "At least one amendment change is required.",
  );

export const reserveSalesOrderInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    expiresAt: isoTimestampSchema.nullable().optional(),
    organizationId: idSchema,
    preferredBranchId: idSchema.nullable().optional(),
    preferredLocationId: idSchema.nullable().optional(),
    reservationIdempotencyKey: idempotencyKeySchema,
    reservationNumber: codeSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const reserveSalesOrderServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    expiresAt: isoTimestampSchema.nullable().optional(),
    preferredBranchId: idSchema.nullable().optional(),
    preferredLocationId: idSchema.nullable().optional(),
    reservationIdempotencyKey: idempotencyKeySchema,
    reservationNumber: codeSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const confirmSalesOrderInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    organizationId: idSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const cancelSalesOrderInputSchema = confirmSalesOrderInputSchema;

export const confirmSalesOrderServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const cancelSalesOrderServiceInputSchema =
  confirmSalesOrderServiceInputSchema;

export const fulfillSalesOrderInputSchema = z
  .object({
    consumptionIdempotencyKey: idempotencyKeySchema,
    expectedVersion: expectedVersionSchema,
    movementNumber: codeSchema,
    note: optionalTextSchema(1000),
    occurredAt: isoTimestampSchema,
    organizationId: idSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const fulfillSalesOrderServiceInputSchema = z
  .object({
    consumptionIdempotencyKey: idempotencyKeySchema,
    expectedVersion: expectedVersionSchema,
    movementNumber: codeSchema,
    note: optionalTextSchema(1000),
    occurredAt: isoTimestampSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const getSalesOrderQuerySchema = z
  .object({
    organizationId: idSchema,
    salesOrderId: idSchema,
  })
  .strict();

export const getSalesOrderServiceInputSchema = z
  .object({
    salesOrderId: idSchema,
  })
  .strict();

export const listSalesOrdersQuerySchema = salesOrderCursorPageRequestSchema
  .extend({
    channel: salesOrderChannelSchema.optional(),
    createdFrom: isoTimestampSchema.optional(),
    createdTo: isoTimestampSchema.optional(),
    customerPhone: z.string().trim().min(1).max(40).optional(),
    organizationId: idSchema,
    status: salesOrderStatusSchema.optional(),
  })
  .strict();

export const listSalesOrdersServiceInputSchema =
  salesOrderCursorPageRequestSchema
    .extend({
      channel: salesOrderChannelSchema.optional(),
      createdFrom: isoTimestampSchema.optional(),
      createdTo: isoTimestampSchema.optional(),
      customerPhone: z.string().trim().min(1).max(40).optional(),
      status: salesOrderStatusSchema.optional(),
    })
    .strict();

export const updateBranchMetadataInputSchema = z
  .object({
    addressLine1: optionalTextSchema(240),
    addressLine2: optionalTextSchema(240),
    branchId: idSchema,
    city: optionalTextSchema(120),
    countryCode: countryCodeSchema,
    district: optionalTextSchema(120),
    email: emailSchema,
    expectedVersion: expectedVersionSchema,
    name: displayNameSchema.optional(),
    organizationId: idSchema,
    phone: phoneSchema,
    postalCode: optionalTextSchema(120),
    timezone: timezoneSchema,
    type: branchTypeSchema.optional(),
  })
  .strict();

export const changeBranchStatusInputSchema = z
  .object({
    branchId: idSchema,
    expectedVersion: expectedVersionSchema,
    organizationId: idSchema,
    status: branchStatusSchema,
  })
  .strict();

export const updateStockLocationMetadataInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    isSellable: z.boolean().optional(),
    name: displayNameSchema.optional(),
    organizationId: idSchema,
    stockLocationId: idSchema,
    type: stockLocationTypeSchema.optional(),
  })
  .strict();

export const changeStockLocationStatusInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    organizationId: idSchema,
    status: stockLocationStatusSchema,
    stockLocationId: idSchema,
  })
  .strict();

export const updatePosCounterMetadataInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    name: displayNameSchema.optional(),
    organizationId: idSchema,
    posCounterId: idSchema,
  })
  .strict();

export const changePosCounterStatusInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    organizationId: idSchema,
    posCounterId: idSchema,
    status: posCounterStatusSchema,
  })
  .strict();

export const getBranchQuerySchema = z
  .object({
    branchId: idSchema,
    organizationId: idSchema,
  })
  .strict();

export const listBranchesQuerySchema = cursorPageRequestSchema
  .extend({
    organizationId: idSchema,
    search: z.string().trim().min(1).max(120).optional(),
    status: branchStatusSchema.optional(),
    type: branchTypeSchema.optional(),
  })
  .strict();

export const getStockLocationQuerySchema = z
  .object({
    organizationId: idSchema,
    stockLocationId: idSchema,
  })
  .strict();

export const listStockLocationsQuerySchema = cursorPageRequestSchema
  .extend({
    branchId: idSchema.optional(),
    isSellable: z.boolean().optional(),
    organizationId: idSchema,
    search: z.string().trim().min(1).max(120).optional(),
    status: stockLocationStatusSchema.optional(),
    type: stockLocationTypeSchema.optional(),
  })
  .strict();

export const getPosCounterQuerySchema = z
  .object({
    organizationId: idSchema,
    posCounterId: idSchema,
  })
  .strict();

export const listPosCountersQuerySchema = cursorPageRequestSchema
  .extend({
    branchId: idSchema.optional(),
    organizationId: idSchema,
    search: z.string().trim().min(1).max(120).optional(),
    status: posCounterStatusSchema.optional(),
  })
  .strict();

export const getInventoryMovementQuerySchema = z
  .object({
    movementId: idSchema,
    organizationId: idSchema,
  })
  .strict();

export const listInventoryMovementsQuerySchema = movementCursorPageRequestSchema
  .extend({
    destinationLocationId: idSchema.optional(),
    isReversal: z.boolean().optional(),
    isReversed: z.boolean().optional(),
    occurredFrom: isoTimestampSchema.optional(),
    occurredTo: isoTimestampSchema.optional(),
    organizationId: idSchema,
    sourceLocationId: idSchema.optional(),
    status: inventoryMovementStatusSchema.optional(),
    type: inventoryMovementTypeSchema.optional(),
  })
  .strict();

export const getOnHandBalanceQuerySchema = z
  .object({
    organizationId: idSchema,
    productVariantId: idSchema,
    stockLocationId: idSchema,
  })
  .strict();

export const listLocationBalancesQuerySchema = balanceCursorPageRequestSchema
  .extend({
    locationId: idSchema,
    onlyPositive: z.boolean().optional(),
    organizationId: idSchema,
    productVariantId: idSchema.optional(),
  })
  .strict();

export const getInventoryReservationQuerySchema = z
  .object({
    organizationId: idSchema,
    reservationId: idSchema,
  })
  .strict();

export const listInventoryReservationsQuerySchema =
  reservationCursorPageRequestSchema
    .extend({
      expiresBefore: isoTimestampSchema.optional(),
      organizationId: idSchema,
      productVariantId: idSchema.optional(),
      referenceId: optionalTextSchema(120),
      referenceType: optionalTextSchema(80),
      status: inventoryReservationStatusSchema.optional(),
      stockLocationId: idSchema.optional(),
    })
    .strict();

export const getReservedQuantityQuerySchema = z
  .object({
    organizationId: idSchema,
    productVariantId: idSchema,
    stockLocationId: idSchema,
  })
  .strict();

export const getAvailableToSellQuerySchema = getReservedQuantityQuerySchema;

export const listLocationAvailabilityQuerySchema =
  availabilityCursorPageRequestSchema
    .extend({
      onlyAvailable: z.boolean().optional(),
      organizationId: idSchema,
      productVariantId: idSchema.optional(),
      stockLocationId: idSchema,
    })
    .strict();

export const getInventoryAllocationPolicyQuerySchema = z
  .object({
    organizationId: idSchema,
    policyId: idSchema,
  })
  .strict();

export const listInventoryAllocationPoliciesQuerySchema =
  cursorPageRequestSchema
    .extend({
      organizationId: idSchema,
      search: z.string().trim().min(1).max(160).optional(),
      status: inventoryAllocationPolicyStatusSchema.optional(),
    })
    .strict();

export type CreateOrganizationInputContract = z.infer<
  typeof createOrganizationInputSchema
>;
export type CreateCategoryInputContract = z.infer<
  typeof createCategoryInputSchema
>;
export type CreateCollectionInputContract = z.infer<
  typeof createCollectionInputSchema
>;
export type CreateColorInputContract = z.infer<typeof createColorInputSchema>;
export type CreateSizeInputContract = z.infer<typeof createSizeInputSchema>;
export type CreateProductInputContract = z.infer<
  typeof createProductInputSchema
>;
export type CreateProductVariantInputContract = z.infer<
  typeof createProductVariantInputSchema
>;
export type CreateBranchInputContract = z.infer<typeof createBranchInputSchema>;
export type CreateStockLocationInputContract = z.infer<
  typeof createStockLocationInputSchema
>;
export type CreatePosCounterInputContract = z.infer<
  typeof createPosCounterInputSchema
>;
export type CreateInventoryMovementInputContract = z.infer<
  typeof createInventoryMovementInputSchema
>;
export type ReplaceDraftMovementLinesInputContract = z.infer<
  typeof replaceDraftMovementLinesInputSchema
>;
export type PostInventoryMovementInputContract = z.infer<
  typeof postInventoryMovementInputSchema
>;
export type ReverseInventoryMovementInputContract = z.infer<
  typeof reverseInventoryMovementInputSchema
>;
export type CreateInventoryReservationInputContract = z.infer<
  typeof createInventoryReservationInputSchema
>;
export type ConfirmInventoryReservationInputContract = z.infer<
  typeof confirmInventoryReservationInputSchema
>;
export type ReleaseInventoryReservationInputContract = z.infer<
  typeof releaseInventoryReservationInputSchema
>;
export type ExpireInventoryReservationInputContract = z.infer<
  typeof expireInventoryReservationInputSchema
>;
export type ConsumeInventoryReservationInputContract = z.infer<
  typeof consumeInventoryReservationInputSchema
>;
export type UpdateBranchMetadataInputContract = z.infer<
  typeof updateBranchMetadataInputSchema
>;
export type ChangeBranchStatusInputContract = z.infer<
  typeof changeBranchStatusInputSchema
>;
export type UpdateStockLocationMetadataInputContract = z.infer<
  typeof updateStockLocationMetadataInputSchema
>;
export type ChangeStockLocationStatusInputContract = z.infer<
  typeof changeStockLocationStatusInputSchema
>;
export type UpdatePosCounterMetadataInputContract = z.infer<
  typeof updatePosCounterMetadataInputSchema
>;
export type ChangePosCounterStatusInputContract = z.infer<
  typeof changePosCounterStatusInputSchema
>;
export type GetBranchQueryContract = z.infer<typeof getBranchQuerySchema>;
export type ListBranchesQueryContract = z.infer<typeof listBranchesQuerySchema>;
export type GetStockLocationQueryContract = z.infer<
  typeof getStockLocationQuerySchema
>;
export type ListStockLocationsQueryContract = z.infer<
  typeof listStockLocationsQuerySchema
>;
export type GetPosCounterQueryContract = z.infer<
  typeof getPosCounterQuerySchema
>;
export type ListPosCountersQueryContract = z.infer<
  typeof listPosCountersQuerySchema
>;
export type GetInventoryMovementQueryContract = z.infer<
  typeof getInventoryMovementQuerySchema
>;
export type ListInventoryMovementsQueryContract = z.infer<
  typeof listInventoryMovementsQuerySchema
>;
export type GetOnHandBalanceQueryContract = z.infer<
  typeof getOnHandBalanceQuerySchema
>;
export type ListLocationBalancesQueryContract = z.infer<
  typeof listLocationBalancesQuerySchema
>;
export type GetInventoryReservationQueryContract = z.infer<
  typeof getInventoryReservationQuerySchema
>;
export type ListInventoryReservationsQueryContract = z.infer<
  typeof listInventoryReservationsQuerySchema
>;
export type GetReservedQuantityQueryContract = z.infer<
  typeof getReservedQuantityQuerySchema
>;
export type GetAvailableToSellQueryContract = z.infer<
  typeof getAvailableToSellQuerySchema
>;
export type ListLocationAvailabilityQueryContract = z.infer<
  typeof listLocationAvailabilityQuerySchema
>;
export type CreateInventoryAllocationPolicyInputContract = z.infer<
  typeof createInventoryAllocationPolicyInputSchema
>;
export type UpdateInventoryAllocationPolicyMetadataInputContract = z.infer<
  typeof updateInventoryAllocationPolicyMetadataInputSchema
>;
export type ReplaceInventoryAllocationPolicyLocationsInputContract = z.infer<
  typeof replaceInventoryAllocationPolicyLocationsInputSchema
>;
export type ChangeInventoryAllocationPolicyStatusInputContract = z.infer<
  typeof changeInventoryAllocationPolicyStatusInputSchema
>;
export type PreviewInventoryAllocationInputContract = z.infer<
  typeof previewInventoryAllocationInputSchema
>;
export type AllocateAndCreateInventoryReservationInputContract = z.infer<
  typeof allocateAndCreateInventoryReservationInputSchema
>;
export type CreateUserInputContract = z.infer<typeof createUserInputSchema>;
export type CreateOrganizationMembershipInputContract = z.infer<
  typeof createOrganizationMembershipInputSchema
>;
export type UpdateOrganizationMembershipStatusInputContract = z.infer<
  typeof updateOrganizationMembershipStatusInputSchema
>;
export type AssignOrganizationMembershipRoleInputContract = z.infer<
  typeof assignOrganizationMembershipRoleInputSchema
>;
export type CreateSalesOrderServiceInputContract = z.infer<
  typeof createSalesOrderServiceInputSchema
>;
export type UpdateDraftSalesOrderMetadataInputContract = z.infer<
  typeof updateDraftSalesOrderMetadataInputSchema
>;
export type UpdateDraftSalesOrderMetadataServiceInputContract = z.infer<
  typeof updateDraftSalesOrderMetadataServiceInputSchema
>;
export type ReplaceDraftSalesOrderLinesInputContract = z.infer<
  typeof replaceDraftSalesOrderLinesInputSchema
>;
export type ReplaceDraftSalesOrderLinesServiceInputContract = z.infer<
  typeof replaceDraftSalesOrderLinesServiceInputSchema
>;
export type AmendDraftSalesOrderInputContract = z.infer<
  typeof amendDraftSalesOrderInputSchema
>;
export type AmendDraftSalesOrderServiceInputContract = z.infer<
  typeof amendDraftSalesOrderServiceInputSchema
>;
export type ReserveSalesOrderServiceInputContract = z.infer<
  typeof reserveSalesOrderServiceInputSchema
>;
export type ConfirmSalesOrderServiceInputContract = z.infer<
  typeof confirmSalesOrderServiceInputSchema
>;
export type CancelSalesOrderServiceInputContract = z.infer<
  typeof cancelSalesOrderServiceInputSchema
>;
export type FulfillSalesOrderServiceInputContract = z.infer<
  typeof fulfillSalesOrderServiceInputSchema
>;
export type GetSalesOrderServiceInputContract = z.infer<
  typeof getSalesOrderServiceInputSchema
>;
export type ListSalesOrdersServiceInputContract = z.infer<
  typeof listSalesOrdersServiceInputSchema
>;
export type GetInventoryAllocationPolicyQueryContract = z.infer<
  typeof getInventoryAllocationPolicyQuerySchema
>;
export type ListInventoryAllocationPoliciesQueryContract = z.infer<
  typeof listInventoryAllocationPoliciesQuerySchema
>;

export type CatalogRecordContract = {
  createdAt: string;
  id: string;
  updatedAt: string;
  version?: number;
};

export type OrganizationContract = CatalogRecordContract & {
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

export type CategoryContract = CatalogRecordContract & {
  description: string | null;
  name: string;
  organizationId: string;
  parentId: string | null;
  slug: string;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
};

export type CollectionContract = CatalogRecordContract & {
  description: string | null;
  name: string;
  organizationId: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE";
};

export type ColorContract = CatalogRecordContract & {
  code: string;
  hexValue: string | null;
  name: string;
  organizationId: string;
  status: "ACTIVE" | "INACTIVE";
};

export type SizeContract = CatalogRecordContract & {
  code: string;
  name: string;
  organizationId: string;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
};

export type ProductContract = CatalogRecordContract & {
  categoryId: string;
  description: string | null;
  name: string;
  organizationId: string;
  productCode: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type ProductVariantContract = CatalogRecordContract & {
  colorId: string;
  organizationId: string;
  productId: string;
  sizeId: string;
  sku: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type BranchContract = CatalogRecordContract & {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  code: string;
  countryCode: string;
  district: string | null;
  email: string | null;
  name: string;
  organizationId: string;
  phone: string | null;
  postalCode: string | null;
  status: z.infer<typeof branchStatusSchema>;
  timezone: string;
  type: z.infer<typeof branchTypeSchema>;
  version: number;
};

export type StockLocationContract = CatalogRecordContract & {
  branchId: string;
  code: string;
  isSellable: boolean;
  name: string;
  organizationId: string;
  status: z.infer<typeof stockLocationStatusSchema>;
  type: z.infer<typeof stockLocationTypeSchema>;
  version: number;
};

export type PosCounterContract = CatalogRecordContract & {
  branchId: string;
  code: string;
  name: string;
  organizationId: string;
  status: z.infer<typeof posCounterStatusSchema>;
  version: number;
};

export type InventoryMovementLineContract = {
  createdAt: string;
  id: string;
  lineNumber: number;
  movementId: string;
  note: string | null;
  organizationId: string;
  productVariantId: string;
  quantity: number;
};

export type InventoryMovementContract = CatalogRecordContract & {
  consumesReservationId: string | null;
  destinationLocationId: string | null;
  idempotencyKey: string;
  isReservationConsumption: boolean;
  isReversal: boolean;
  isReversed: boolean;
  lines: InventoryMovementLineContract[];
  movementNumber: string;
  note: string | null;
  occurredAt: string;
  organizationId: string;
  postedAt: string | null;
  referenceId: string | null;
  referenceType: string | null;
  reversedByMovementId: string | null;
  reversalReason: string | null;
  reversesMovementId: string | null;
  sourceLocationId: string | null;
  status: z.infer<typeof inventoryMovementStatusSchema>;
  type: z.infer<typeof inventoryMovementTypeSchema>;
  version: number;
};

export type OnHandBalanceContract = {
  organizationId: string;
  productVariantId: string;
  quantity: number;
  stockLocationId: string;
};

export type InventoryReservationLineContract = {
  createdAt: string;
  id: string;
  lineNumber: number;
  organizationId: string;
  productVariantId: string;
  quantity: number;
  reservationId: string;
};

export type InventoryReservationContract = CatalogRecordContract & {
  confirmedAt: string | null;
  consumedByMovementId: string | null;
  expiredAt: string | null;
  expiresAt: string | null;
  idempotencyKey: string;
  lines: InventoryReservationLineContract[];
  note: string | null;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  releasedAt: string | null;
  reservationNumber: string;
  status: z.infer<typeof inventoryReservationStatusSchema>;
  stockLocationId: string;
  version: number;
  isConsumed: boolean;
};

export type ConsumeInventoryReservationResultContract = {
  movement: InventoryMovementContract;
  reservation: InventoryReservationContract;
};

export type InventoryAvailabilityContract = {
  availableQuantity: number;
  onHandQuantity: number;
  organizationId: string;
  productVariantId: string;
  reservedQuantity: number;
  stockLocationId: string;
};

export type InventoryAllocationPolicyLocationContract = {
  createdAt: string;
  id: string;
  isEnabled: boolean;
  organizationId: string;
  policyId: string;
  priority: number;
  stockLocationId: string;
  updatedAt: string;
};

export type InventoryAllocationPolicyContract = CatalogRecordContract & {
  code: string;
  locations: InventoryAllocationPolicyLocationContract[];
  name: string;
  organizationId: string;
  requireSellableLocation: boolean;
  status: z.infer<typeof inventoryAllocationPolicyStatusSchema>;
  strategy: z.infer<typeof inventoryAllocationStrategySchema>;
  version: number;
};

export type InventoryAllocationLineAvailabilityContract = {
  availableQuantity: number;
  onHandQuantity: number;
  productVariantId: string;
  quantity: number;
  reservedQuantity: number;
};

export type InventoryAllocationPreviewContract = {
  canFulfill: boolean;
  evaluatedAt: string;
  failureReason: string | null;
  lines: Array<z.infer<typeof inventoryAllocationLineInputSchema>>;
  policyId: string;
  selectedBranchId: string | null;
  selectedLines: InventoryAllocationLineAvailabilityContract[];
  selectedStockLocationId: string | null;
};

export type AllocateInventoryReservationResultContract = {
  reservation: InventoryReservationContract;
  selectedBranchId: string;
  selectedStockLocationId: string;
};

export type SalesOrderServiceContract = z.infer<
  typeof salesOrderServiceContractSchema
>;

export type SalesOrderServicePageContract = z.infer<
  typeof salesOrderServicePageContractSchema
>;

export const branchContractSchema = z.object({
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  code: z.string(),
  countryCode: z.string(),
  createdAt: isoTimestampSchema,
  district: z.string().nullable(),
  email: z.string().nullable(),
  id: idSchema,
  name: z.string(),
  organizationId: idSchema,
  phone: z.string().nullable(),
  postalCode: z.string().nullable(),
  status: branchStatusSchema,
  timezone: z.string(),
  type: branchTypeSchema,
  updatedAt: isoTimestampSchema,
  version: expectedVersionSchema,
});

export const stockLocationContractSchema = z.object({
  branchId: idSchema,
  code: z.string(),
  createdAt: isoTimestampSchema,
  id: idSchema,
  isSellable: z.boolean(),
  name: z.string(),
  organizationId: idSchema,
  status: stockLocationStatusSchema,
  type: stockLocationTypeSchema,
  updatedAt: isoTimestampSchema,
  version: expectedVersionSchema,
});

export const posCounterContractSchema = z.object({
  branchId: idSchema,
  code: z.string(),
  createdAt: isoTimestampSchema,
  id: idSchema,
  name: z.string(),
  organizationId: idSchema,
  status: posCounterStatusSchema,
  updatedAt: isoTimestampSchema,
  version: expectedVersionSchema,
});

export const inventoryMovementLineContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    id: idSchema,
    lineNumber: expectedVersionSchema,
    movementId: idSchema,
    note: z.string().nullable(),
    organizationId: idSchema,
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
  })
  .strict();

export const inventoryMovementContractSchema = z
  .object({
    consumesReservationId: idSchema.nullable(),
    createdAt: isoTimestampSchema,
    destinationLocationId: idSchema.nullable(),
    id: idSchema,
    idempotencyKey: idempotencyKeySchema,
    isReservationConsumption: z.boolean(),
    isReversal: z.boolean(),
    isReversed: z.boolean(),
    lines: z.array(inventoryMovementLineContractSchema),
    movementNumber: z.string(),
    note: z.string().nullable(),
    occurredAt: isoTimestampSchema,
    organizationId: idSchema,
    postedAt: isoTimestampSchema.nullable(),
    referenceId: z.string().nullable(),
    referenceType: z.string().nullable(),
    reversedByMovementId: idSchema.nullable(),
    reversalReason: z.string().nullable(),
    reversesMovementId: idSchema.nullable(),
    sourceLocationId: idSchema.nullable(),
    status: inventoryMovementStatusSchema,
    type: inventoryMovementTypeSchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const onHandBalanceContractSchema = z
  .object({
    organizationId: idSchema,
    productVariantId: idSchema,
    quantity: z.number().int(),
    stockLocationId: idSchema,
  })
  .strict();

export const inventoryReservationLineContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    id: idSchema,
    lineNumber: expectedVersionSchema,
    organizationId: idSchema,
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
    reservationId: idSchema,
  })
  .strict();

export const inventoryReservationContractSchema = z
  .object({
    confirmedAt: isoTimestampSchema.nullable(),
    consumedByMovementId: idSchema.nullable(),
    createdAt: isoTimestampSchema,
    expiredAt: isoTimestampSchema.nullable(),
    expiresAt: isoTimestampSchema.nullable(),
    id: idSchema,
    idempotencyKey: idempotencyKeySchema,
    isConsumed: z.boolean(),
    lines: z.array(inventoryReservationLineContractSchema),
    note: z.string().nullable(),
    organizationId: idSchema,
    referenceId: z.string().nullable(),
    referenceType: z.string().nullable(),
    releasedAt: isoTimestampSchema.nullable(),
    reservationNumber: z.string(),
    status: inventoryReservationStatusSchema,
    stockLocationId: idSchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const consumeInventoryReservationResultContractSchema = z
  .object({
    movement: inventoryMovementContractSchema,
    reservation: inventoryReservationContractSchema,
  })
  .strict();

export const inventoryAvailabilityContractSchema = z
  .object({
    availableQuantity: z.number().int(),
    onHandQuantity: z.number().int(),
    organizationId: idSchema,
    productVariantId: idSchema,
    reservedQuantity: z.number().int().nonnegative(),
    stockLocationId: idSchema,
  })
  .strict();

export const inventoryAllocationPolicyLocationContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    id: idSchema,
    isEnabled: z.boolean(),
    organizationId: idSchema,
    policyId: idSchema,
    priority: expectedVersionSchema,
    stockLocationId: idSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const inventoryAllocationPolicyContractSchema = z
  .object({
    code: z.string(),
    createdAt: isoTimestampSchema,
    id: idSchema,
    locations: z.array(inventoryAllocationPolicyLocationContractSchema),
    name: z.string(),
    organizationId: idSchema,
    requireSellableLocation: z.boolean(),
    status: inventoryAllocationPolicyStatusSchema,
    strategy: inventoryAllocationStrategySchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const inventoryAllocationLineAvailabilityContractSchema = z
  .object({
    availableQuantity: z.number().int(),
    onHandQuantity: z.number().int(),
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
    reservedQuantity: z.number().int().nonnegative(),
  })
  .strict();

export const inventoryAllocationPreviewContractSchema = z
  .object({
    canFulfill: z.boolean(),
    evaluatedAt: isoTimestampSchema,
    failureReason: z.string().nullable(),
    lines: z.array(inventoryAllocationLineInputSchema).min(1).max(500),
    policyId: idSchema,
    selectedBranchId: idSchema.nullable(),
    selectedLines: z.array(inventoryAllocationLineAvailabilityContractSchema),
    selectedStockLocationId: idSchema.nullable(),
  })
  .strict();

export const allocateInventoryReservationResultContractSchema = z
  .object({
    reservation: inventoryReservationContractSchema,
    selectedBranchId: idSchema,
    selectedStockLocationId: idSchema,
  })
  .strict();

export const salesOrderLineContractSchema = z
  .object({
    colorSnapshot: z.string().nullable(),
    createdAt: isoTimestampSchema,
    discountMinor: minorUnitAmountSchema,
    id: idSchema,
    lineNumber: expectedVersionSchema,
    lineTotalMinor: minorUnitAmountSchema,
    organizationId: idSchema,
    productNameSnapshot: z.string(),
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
    salesOrderId: idSchema,
    sizeSnapshot: z.string().nullable(),
    skuSnapshot: z.string(),
    unitPriceMinor: minorUnitAmountSchema,
  })
  .strict();

export const salesOrderContractSchema = z
  .object({
    allocationPolicyId: idSchema.nullable(),
    cancelledAt: isoTimestampSchema.nullable(),
    channel: salesOrderChannelSchema,
    confirmedAt: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
    currencyCode: salesOrderCurrencyCodeSchema,
    customerEmail: z.string().nullable(),
    customerName: z.string().nullable(),
    customerPhone: z.string().nullable(),
    deliveryAddressLine1: z.string().nullable(),
    deliveryAddressLine2: z.string().nullable(),
    deliveryCity: z.string().nullable(),
    deliveryDistrict: z.string().nullable(),
    deliveryMinor: minorUnitAmountSchema,
    deliveryPostalCode: z.string().nullable(),
    discountMinor: minorUnitAmountSchema,
    fulfilledAt: isoTimestampSchema.nullable(),
    fulfillmentMovementId: idSchema.nullable(),
    id: idSchema,
    idempotencyKey: idempotencyKeySchema,
    inventoryReservationId: idSchema.nullable(),
    lines: z.array(salesOrderLineContractSchema),
    note: z.string().nullable(),
    orderNumber: z.string(),
    organizationId: idSchema,
    payloadSignature: z.string(),
    reservedAt: isoTimestampSchema.nullable(),
    status: salesOrderStatusSchema,
    subtotalMinor: minorUnitAmountSchema,
    totalMinor: minorUnitAmountSchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const salesOrderServiceContractSchema = salesOrderContractSchema.omit({
  idempotencyKey: true,
  payloadSignature: true,
});

export const cursorPageResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: cursorSchema.nullable(),
    })
    .strict();

export const movementCursorPageResultSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: movementCursorSchema.nullable(),
    })
    .strict();

export const balanceCursorPageResultSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: balanceCursorSchema.nullable(),
    })
    .strict();

export const reservationCursorPageResultSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: reservationCursorSchema.nullable(),
    })
    .strict();

export const availabilityCursorPageResultSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: availabilityCursorSchema.nullable(),
    })
    .strict();

export const salesOrderCursorPageResultSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: salesOrderCursorSchema.nullable(),
    })
    .strict();

export const branchPageContractSchema =
  cursorPageResultSchema(branchContractSchema);
export const stockLocationPageContractSchema = cursorPageResultSchema(
  stockLocationContractSchema,
);
export const posCounterPageContractSchema = cursorPageResultSchema(
  posCounterContractSchema,
);
export const inventoryMovementPageContractSchema =
  movementCursorPageResultSchema(inventoryMovementContractSchema);
export const locationBalancePageContractSchema = balanceCursorPageResultSchema(
  onHandBalanceContractSchema,
);
export const inventoryReservationPageContractSchema =
  reservationCursorPageResultSchema(inventoryReservationContractSchema);
export const locationAvailabilityPageContractSchema =
  availabilityCursorPageResultSchema(inventoryAvailabilityContractSchema);
export const inventoryAllocationPolicyPageContractSchema =
  cursorPageResultSchema(inventoryAllocationPolicyContractSchema);
export const salesOrderPageContractSchema = salesOrderCursorPageResultSchema(
  salesOrderContractSchema,
);

export const salesOrderServicePageContractSchema =
  salesOrderCursorPageResultSchema(salesOrderServiceContractSchema);
