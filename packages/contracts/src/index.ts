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

export type CatalogRecordContract = {
  createdAt: string;
  id: string;
  updatedAt: string;
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
