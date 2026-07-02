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
  destinationLocationId: string | null;
  idempotencyKey: string;
  lines: InventoryMovementLineContract[];
  movementNumber: string;
  note: string | null;
  occurredAt: string;
  organizationId: string;
  postedAt: string | null;
  referenceId: string | null;
  referenceType: string | null;
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
    createdAt: isoTimestampSchema,
    destinationLocationId: idSchema.nullable(),
    id: idSchema,
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(inventoryMovementLineContractSchema),
    movementNumber: z.string(),
    note: z.string().nullable(),
    occurredAt: isoTimestampSchema,
    organizationId: idSchema,
    postedAt: isoTimestampSchema.nullable(),
    referenceId: z.string().nullable(),
    referenceType: z.string().nullable(),
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
