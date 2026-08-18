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
const requiredHexValueSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Hex values must use #RRGGBB format.");
const hexValueSchema = requiredHexValueSchema.nullable().optional();
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
export const salesChannelSchema = z.enum([
  "ONLINE",
  "OFFLINE_STORE",
  "EVENT_BOOTH",
]);
export const salesOrderChannelSchema = z.enum([
  "ONLINE",
  "OFFLINE_STORE",
  "EVENT_BOOTH",
  "POS",
  "MANUAL",
]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE", "LOCKED"]);
export const organizationMembershipStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
]);
export const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF"]);
export const permissionResourceSchema = z.enum([
  "ORGANIZATION",
  "TEAM",
  "USER",
  "CATALOG",
  "INVENTORY",
  "RESERVATION",
  "SALES_ORDER",
  "SALES",
  "REPORT",
]);
export const permissionActionSchema = z.enum([
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "CANCEL",
  "FULFILL",
]);
export const permissionStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const identityProviderSchema = z.enum([
  "PASSWORD",
  "GOOGLE",
  "MICROSOFT",
]);
export const credentialStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

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

export const createPermissionInputSchema = z
  .object({
    action: permissionActionSchema,
    description: optionalTextSchema(240),
    resource: permissionResourceSchema,
    status: permissionStatusSchema.optional(),
  })
  .strict();

export const assignRolePermissionInputSchema = z
  .object({
    permissionId: idSchema,
    role: roleSchema,
    status: permissionStatusSchema.optional(),
  })
  .strict();

export const createCredentialInputSchema = z
  .object({
    identifier: z.string().trim().min(3).max(320),
    passwordHash: z.string().trim().min(20).max(1000).nullable().optional(),
    provider: identityProviderSchema,
    status: credentialStatusSchema.optional(),
    userId: idSchema,
  })
  .strict();

export const disableCredentialInputSchema = z
  .object({
    credentialId: idSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();

export const auditActionSchema = z.enum([
  "INVENTORY_MOVEMENT_POSTED",
  "POS_SALE_RETURN_RECORDED",
  "SALES_ORDER_CREATED",
]);

export const auditResourceSchema = z.enum([
  "INVENTORY_MOVEMENT",
  "POS_RETURN",
  "SALES_ORDER",
]);

const auditMetadataSchema = z
  .record(z.string(), z.json())
  .superRefine((metadata, context) => {
    if (containsSensitiveAuditKey(metadata)) {
      context.addIssue({
        code: "custom",
        message: "Audit metadata cannot contain sensitive fields.",
      });
    }
  });

export const recordAuditEntryInputSchema = z
  .object({
    action: auditActionSchema,
    metadata: auditMetadataSchema.optional(),
    organizationId: idSchema,
    resource: auditResourceSchema,
    resourceId: idSchema,
    userId: idSchema.nullable(),
  })
  .strict();

function containsSensitiveAuditKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSensitiveAuditKey);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.entries(value).some(
    ([key, nestedValue]) =>
      /(?:authorization|cookie|credential|password|secret|token)/iu.test(key) ||
      containsSensitiveAuditKey(nestedValue),
  );
}

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

export const listCatalogItemsServiceInputSchema = z.object({}).strict();

export const createCategoryServiceInputSchema = createCategoryInputSchema
  .omit({ organizationId: true })
  .strict();

export const updateCategoryStatusServiceInputSchema = z
  .object({
    categoryId: idSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const createCollectionServiceInputSchema = createCollectionInputSchema
  .omit({ organizationId: true })
  .strict();

export const createColorServiceInputSchema = createColorInputSchema
  .omit({ hexValue: true, organizationId: true })
  .extend({ hexValue: requiredHexValueSchema })
  .strict();

export const updateColorStatusServiceInputSchema = z
  .object({
    colorId: idSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const createSizeServiceInputSchema = createSizeInputSchema
  .omit({ organizationId: true })
  .strict();

export const updateSizeStatusServiceInputSchema = z
  .object({
    sizeId: idSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const createProductServiceInputSchema = createProductInputSchema
  .omit({ organizationId: true })
  .extend({ collectionId: idSchema.optional() })
  .strict();

export const getProductServiceInputSchema = z
  .object({ productId: idSchema })
  .strict();

export const primaryProductImageSchema = z
  .object({
    altText: z.string().min(1).max(240),
    assetId: idSchema,
    byteSize: z.number().int().positive().max(5_242_880),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    url: z.string().min(1).max(10_000_000),
  })
  .strict();

export const productMediaSchema = primaryProductImageSchema
  .extend({
    linkId: idSchema,
    productVariantId: idSchema.nullable(),
    role: z.enum(["PRIMARY", "GALLERY"]),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

export const setPrimaryProductImageServiceInputSchema = z
  .object({
    altText: z.string().trim().min(1).max(240),
    contentBase64: z
      .string()
      .min(4)
      .max(6_990_508)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    idempotencyKey: idempotencyKeySchema,
    productId: idSchema,
  })
  .strict();

export const removePrimaryProductImageServiceInputSchema = z
  .object({ productId: idSchema })
  .strict();

export const addProductMediaServiceInputSchema =
  setPrimaryProductImageServiceInputSchema
    .extend({ productVariantId: idSchema.nullable().optional() })
    .strict();

export const productMediaLinkServiceInputSchema = z
  .object({ linkId: idSchema, productId: idSchema })
  .strict();

export const reorderProductMediaServiceInputSchema = z
  .object({
    linkIds: z.array(idSchema).min(1).max(100),
    productId: idSchema,
  })
  .strict()
  .refine((input) => new Set(input.linkIds).size === input.linkIds.length, {
    message: "linkIds must not contain duplicates.",
    path: ["linkIds"],
  });

export const updateProductMediaServiceInputSchema = z
  .object({
    altText: z.string().trim().min(1).max(240),
    linkId: idSchema,
    productId: idSchema,
    productVariantId: idSchema.nullable(),
  })
  .strict();

export const reorderCollectionProductsServiceInputSchema = z
  .object({
    collectionId: idSchema,
    productIds: z.array(idSchema).min(1).max(500),
  })
  .strict()
  .refine(
    (input) => new Set(input.productIds).size === input.productIds.length,
    {
      message: "productIds must not contain duplicates.",
      path: ["productIds"],
    },
  );

export const listCollectionProductsServiceInputSchema = z
  .object({ collectionId: idSchema })
  .strict();

export const createProductVariantServiceInputSchema =
  createProductVariantInputSchema.omit({ organizationId: true }).strict();

export const listProductVariantsServiceInputSchema = z
  .object({ productId: idSchema })
  .strict();

export const barcodeTypeSchema = z.enum([
  "EAN13",
  "CODE128",
  "UPC",
  "INTERNAL",
]);
export const barcodeStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export type BarcodeType = z.infer<typeof barcodeTypeSchema>;
export type BarcodeStatus = z.infer<typeof barcodeStatusSchema>;
export const createVariantBarcodeServiceInputSchema = z
  .object({
    type: barcodeTypeSchema,
    value: z.string().trim().min(1).max(80),
    variantId: idSchema,
  })
  .strict();
export const listVariantBarcodesServiceInputSchema = z
  .object({ variantId: idSchema })
  .strict();
export const updateBarcodeStatusServiceInputSchema = z
  .object({ barcodeId: idSchema, status: barcodeStatusSchema })
  .strict();
export const lookupBarcodeServiceInputSchema = z
  .object({ value: z.string().trim().min(1).max(80) })
  .strict();

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

export const postInventoryMovementServiceInputSchema =
  postInventoryMovementInputSchema.omit({ organizationId: true }).strict();

const inventoryReadPageInputShape = {
  cursor: z.string().trim().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
};

export const listInventoryAvailabilityServiceInputSchema = z
  .object({
    ...inventoryReadPageInputShape,
    locationId: idSchema.optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const listStockLocationsServiceInputSchema = z
  .object(inventoryReadPageInputShape)
  .strict();

export const listInventoryMovementsServiceInputSchema = z
  .object({
    ...inventoryReadPageInputShape,
    locationId: idSchema.optional(),
    status: inventoryMovementStatusSchema.optional(),
    type: inventoryMovementTypeSchema.optional(),
  })
  .strict();

export const getVariantAvailabilityServiceInputSchema = z
  .object({ variantId: idSchema })
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
    boothId: idSchema.nullable().optional(),
    channel: salesChannelSchema,
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
  .strict()
  .superRefine(validateBoothSalesSource);

export const createSalesOrderServiceInputSchema = z
  .object({
    allocationPolicyId: idSchema.nullable().optional(),
    boothId: idSchema.nullable().optional(),
    channel: salesChannelSchema,
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
  .strict()
  .superRefine(validateBoothSalesSource);

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

export const salesOrderManagementListInputSchema = z
  .object({
    channel: salesOrderChannelSchema.optional(),
    cursor: cursorSchema.optional(),
    order: z.enum(["NEWEST", "OLDEST"]).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().min(1).max(64).optional(),
    status: salesOrderStatusSchema.optional(),
  })
  .strict();

export const salesOrderManagementDetailsInputSchema = z
  .object({ salesOrderId: idSchema })
  .strict();

export const salesOrderManagementActionInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    salesOrderId: idSchema,
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
export type ListCatalogItemsServiceInputContract = z.infer<
  typeof listCatalogItemsServiceInputSchema
>;
export type CreateCategoryServiceInputContract = z.infer<
  typeof createCategoryServiceInputSchema
>;
export type UpdateCategoryStatusServiceInputContract = z.infer<
  typeof updateCategoryStatusServiceInputSchema
>;
export type CreateCollectionServiceInputContract = z.infer<
  typeof createCollectionServiceInputSchema
>;
export type CreateColorServiceInputContract = z.infer<
  typeof createColorServiceInputSchema
>;
export type UpdateColorStatusServiceInputContract = z.infer<
  typeof updateColorStatusServiceInputSchema
>;
export type CreateSizeServiceInputContract = z.infer<
  typeof createSizeServiceInputSchema
>;
export type UpdateSizeStatusServiceInputContract = z.infer<
  typeof updateSizeStatusServiceInputSchema
>;
export type CreateProductServiceInputContract = z.infer<
  typeof createProductServiceInputSchema
>;
export type GetProductServiceInputContract = z.infer<
  typeof getProductServiceInputSchema
>;
export type SetPrimaryProductImageInputContract = z.infer<
  typeof setPrimaryProductImageServiceInputSchema
>;
export type AddProductMediaInputContract = z.infer<
  typeof addProductMediaServiceInputSchema
>;
export type ProductMediaLinkInputContract = z.infer<
  typeof productMediaLinkServiceInputSchema
>;
export type ReorderProductMediaInputContract = z.infer<
  typeof reorderProductMediaServiceInputSchema
>;
export type UpdateProductMediaInputContract = z.infer<
  typeof updateProductMediaServiceInputSchema
>;
export type ReorderCollectionProductsInputContract = z.infer<
  typeof reorderCollectionProductsServiceInputSchema
>;
export type ListCollectionProductsInputContract = z.infer<
  typeof listCollectionProductsServiceInputSchema
>;
export type RemovePrimaryProductImageInputContract = z.infer<
  typeof removePrimaryProductImageServiceInputSchema
>;
export type CreateProductVariantServiceInputContract = z.infer<
  typeof createProductVariantServiceInputSchema
>;
export type ListProductVariantsServiceInputContract = z.infer<
  typeof listProductVariantsServiceInputSchema
>;
export type CreateVariantBarcodeServiceInputContract = z.infer<
  typeof createVariantBarcodeServiceInputSchema
>;
export type ListVariantBarcodesServiceInputContract = z.infer<
  typeof listVariantBarcodesServiceInputSchema
>;
export type UpdateBarcodeStatusServiceInputContract = z.infer<
  typeof updateBarcodeStatusServiceInputSchema
>;
export type LookupBarcodeServiceInputContract = z.infer<
  typeof lookupBarcodeServiceInputSchema
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
export type PostInventoryMovementServiceInputContract = z.infer<
  typeof postInventoryMovementServiceInputSchema
>;
export type ListInventoryAvailabilityServiceInputContract = z.infer<
  typeof listInventoryAvailabilityServiceInputSchema
>;
export type ListStockLocationsServiceInputContract = z.infer<
  typeof listStockLocationsServiceInputSchema
>;
export type ListInventoryMovementsServiceInputContract = z.infer<
  typeof listInventoryMovementsServiceInputSchema
>;
export type GetVariantAvailabilityServiceInputContract = z.infer<
  typeof getVariantAvailabilityServiceInputSchema
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
export type CreatePermissionInputContract = z.infer<
  typeof createPermissionInputSchema
>;
export type AssignRolePermissionInputContract = z.infer<
  typeof assignRolePermissionInputSchema
>;
export type CreateCredentialInputContract = z.infer<
  typeof createCredentialInputSchema
>;
export type DisableCredentialInputContract = z.infer<
  typeof disableCredentialInputSchema
>;
export type RecordAuditEntryInputContract = z.infer<
  typeof recordAuditEntryInputSchema
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

export type ProductDetailsContract = {
  collectionIds: string[];
  media?: ProductMediaContract[];
  primaryImage: PrimaryProductImageContract | null;
  product: ProductContract;
  variants: ProductVariantContract[];
};

export type PrimaryProductImageContract = z.infer<
  typeof primaryProductImageSchema
>;
export type ProductMediaContract = z.infer<typeof productMediaSchema>;
export type AddProductMediaServiceInputContract = z.infer<
  typeof addProductMediaServiceInputSchema
>;
export type ProductMediaLinkServiceInputContract = z.infer<
  typeof productMediaLinkServiceInputSchema
>;
export type ReorderProductMediaServiceInputContract = z.infer<
  typeof reorderProductMediaServiceInputSchema
>;
export type UpdateProductMediaServiceInputContract = z.infer<
  typeof updateProductMediaServiceInputSchema
>;
export type ReorderCollectionProductsServiceInputContract = z.infer<
  typeof reorderCollectionProductsServiceInputSchema
>;
export type ListCollectionProductsServiceInputContract = z.infer<
  typeof listCollectionProductsServiceInputSchema
>;
export type SetPrimaryProductImageServiceInputContract = z.infer<
  typeof setPrimaryProductImageServiceInputSchema
>;
export type RemovePrimaryProductImageServiceInputContract = z.infer<
  typeof removePrimaryProductImageServiceInputSchema
>;

export type VariantBarcodeContract = z.infer<
  typeof variantBarcodeContractSchema
>;
export type BarcodeLookupContract = z.infer<typeof barcodeLookupContractSchema>;

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

export type InventoryVariantReadContract = {
  color: string;
  id: string;
  productId: string;
  productName: string;
  size: string;
  sku: string;
};

export type InventoryLocationReadContract = {
  id: string;
  name: string;
};

export type InventoryAvailabilityReadContract = {
  availableToSell: number;
  location: InventoryLocationReadContract;
  onHand: number;
  reserved: number;
  variant: InventoryVariantReadContract;
};

export type StockLocationReadContract = {
  branch: {
    id: string;
    name: string;
    status: z.infer<typeof branchStatusSchema>;
  };
  id: string;
  isSellable: boolean;
  name: string;
  status: z.infer<typeof stockLocationStatusSchema>;
  type: z.infer<typeof stockLocationTypeSchema>;
};

export type InventoryMovementHistoryContract = {
  destinationLocation: InventoryLocationReadContract | null;
  id: string;
  occurredAt: string;
  quantity: number;
  sourceLocation: InventoryLocationReadContract | null;
  status: z.infer<typeof inventoryMovementStatusSchema>;
  type: z.infer<typeof inventoryMovementTypeSchema>;
  variant: InventoryVariantReadContract;
};

export type InventoryReadPageContract<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export type VariantInventoryAvailabilityContract = {
  locations: Array<{
    availableToSell: number;
    location: InventoryLocationReadContract;
    onHand: number;
    reserved: number;
  }>;
  variant: InventoryVariantReadContract;
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

export const categoryContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    description: z.string().nullable(),
    id: idSchema,
    name: z.string(),
    organizationId: idSchema,
    parentId: idSchema.nullable(),
    slug: z.string(),
    sortOrder: z.number().int().nonnegative(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const collectionContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    description: z.string().nullable(),
    id: idSchema,
    name: z.string(),
    organizationId: idSchema,
    slug: z.string(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const colorContractSchema = z
  .object({
    code: z.string(),
    createdAt: isoTimestampSchema,
    hexValue: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable(),
    id: idSchema,
    name: z.string(),
    organizationId: idSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const sizeContractSchema = z
  .object({
    code: z.string(),
    createdAt: isoTimestampSchema,
    id: idSchema,
    name: z.string(),
    organizationId: idSchema,
    sortOrder: z.number().int().nonnegative(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const productContractSchema = z
  .object({
    categoryId: idSchema,
    createdAt: isoTimestampSchema,
    description: z.string().nullable(),
    id: idSchema,
    name: z.string(),
    organizationId: idSchema,
    productCode: z.string(),
    slug: z.string(),
    status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const productVariantContractSchema = z
  .object({
    colorId: idSchema,
    createdAt: isoTimestampSchema,
    id: idSchema,
    organizationId: idSchema,
    productId: idSchema,
    sizeId: idSchema,
    sku: z.string(),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const variantBarcodeContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    id: idSchema,
    organizationId: idSchema,
    productVariantId: idSchema,
    status: barcodeStatusSchema,
    type: barcodeTypeSchema,
    updatedAt: isoTimestampSchema,
    value: z.string().min(1).max(80),
  })
  .strict();

export const barcodeLookupContractSchema = z
  .object({
    barcode: variantBarcodeContractSchema,
    color: z.string().min(1),
    productName: z.string().min(1),
    size: z.string().min(1),
    sku: z.string().min(1),
    variantId: idSchema,
  })
  .strict();

export const productDetailsContractSchema = z
  .object({
    collectionIds: z.array(idSchema),
    media: z.array(productMediaSchema).default([]),
    primaryImage: primaryProductImageSchema.nullable(),
    product: productContractSchema,
    variants: z.array(productVariantContractSchema),
  })
  .strict();

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

export const inventoryVariantReadContractSchema = z
  .object({
    color: z.string(),
    id: idSchema,
    productId: idSchema,
    productName: z.string(),
    size: z.string(),
    sku: z.string(),
  })
  .strict();

export const inventoryLocationReadContractSchema = z
  .object({
    id: idSchema,
    name: z.string(),
  })
  .strict();

export const inventoryAvailabilityReadContractSchema = z
  .object({
    availableToSell: z.number().int(),
    location: inventoryLocationReadContractSchema,
    onHand: z.number().int(),
    reserved: z.number().int().nonnegative(),
    variant: inventoryVariantReadContractSchema,
  })
  .strict();

export const stockLocationReadContractSchema = z
  .object({
    branch: z
      .object({
        id: idSchema,
        name: z.string(),
        status: branchStatusSchema,
      })
      .strict(),
    id: idSchema,
    isSellable: z.boolean(),
    name: z.string(),
    status: stockLocationStatusSchema,
    type: stockLocationTypeSchema,
  })
  .strict();

export const inventoryMovementHistoryContractSchema = z
  .object({
    destinationLocation: inventoryLocationReadContractSchema.nullable(),
    id: idSchema,
    occurredAt: isoTimestampSchema,
    quantity: positiveInventoryQuantitySchema,
    sourceLocation: inventoryLocationReadContractSchema.nullable(),
    status: inventoryMovementStatusSchema,
    type: inventoryMovementTypeSchema,
    variant: inventoryVariantReadContractSchema,
  })
  .strict();

export function inventoryReadPageContractSchema<T extends z.ZodType>(
  itemSchema: T,
) {
  return z
    .object({
      hasMore: z.boolean(),
      items: z.array(itemSchema),
      nextCursor: z.string().nullable(),
    })
    .strict();
}

export const inventoryAvailabilityPageContractSchema =
  inventoryReadPageContractSchema(inventoryAvailabilityReadContractSchema);

export const inventoryStockLocationPageContractSchema =
  inventoryReadPageContractSchema(stockLocationReadContractSchema);

export const inventoryMovementHistoryPageContractSchema =
  inventoryReadPageContractSchema(inventoryMovementHistoryContractSchema);

export const variantInventoryAvailabilityContractSchema = z
  .object({
    locations: z.array(
      z
        .object({
          availableToSell: z.number().int(),
          location: inventoryLocationReadContractSchema,
          onHand: z.number().int(),
          reserved: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    variant: inventoryVariantReadContractSchema,
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
    boothId: idSchema.nullable(),
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

const salesOrderCustomerSnapshotContractSchema = z
  .object({
    email: z.string().nullable(),
    name: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();

export const salesOrderListReadContractSchema = z
  .object({
    channel: salesOrderChannelSchema,
    commerce: z
      .object({
        paymentPreference: z.enum(["CASH_ON_DELIVERY", "ONLINE_PAYMENT"]),
        source: z.literal("STOREFRONT"),
      })
      .strict()
      .nullable(),
    createdAt: isoTimestampSchema,
    currencyCode: salesOrderCurrencyCodeSchema,
    customer: salesOrderCustomerSnapshotContractSchema,
    delivery: z
      .object({ city: z.string().nullable(), district: z.string().nullable() })
      .strict(),
    id: idSchema,
    orderNumber: z.string(),
    status: salesOrderStatusSchema,
    totalMinor: minorUnitAmountSchema,
  })
  .strict();

export const salesOrderDetailsReadContractSchema = z
  .object({
    boothId: idSchema.nullable(),
    channel: salesOrderChannelSchema,
    commerce: z
      .object({
        paymentPreference: z.enum(["CASH_ON_DELIVERY", "ONLINE_PAYMENT"]),
        source: z.literal("STOREFRONT"),
      })
      .strict()
      .nullable(),
    currencyCode: salesOrderCurrencyCodeSchema,
    customer: salesOrderCustomerSnapshotContractSchema,
    delivery: z
      .object({
        addressLine1: z.string().nullable(),
        addressLine2: z.string().nullable(),
        city: z.string().nullable(),
        district: z.string().nullable(),
        postalCode: z.string().nullable(),
      })
      .strict(),
    id: idSchema,
    inventory: z
      .object({
        fulfillment: z
          .object({
            movement: z
              .object({
                id: idSchema,
                movementNumber: z.string(),
                occurredAt: isoTimestampSchema,
                postedAt: isoTimestampSchema.nullable(),
                status: inventoryMovementStatusSchema,
                type: inventoryMovementTypeSchema,
              })
              .strict()
              .nullable(),
            status: z.enum(["PENDING", "FULFILLED"]),
          })
          .strict(),
        reservation: z
          .object({
            id: idSchema,
            reservationNumber: z.string(),
            status: inventoryReservationStatusSchema,
            stockLocation: z
              .object({ id: idSchema, name: z.string() })
              .strict(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    lines: z.array(
      z
        .object({
          color: z.string().nullable(),
          id: idSchema,
          lineNumber: z.number().int().positive(),
          lineTotalMinor: minorUnitAmountSchema,
          productName: z.string(),
          quantity: z.number().int().positive(),
          size: z.string().nullable(),
          sku: z.string(),
          unitPriceMinor: minorUnitAmountSchema,
        })
        .strict(),
    ),
    orderNumber: z.string(),
    status: salesOrderStatusSchema,
    timestamps: z
      .object({
        cancelledAt: isoTimestampSchema.nullable(),
        confirmedAt: isoTimestampSchema.nullable(),
        createdAt: isoTimestampSchema,
        fulfilledAt: isoTimestampSchema.nullable(),
        reservedAt: isoTimestampSchema.nullable(),
        updatedAt: isoTimestampSchema,
      })
      .strict(),
    totals: z
      .object({
        deliveryMinor: minorUnitAmountSchema,
        discountMinor: minorUnitAmountSchema,
        subtotalMinor: minorUnitAmountSchema,
        totalMinor: minorUnitAmountSchema,
      })
      .strict(),
    version: expectedVersionSchema,
  })
  .strict();

export type SalesOrderManagementListInputContract = z.infer<
  typeof salesOrderManagementListInputSchema
>;
export type SalesOrderManagementDetailsInputContract = z.infer<
  typeof salesOrderManagementDetailsInputSchema
>;
export type SalesOrderManagementActionInputContract = z.infer<
  typeof salesOrderManagementActionInputSchema
>;
export type SalesOrderListReadContract = z.infer<
  typeof salesOrderListReadContractSchema
>;
export type SalesOrderDetailsReadContract = z.infer<
  typeof salesOrderDetailsReadContractSchema
>;

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

export const salesOrderListReadPageContractSchema =
  salesOrderCursorPageResultSchema(salesOrderListReadContractSchema);

export type SalesOrderListReadPageContract = z.infer<
  typeof salesOrderListReadPageContractSchema
>;

const nullableContactTextSchema = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const organizationProfileContractSchema = z
  .object({
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    businessCode: z.string(),
    businessName: z.string(),
    city: z.string().nullable(),
    countryCode: z.string().length(2),
    district: z.string().nullable(),
    email: z.string().nullable(),
    id: idSchema,
    phone: z.string().nullable(),
    postalCode: z.string().nullable(),
    timezone: z.string(),
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const updateOrganizationProfileServiceInputSchema = z
  .object({
    addressLine1: nullableContactTextSchema(240),
    addressLine2: nullableContactTextSchema(240),
    businessName: displayNameSchema.optional(),
    city: nullableContactTextSchema(120),
    countryCode: z.string().trim().length(2).optional(),
    district: nullableContactTextSchema(120),
    email: z.string().trim().email().max(254).nullable().optional(),
    expectedVersion: expectedVersionSchema,
    phone: nullableContactTextSchema(40),
    postalCode: nullableContactTextSchema(120),
    timezone: z.string().trim().min(3).max(80).optional(),
  })
  .strict();

export const storeManagementContractSchema = z
  .object({
    address: z.string().nullable(),
    city: z.string().nullable(),
    code: z.string(),
    countryCode: z.string(),
    id: idSchema,
    name: z.string(),
    phone: z.string().nullable(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    timezone: z.string(),
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const createStoreServiceInputSchema = z
  .object({
    address: nullableContactTextSchema(240),
    city: nullableContactTextSchema(120),
    code: codeSchema,
    name: displayNameSchema,
    phone: nullableContactTextSchema(40),
  })
  .strict();

export const updateStoreServiceInputSchema = z
  .object({
    address: nullableContactTextSchema(240),
    city: nullableContactTextSchema(120),
    expectedVersion: expectedVersionSchema,
    name: displayNameSchema.optional(),
    phone: nullableContactTextSchema(40),
    storeId: idSchema,
  })
  .strict();

export const updateStoreStatusServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
    storeId: idSchema,
  })
  .strict();

export const teamMemberContractSchema = z
  .object({
    email: z.string().email(),
    id: idSchema,
    name: z.string().nullable(),
    role: roleSchema,
    status: organizationMembershipStatusSchema,
    storeAccess: z.string(),
    updatedAt: isoTimestampSchema,
    userStatus: userStatusSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const createTeamMemberServiceInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    name: displayNameSchema,
    role: roleSchema,
  })
  .strict();

export const updateTeamMemberStatusServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    status: organizationMembershipStatusSchema,
    teamMemberId: idSchema,
  })
  .strict();

export const assignTeamMemberRoleServiceInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    role: roleSchema,
    teamMemberId: idSchema,
  })
  .strict();

export const roleVisibilityContractSchema = z
  .object({
    description: z.string(),
    name: z.string(),
    permissions: z.array(
      z
        .object({
          action: permissionActionSchema,
          resource: permissionResourceSchema,
        })
        .strict(),
    ),
    role: roleSchema,
  })
  .strict();

export const salesBoothStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const salesBoothContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    endDate: calendarDateSchema,
    id: idSchema,
    location: z.string(),
    name: z.string(),
    responsibleStaffName: z.string().nullable(),
    startDate: calendarDateSchema,
    status: salesBoothStatusSchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const createSalesBoothServiceInputSchema = z
  .object({
    endDate: calendarDateSchema,
    location: z.string().trim().min(1).max(240),
    name: z.string().trim().min(1).max(160),
    startDate: calendarDateSchema,
  })
  .strict();

export const updateSalesBoothStatusServiceInputSchema = z
  .object({
    boothId: idSchema,
    expectedVersion: expectedVersionSchema,
    status: salesBoothStatusSchema,
  })
  .strict();

export const salesSourceSummaryContractSchema = z
  .object({
    booths: z.array(
      z
        .object({
          booth: salesBoothContractSchema,
          orderCount: z.number().int().nonnegative(),
          totalMinor: minorUnitAmountSchema,
        })
        .strict(),
    ),
    channels: z.array(
      z
        .object({
          orderCount: z.number().int().nonnegative(),
          salesChannel: salesChannelSchema,
          totalMinor: minorUnitAmountSchema,
        })
        .strict(),
    ),
    legacyOrderCount: z.number().int().nonnegative(),
  })
  .strict();

export const salesSourceEmptyInputSchema = z.object({}).strict();

export const organizationManagementEmptyInputSchema = z.object({}).strict();

export type OrganizationProfileContract = z.infer<
  typeof organizationProfileContractSchema
>;
export type UpdateOrganizationProfileServiceInputContract = z.infer<
  typeof updateOrganizationProfileServiceInputSchema
>;
export type StoreManagementContract = z.infer<
  typeof storeManagementContractSchema
>;
export type CreateStoreServiceInputContract = z.infer<
  typeof createStoreServiceInputSchema
>;
export type UpdateStoreServiceInputContract = z.infer<
  typeof updateStoreServiceInputSchema
>;
export type UpdateStoreStatusServiceInputContract = z.infer<
  typeof updateStoreStatusServiceInputSchema
>;
export type TeamMemberContract = z.infer<typeof teamMemberContractSchema>;
export type CreateTeamMemberServiceInputContract = z.infer<
  typeof createTeamMemberServiceInputSchema
>;
export type UpdateTeamMemberStatusServiceInputContract = z.infer<
  typeof updateTeamMemberStatusServiceInputSchema
>;
export type AssignTeamMemberRoleServiceInputContract = z.infer<
  typeof assignTeamMemberRoleServiceInputSchema
>;
export type RoleVisibilityContract = z.infer<
  typeof roleVisibilityContractSchema
>;
export type SalesBoothContract = z.infer<typeof salesBoothContractSchema>;
export type CreateSalesBoothServiceInputContract = z.infer<
  typeof createSalesBoothServiceInputSchema
>;
export type UpdateSalesBoothStatusServiceInputContract = z.infer<
  typeof updateSalesBoothStatusServiceInputSchema
>;
export type SalesSourceSummaryContract = z.infer<
  typeof salesSourceSummaryContractSchema
>;

export const salesCounterTypeSchema = z.enum(["STORE", "EVENT_BOOTH"]);
export const salesCounterStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const salesSessionStatusSchema = z.enum(["OPEN", "CLOSED"]);

export const salesCounterContractSchema = z
  .object({
    boothId: idSchema.nullable(),
    branchId: idSchema.nullable(),
    code: z.string(),
    createdAt: isoTimestampSchema,
    id: idSchema,
    name: z.string(),
    status: salesCounterStatusSchema,
    type: salesCounterTypeSchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const salesSessionContractSchema = z
  .object({
    cartId: idSchema,
    closedAt: isoTimestampSchema.nullable(),
    counterId: idSchema,
    createdAt: isoTimestampSchema,
    id: idSchema,
    openedAt: isoTimestampSchema,
    openedByUserId: idSchema,
    status: salesSessionStatusSchema,
    updatedAt: isoTimestampSchema,
    version: expectedVersionSchema,
  })
  .strict();

export const posCartLineContractSchema = z
  .object({
    cartId: idSchema,
    createdAt: isoTimestampSchema,
    id: idSchema,
    lineSubtotalMinor: minorUnitAmountSchema,
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema,
    unitPriceMinor: minorUnitAmountSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const posCartDetailsContractSchema = z
  .object({
    checkoutId: idSchema.nullable(),
    createdAt: isoTimestampSchema,
    id: idSchema,
    lines: z.array(
      posCartLineContractSchema.extend({
        color: z.string(),
        productName: z.string(),
        size: z.string(),
        sku: z.string(),
      }),
    ),
    salesSessionId: idSchema,
    sessionStatus: salesSessionStatusSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const posSaleLookupContractSchema = z
  .object({
    availabilityStatus: z.literal("AVAILABLE"),
    availableQuantity: z.number().int().positive(),
    barcode: z.string(),
    color: z.string(),
    productName: z.string(),
    sellingPriceMinor: minorUnitAmountSchema,
    size: z.string(),
    sku: z.string(),
    variantId: idSchema,
  })
  .strict();

export const createSalesCounterServiceInputSchema = z
  .object({
    boothId: idSchema.optional(),
    branchId: idSchema.optional(),
    code: codeSchema,
    name: displayNameSchema,
    type: salesCounterTypeSchema,
  })
  .strict();
export const updateSalesCounterStatusServiceInputSchema = z
  .object({
    counterId: idSchema,
    expectedVersion: expectedVersionSchema,
    status: salesCounterStatusSchema,
  })
  .strict();
export const openSalesSessionServiceInputSchema = z
  .object({ counterId: idSchema })
  .strict();
export const closeSalesSessionServiceInputSchema = z
  .object({ expectedVersion: expectedVersionSchema, sessionId: idSchema })
  .strict();
export const posEmptyInputSchema = z.object({}).strict();
export const lookupPosSaleServiceInputSchema = z
  .object({ value: z.string().trim().min(1).max(80) })
  .strict();
export const addPosCartItemServiceInputSchema = z
  .object({
    cartId: idSchema,
    productVariantId: idSchema,
    quantity: positiveInventoryQuantitySchema.max(10000),
  })
  .strict();
export const updatePosCartItemServiceInputSchema = z
  .object({
    cartId: idSchema,
    itemId: idSchema,
    quantity: positiveInventoryQuantitySchema.max(10000),
  })
  .strict();
export const removePosCartItemServiceInputSchema = z
  .object({ cartId: idSchema, itemId: idSchema })
  .strict();
export const getPosCartServiceInputSchema = z
  .object({ cartId: idSchema })
  .strict();

export const posCheckoutStatusSchema = z.literal("COMPLETED");
export const paymentMethodSchema = z.enum([
  "CASH",
  "CARD",
  "MOBILE_BANKING",
  "BANK_TRANSFER",
]);
export const paymentBalanceStatusSchema = z.enum([
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
]);
export const checkoutPaymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "REFUND_DUE",
  "SETTLED",
  "UNRECORDED",
]);
export const checkoutPaymentInstructionSchema = z
  .object({
    amountMinor: minorUnitAmountSchema.positive(),
    method: paymentMethodSchema,
    reference: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((payment, context) => {
    if (payment.method !== "CASH" && !payment.reference) {
      context.addIssue({
        code: "custom",
        message: "A transaction reference is required for non-cash payments.",
        path: ["reference"],
      });
    }
  });
export const posCheckoutContractSchema = z
  .object({
    cartId: idSchema,
    completedAt: isoTimestampSchema,
    counterId: idSchema,
    counterName: z.string(),
    createdAt: isoTimestampSchema,
    id: idSchema,
    idempotencyKey: z.string(),
    orderNumber: z.string(),
    outstandingMinor: minorUnitAmountSchema.nullable(),
    paidMinor: minorUnitAmountSchema.nullable(),
    paymentStatus: checkoutPaymentStatusSchema,
    receiptId: idSchema.nullable(),
    receiptNumber: z.string().nullable(),
    salesOrderId: idSchema,
    salesSessionId: idSchema,
    staffName: z.string(),
    status: posCheckoutStatusSchema,
    subtotalMinor: minorUnitAmountSchema,
    totalMinor: minorUnitAmountSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export const checkoutPosCartServiceInputSchema = z
  .object({
    cartId: idSchema,
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
    payments: z.array(checkoutPaymentInstructionSchema).max(8),
    allowOutstanding: z.boolean(),
  })
  .strict()
  .superRefine((checkout, context) => {
    if (checkout.payments.length === 0 && !checkout.allowOutstanding) {
      context.addIssue({
        code: "custom",
        message:
          "At least one payment is required unless outstanding payment is allowed.",
        path: ["payments"],
      });
    }
  });
export const getPosCheckoutServiceInputSchema = z
  .object({ checkoutId: idSchema })
  .strict();

export const collectPosPaymentServiceInputSchema = z
  .object({
    checkoutId: idSchema,
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
    payments: z.array(checkoutPaymentInstructionSchema).min(1).max(8),
  })
  .strict();
export const getPaymentCollectionReceiptServiceInputSchema = z
  .object({ collectionId: idSchema })
  .strict();

export const paymentCollectionLineContractSchema = z
  .object({
    amountMinor: minorUnitAmountSchema.positive(),
    collectionId: idSchema,
    createdAt: isoTimestampSchema,
    id: idSchema,
    lineNumber: z.number().int().positive(),
    method: paymentMethodSchema,
    reference: z.string().nullable(),
  })
  .strict();
export const paymentCollectionContractSchema = z
  .object({
    acceptedByName: z.string(),
    amountMinor: minorUnitAmountSchema.positive(),
    balanceAfterMinor: minorUnitAmountSchema,
    balanceBeforeMinor: minorUnitAmountSchema.positive(),
    checkoutId: idSchema,
    createdAt: isoTimestampSchema,
    currencyCode: z.literal("BDT"),
    id: idSchema,
    idempotencyKey: z.string(),
    lines: z.array(paymentCollectionLineContractSchema).min(1).max(8),
    receiptId: idSchema,
    receiptNumber: z.string(),
  })
  .strict();
export const paymentAccountContractSchema = z
  .object({
    adjustedPayableMinor: minorUnitAmountSchema.nullable(),
    checkoutId: idSchema,
    collections: z.array(paymentCollectionContractSchema),
    cumulativePaidMinor: minorUnitAmountSchema.nullable(),
    cumulativeRefundedMinor: minorUnitAmountSchema.nullable(),
    grossReceivedMinor: minorUnitAmountSchema.nullable(),
    currencyCode: z.literal("BDT"),
    initialPaidMinor: minorUnitAmountSchema.nullable(),
    initialPayments: z
      .array(
        z
          .object({
            amountMinor: minorUnitAmountSchema.positive(),
            method: paymentMethodSchema,
            reference: z.string().nullable(),
          })
          .strict(),
      )
      .max(8),
    legacyPaymentRecorded: z.boolean(),
    netReceivedMinor: minorUnitAmountSchema.nullable(),
    orderNumber: z.string(),
    originalPayableMinor: minorUnitAmountSchema,
    outstandingMinor: minorUnitAmountSchema.nullable(),
    refundableMinor: minorUnitAmountSchema.nullable(),
    returnCreditMinor: minorUnitAmountSchema,
    settlementStatus: checkoutPaymentStatusSchema,
    status: checkoutPaymentStatusSchema,
    totalMinor: minorUnitAmountSchema,
  })
  .strict();

export const createPaymentRefundServiceInputSchema = z
  .object({
    checkoutId: idSchema,
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
    refunds: z.array(checkoutPaymentInstructionSchema).min(1).max(8),
  })
  .strict();
export const getPaymentRefundReceiptServiceInputSchema = z
  .object({ refundId: idSchema })
  .strict();
export const paymentRefundLineContractSchema = z
  .object({
    amountMinor: minorUnitAmountSchema.positive(),
    createdAt: isoTimestampSchema,
    id: idSchema,
    lineNumber: z.number().int().positive(),
    method: paymentMethodSchema,
    reference: z.string().nullable(),
  })
  .strict();
export const paymentRefundContractSchema = z
  .object({
    acceptedByName: z.string(),
    amountMinor: minorUnitAmountSchema.positive(),
    checkoutId: idSchema,
    createdAt: isoTimestampSchema,
    id: idSchema,
    issuedAt: isoTimestampSchema,
    lines: z.array(paymentRefundLineContractSchema).min(1).max(8),
    receiptId: idSchema,
    receiptNumber: z.string(),
  })
  .strict();
export const paymentRefundAccountContractSchema = z
  .object({
    adjustedPayableMinor: minorUnitAmountSchema.nullable(),
    checkoutId: idSchema,
    cumulativeRefundedMinor: minorUnitAmountSchema.nullable(),
    grossReceivedMinor: minorUnitAmountSchema.nullable(),
    legacyPaymentRecorded: z.boolean(),
    netReceivedMinor: minorUnitAmountSchema.nullable(),
    orderNumber: z.string(),
    originalPayableMinor: minorUnitAmountSchema,
    outstandingMinor: minorUnitAmountSchema.nullable(),
    refundableMinor: minorUnitAmountSchema.nullable(),
    refunds: z.array(paymentRefundContractSchema),
    returnCreditMinor: minorUnitAmountSchema,
    settlementStatus: checkoutPaymentStatusSchema,
  })
  .strict();
export const paymentRefundResultContractSchema = z
  .object({
    account: paymentRefundAccountContractSchema,
    refund: paymentRefundContractSchema,
    replayed: z.boolean(),
  })
  .strict();
export const paymentRefundReceiptContractSchema = z
  .object({
    acceptedByName: z.string(),
    adjustedPayableMinor: minorUnitAmountSchema,
    amountMinor: minorUnitAmountSchema.positive(),
    checkoutId: idSchema,
    cumulativeRefundedMinor: minorUnitAmountSchema,
    grossReceivedMinor: minorUnitAmountSchema,
    id: idSchema,
    issuedAt: isoTimestampSchema,
    lines: z.array(
      paymentRefundLineContractSchema.pick({
        amountMinor: true,
        lineNumber: true,
        method: true,
        reference: true,
      }),
    ),
    netReceivedMinor: minorUnitAmountSchema,
    orderNumber: z.string(),
    organizationAddressLine1: z.string().nullable(),
    organizationAddressLine2: z.string().nullable(),
    organizationCity: z.string().nullable(),
    organizationDistrict: z.string().nullable(),
    organizationEmail: z.string().nullable(),
    organizationName: z.string(),
    organizationPhone: z.string().nullable(),
    organizationPostalCode: z.string().nullable(),
    originalPayableMinor: minorUnitAmountSchema,
    originalReceiptNumber: z.string().nullable(),
    outstandingMinor: minorUnitAmountSchema,
    receiptNumber: z.string(),
    refundableMinor: minorUnitAmountSchema,
    refundId: idSchema,
    returnCreditMinor: minorUnitAmountSchema,
    settlementStatus: checkoutPaymentStatusSchema.exclude(["UNRECORDED"]),
  })
  .strict();

export const posReturnReasonCodeSchema = z.enum([
  "SIZE_OR_FIT",
  "DEFECTIVE",
  "WRONG_ITEM",
  "CHANGED_MIND",
  "OTHER",
]);
export const posReturnLineContractSchema = z
  .object({
    colorSnapshot: z.string().nullable(),
    id: idSchema,
    lineCreditMinor: minorUnitAmountSchema,
    lineNumber: z.number().int().positive(),
    productNameSnapshot: z.string(),
    productVariantId: idSchema,
    quantity: z.number().int().positive(),
    salesOrderLineId: idSchema,
    sizeSnapshot: z.string().nullable(),
    skuSnapshot: z.string(),
    unitPriceMinor: minorUnitAmountSchema,
  })
  .strict();
export const posSaleReturnContractSchema = z
  .object({
    acceptedByName: z.string(),
    checkoutId: idSchema,
    createdAt: isoTimestampSchema,
    destinationLocationId: idSchema,
    destinationLocationName: z.string(),
    id: idSchema,
    inventoryMovementId: idSchema,
    lines: z.array(posReturnLineContractSchema).min(1).max(100),
    reasonCode: posReturnReasonCodeSchema,
    reasonNote: z.string().nullable(),
    receiptId: idSchema,
    receiptNumber: z.string(),
    returnedAt: isoTimestampSchema,
    totalCreditMinor: minorUnitAmountSchema,
  })
  .strict();
export const posReturnAccountContractSchema = z
  .object({
    adjustedPayableMinor: minorUnitAmountSchema.nullable(),
    checkoutId: idSchema,
    cumulativeReceivedMinor: minorUnitAmountSchema.nullable(),
    cumulativeRefundedMinor: minorUnitAmountSchema.nullable(),
    legacyPaymentRecorded: z.boolean(),
    netReceivedMinor: minorUnitAmountSchema.nullable(),
    lines: z.array(
      z
        .object({
          colorSnapshot: z.string().nullable(),
          originalLineTotalMinor: minorUnitAmountSchema,
          productNameSnapshot: z.string(),
          productVariantId: idSchema,
          returnableQuantity: z.number().int().nonnegative(),
          returnedQuantity: z.number().int().nonnegative(),
          salesOrderLineId: idSchema,
          sizeSnapshot: z.string().nullable(),
          skuSnapshot: z.string(),
          soldQuantity: z.number().int().positive(),
          unitPriceMinor: minorUnitAmountSchema,
        })
        .strict(),
    ),
    orderNumber: z.string(),
    originalTotalMinor: minorUnitAmountSchema,
    outstandingMinor: minorUnitAmountSchema.nullable(),
    refundableMinor: minorUnitAmountSchema.nullable(),
    returnCreditMinor: minorUnitAmountSchema,
    returns: z.array(posSaleReturnContractSchema),
    settlementStatus: checkoutPaymentStatusSchema,
  })
  .strict();
export const createPosReturnServiceInputSchema = z
  .object({
    checkoutId: idSchema,
    destinationLocationId: idSchema,
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
    lines: z
      .array(
        z
          .object({
            quantity: z.number().int().positive(),
            salesOrderLineId: idSchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    reasonCode: posReturnReasonCodeSchema,
    reasonNote: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();
export const posReturnResultContractSchema = z
  .object({
    account: posReturnAccountContractSchema,
    replayed: z.boolean(),
    saleReturn: posSaleReturnContractSchema,
  })
  .strict();
export const getPosReturnReceiptServiceInputSchema = z
  .object({ returnId: idSchema })
  .strict();
export const posReturnReceiptContractSchema = z
  .object({
    acceptedByName: z.string(),
    adjustedPayableMinor: minorUnitAmountSchema,
    collectedReceiptNumber: z.string().nullable(),
    cumulativeReceivedMinor: minorUnitAmountSchema,
    cumulativeRefundedMinor: minorUnitAmountSchema,
    cumulativeReturnCreditMinor: minorUnitAmountSchema,
    destinationLocationName: z.string(),
    id: idSchema,
    netReceivedMinor: minorUnitAmountSchema,
    lines: z.array(
      posReturnLineContractSchema.pick({
        colorSnapshot: true,
        lineCreditMinor: true,
        lineNumber: true,
        productNameSnapshot: true,
        quantity: true,
        sizeSnapshot: true,
        skuSnapshot: true,
      }),
    ),
    orderNumber: z.string(),
    organizationAddressLine1: z.string().nullable(),
    organizationAddressLine2: z.string().nullable(),
    organizationCity: z.string().nullable(),
    organizationDistrict: z.string().nullable(),
    organizationEmail: z.string().nullable(),
    organizationName: z.string(),
    organizationPhone: z.string().nullable(),
    organizationPostalCode: z.string().nullable(),
    originalTotalMinor: minorUnitAmountSchema,
    outstandingMinor: minorUnitAmountSchema,
    reasonCode: posReturnReasonCodeSchema,
    reasonNote: z.string().nullable(),
    receiptNumber: z.string(),
    refundableMinor: minorUnitAmountSchema,
    returnId: idSchema,
    returnedAt: isoTimestampSchema,
    settlementStatus: checkoutPaymentStatusSchema.exclude(["UNRECORDED"]),
    totalCreditMinor: minorUnitAmountSchema,
  })
  .strict();
export const collectPosPaymentResultContractSchema = z
  .object({
    account: paymentAccountContractSchema,
    collection: paymentCollectionContractSchema,
    replayed: z.boolean(),
  })
  .strict();

export const salesReceiptLineContractSchema = z
  .object({
    color: z.string().nullable(),
    discountMinor: minorUnitAmountSchema,
    lineNumber: z.number().int().positive(),
    lineTotalMinor: minorUnitAmountSchema,
    productName: z.string(),
    quantity: z.number().int().positive(),
    size: z.string().nullable(),
    sku: z.string(),
    unitPriceMinor: minorUnitAmountSchema,
  })
  .strict();
export const salesReceiptPaymentContractSchema = z
  .object({
    amountMinor: minorUnitAmountSchema.positive(),
    lineNumber: z.number().int().positive(),
    method: paymentMethodSchema,
    reference: z.string().nullable(),
  })
  .strict();
export const salesReceiptContractSchema = z
  .object({
    checkoutId: idSchema,
    counterCode: z.string(),
    counterName: z.string(),
    currencyCode: z.literal("BDT"),
    customerEmail: z.string().nullable(),
    customerName: z.string().nullable(),
    customerPhone: z.string().nullable(),
    deliveryMinor: minorUnitAmountSchema,
    discountMinor: minorUnitAmountSchema,
    id: idSchema,
    issuedAt: isoTimestampSchema,
    lines: z.array(salesReceiptLineContractSchema),
    orderNumber: z.string(),
    organizationAddressLine1: z.string().nullable(),
    organizationAddressLine2: z.string().nullable(),
    organizationCity: z.string().nullable(),
    organizationDistrict: z.string().nullable(),
    organizationEmail: z.string().nullable(),
    organizationName: z.string(),
    organizationPhone: z.string().nullable(),
    organizationPostalCode: z.string().nullable(),
    outstandingMinor: minorUnitAmountSchema,
    paidMinor: minorUnitAmountSchema,
    paymentStatus: paymentBalanceStatusSchema,
    payments: z.array(salesReceiptPaymentContractSchema).max(8),
    receiptNumber: z.string(),
    salesChannel: z.enum(["OFFLINE_STORE", "EVENT_BOOTH"]),
    salesOrderId: idSchema,
    sourceName: z.string(),
    staffName: z.string(),
    subtotalMinor: minorUnitAmountSchema,
    totalMinor: minorUnitAmountSchema,
  })
  .strict();

export const paymentCollectionReceiptContractSchema = z
  .object({
    acceptedByName: z.string(),
    amountMinor: minorUnitAmountSchema.positive(),
    checkoutId: idSchema,
    collectedAt: isoTimestampSchema,
    collectionId: idSchema,
    cumulativePaidMinor: minorUnitAmountSchema,
    currencyCode: z.literal("BDT"),
    id: idSchema,
    orderNumber: z.string(),
    organizationAddressLine1: z.string().nullable(),
    organizationAddressLine2: z.string().nullable(),
    organizationCity: z.string().nullable(),
    organizationDistrict: z.string().nullable(),
    organizationEmail: z.string().nullable(),
    organizationName: z.string(),
    organizationPhone: z.string().nullable(),
    organizationPostalCode: z.string().nullable(),
    outstandingMinor: minorUnitAmountSchema,
    paymentStatus: paymentBalanceStatusSchema,
    payments: z.array(salesReceiptPaymentContractSchema).min(1).max(8),
    receiptNumber: z.string(),
    salesOrderId: idSchema,
    totalMinor: minorUnitAmountSchema,
  })
  .strict();

export type SalesCounterContract = z.infer<typeof salesCounterContractSchema>;
export type SalesSessionContract = z.infer<typeof salesSessionContractSchema>;
export type PosCartLineContract = z.infer<typeof posCartLineContractSchema>;
export type PosCartDetailsContract = z.infer<
  typeof posCartDetailsContractSchema
>;
export type PosSaleLookupContract = z.infer<typeof posSaleLookupContractSchema>;
export type PosCheckoutContract = z.infer<typeof posCheckoutContractSchema>;
export type CheckoutPosCartServiceInputContract = z.infer<
  typeof checkoutPosCartServiceInputSchema
>;
export type PaymentMethodContract = z.infer<typeof paymentMethodSchema>;
export type PaymentBalanceStatusContract = z.infer<
  typeof paymentBalanceStatusSchema
>;
export type SalesReceiptContract = z.infer<typeof salesReceiptContractSchema>;
export type GetPosCheckoutServiceInputContract = z.infer<
  typeof getPosCheckoutServiceInputSchema
>;
export type CollectPosPaymentServiceInputContract = z.infer<
  typeof collectPosPaymentServiceInputSchema
>;
export type PaymentCollectionContract = z.infer<
  typeof paymentCollectionContractSchema
>;
export type PaymentAccountContract = z.infer<
  typeof paymentAccountContractSchema
>;
export type CollectPosPaymentResultContract = z.infer<
  typeof collectPosPaymentResultContractSchema
>;
export type PaymentCollectionReceiptContract = z.infer<
  typeof paymentCollectionReceiptContractSchema
>;
export type CreatePaymentRefundServiceInputContract = z.infer<
  typeof createPaymentRefundServiceInputSchema
>;
export type PaymentRefundContract = z.infer<typeof paymentRefundContractSchema>;
export type PaymentRefundAccountContract = z.infer<
  typeof paymentRefundAccountContractSchema
>;
export type PaymentRefundResultContract = z.infer<
  typeof paymentRefundResultContractSchema
>;
export type PaymentRefundReceiptContract = z.infer<
  typeof paymentRefundReceiptContractSchema
>;
export type PosReturnAccountContract = z.infer<
  typeof posReturnAccountContractSchema
>;
export type PosReturnReasonCode = z.infer<typeof posReturnReasonCodeSchema>;
export type CreatePosReturnServiceInputContract = z.infer<
  typeof createPosReturnServiceInputSchema
>;
export type PosSaleReturnContract = z.infer<typeof posSaleReturnContractSchema>;
export type PosReturnResultContract = z.infer<
  typeof posReturnResultContractSchema
>;
export type PosReturnReceiptContract = z.infer<
  typeof posReturnReceiptContractSchema
>;
export type CreateSalesCounterServiceInputContract = z.infer<
  typeof createSalesCounterServiceInputSchema
>;
export type UpdateSalesCounterStatusServiceInputContract = z.infer<
  typeof updateSalesCounterStatusServiceInputSchema
>;
export type OpenSalesSessionServiceInputContract = z.infer<
  typeof openSalesSessionServiceInputSchema
>;
export type CloseSalesSessionServiceInputContract = z.infer<
  typeof closeSalesSessionServiceInputSchema
>;
export type LookupPosSaleServiceInputContract = z.infer<
  typeof lookupPosSaleServiceInputSchema
>;
export type AddPosCartItemServiceInputContract = z.infer<
  typeof addPosCartItemServiceInputSchema
>;
export type UpdatePosCartItemServiceInputContract = z.infer<
  typeof updatePosCartItemServiceInputSchema
>;
export type RemovePosCartItemServiceInputContract = z.infer<
  typeof removePosCartItemServiceInputSchema
>;
export type GetPosCartServiceInputContract = z.infer<
  typeof getPosCartServiceInputSchema
>;

export const storefrontCatalogQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(64).optional(),
    color: z.string().trim().min(1).max(64).optional(),
    collection: z.string().trim().min(1).max(64).optional(),
    page: z.coerce.number().int().positive().max(10000).optional(),
    pageSize: z.coerce.number().int().positive().max(48).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    size: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const storefrontProductQuerySchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

const storefrontCheckoutLineSchema = z
  .object({
    productVariantId: idSchema,
    quantity: z.number().int().positive().max(20),
    reviewedUnitPriceMinor: minorUnitAmountSchema,
  })
  .strict();

export const storefrontCheckoutInputSchema = z
  .object({
    customer: z
      .object({
        email: z.string().trim().email().max(254).optional(),
        name: z.string().trim().min(2).max(160),
        phone: z.string().trim().min(10).max(20),
      })
      .strict(),
    deliveryAddress: z
      .object({
        city: z.string().trim().min(2).max(120),
        district: z.string().trim().min(2).max(120),
        line1: z.string().trim().min(4).max(240),
        line2: z.string().trim().max(240).optional(),
        postalCode: z.string().trim().max(120).optional(),
      })
      .strict(),
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(storefrontCheckoutLineSchema).min(1).max(20),
    note: z.string().trim().max(1000).optional(),
    paymentPreference: z.enum(["CASH_ON_DELIVERY", "ONLINE_PAYMENT"]),
  })
  .strict();

export const storefrontCheckoutResultSchema = z
  .object({
    currencyCode: z.literal("BDT"),
    orderId: idSchema,
    orderNumber: z.string(),
    payment: z
      .object({
        publicToken: z.string().min(32).max(64),
        redirectUrl: z.string().url().startsWith("https://").nullable(),
        resolutionStatus: z.enum([
          "NORMAL",
          "REVIEW_REQUIRED",
          "REFUND_REQUIRED",
        ]),
        status: z.enum([
          "CREATED",
          "SESSION_READY",
          "PENDING",
          "SUCCEEDED",
          "FAILED",
          "CANCELLED",
          "EXPIRED",
        ]),
      })
      .strict()
      .nullable(),
    paymentPreference: z.enum(["CASH_ON_DELIVERY", "ONLINE_PAYMENT"]),
    status: z.literal("RESERVED"),
    totalMinor: z.number().int().nonnegative(),
  })
  .strict();

export const storefrontPaymentOptionsResultSchema = z
  .object({
    methods: z.array(z.enum(["CASH_ON_DELIVERY", "ONLINE_PAYMENT"])),
  })
  .strict();
export const storefrontPaymentOptionsInputSchema = z.object({}).strict();

const paymentPublicTokenSchema = z.string().trim().min(32).max(64);

export const storefrontPaymentStatusInputSchema = z
  .object({ publicToken: paymentPublicTokenSchema })
  .strict();

export const storefrontPaymentRetryInputSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    publicToken: paymentPublicTokenSchema,
  })
  .strict();

export const onlinePaymentAttemptStatusSchema = z.enum([
  "CREATED",
  "SESSION_READY",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export const onlinePaymentResolutionStatusSchema = z.enum([
  "NORMAL",
  "REVIEW_REQUIRED",
  "REFUND_REQUIRED",
]);

export const onlinePaymentStatusResultSchema = z
  .object({
    amountMinor: minorUnitAmountSchema,
    currencyCode: z.literal("BDT"),
    orderNumber: z.string(),
    payment: z
      .object({
        publicToken: paymentPublicTokenSchema,
        redirectUrl: z.string().url().startsWith("https://").nullable(),
        resolutionStatus: onlinePaymentResolutionStatusSchema,
        status: onlinePaymentAttemptStatusSchema,
      })
      .strict(),
  })
  .strict();

export const providerNotificationInputSchema = z
  .record(z.string().max(80), z.string().max(1000))
  .refine((value) => Object.keys(value).length <= 64, {
    message: "Provider notification contains too many fields.",
  });

export const providerNotificationResultSchema = z
  .object({ accepted: z.boolean(), replayed: z.boolean() })
  .strict();

export const onlinePaymentAdminInputSchema = z
  .object({ salesOrderId: idSchema })
  .strict();

export const onlinePaymentReconcileInputSchema = z
  .object({ paymentAttemptId: idSchema })
  .strict();

export const providerRefundInputSchema = z
  .object({
    amountMinor: minorUnitAmountSchema.positive(),
    idempotencyKey: idempotencyKeySchema,
    paymentAttemptId: idSchema,
    reason: z.string().trim().min(4).max(255),
  })
  .strict();

export const providerRefundRefreshInputSchema = z
  .object({ providerRefundId: idSchema })
  .strict();

export const providerRefundContractSchema = z
  .object({
    amountMinor: minorUnitAmountSchema.positive(),
    confirmedAt: isoTimestampSchema.nullable(),
    failureCode: z.string().nullable(),
    id: idSchema,
    providerRefundReference: z.string().nullable(),
    status: z.enum(["CREATED", "PENDING", "CONFIRMED", "FAILED", "CANCELLED"]),
  })
  .strict();

export const paymentReconciliationContractSchema = z
  .object({
    createdAt: isoTimestampSchema,
    expectedAmountMinor: minorUnitAmountSchema,
    expectedStatus: onlinePaymentAttemptStatusSchema,
    id: idSchema,
    observedAmountMinor: minorUnitAmountSchema.nullable(),
    observedStatus: z.string(),
    outcome: z.enum(["MATCHED", "MISMATCH"]),
    reasonCode: z.string().nullable(),
  })
  .strict();

export const onlinePaymentAdminResultSchema = z
  .object({
    attempt: z
      .object({
        amountMinor: minorUnitAmountSchema,
        bankTransactionId: z.string().nullable(),
        currencyCode: z.literal("BDT"),
        failureCode: z.string().nullable(),
        id: idSchema,
        provider: z.literal("SSLCOMMERZ"),
        providerTransactionId: z.string(),
        resolutionStatus: onlinePaymentResolutionStatusSchema,
        status: onlinePaymentAttemptStatusSchema,
      })
      .strict(),
    reconciliations: z.array(paymentReconciliationContractSchema),
    refunds: z.array(providerRefundContractSchema),
  })
  .strict();

export type StorefrontCatalogQueryContract = z.infer<
  typeof storefrontCatalogQuerySchema
>;
export type StorefrontProductQueryContract = z.infer<
  typeof storefrontProductQuerySchema
>;
export type StorefrontCheckoutInputContract = z.infer<
  typeof storefrontCheckoutInputSchema
>;
export type StorefrontCheckoutResultContract = z.infer<
  typeof storefrontCheckoutResultSchema
>;
export type StorefrontPaymentOptionsResultContract = z.infer<
  typeof storefrontPaymentOptionsResultSchema
>;
export type StorefrontPaymentStatusResultContract = z.infer<
  typeof onlinePaymentStatusResultSchema
>;
export type ProviderNotificationResultContract = z.infer<
  typeof providerNotificationResultSchema
>;
export type OnlinePaymentAdminResultContract = z.infer<
  typeof onlinePaymentAdminResultSchema
>;
export type ProviderRefundContract = z.infer<
  typeof providerRefundContractSchema
>;

function validateBoothSalesSource(
  input: {
    boothId?: string | null;
    channel: z.infer<typeof salesChannelSchema>;
  },
  context: z.RefinementCtx,
): void {
  if (input.channel === "EVENT_BOOTH" && !input.boothId) {
    context.addIssue({
      code: "custom",
      message: "Select a booth for an event booth sale.",
      path: ["boothId"],
    });
  }
  if (input.channel !== "EVENT_BOOTH" && input.boothId) {
    context.addIssue({
      code: "custom",
      message: "A booth can only be used for an event booth sale.",
      path: ["boothId"],
    });
  }
}
