import type { BarcodeRepository } from "../../catalog/repositories/catalog-repositories.js";
import {
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import { validateOrganizationAccess } from "../../identity/application/identity-use-cases.js";
import type {
  OrganizationMembershipRepository,
  UserRepository,
} from "../../identity/repositories/identity-repositories.js";
import type { InventoryReadRepository } from "../../inventory/repositories/inventory-read-repository.js";
import type { BranchRepository } from "../../organization/repositories/organization-repositories.js";
import type { SalesSourceRepository } from "../../sales/repositories/sales-order-repositories.js";
import type {
  PosCartLine,
  PosCartDetails,
  PosSaleLookup,
  SalesCounter,
  SalesCounterStatus,
  SalesCounterType,
} from "../domain/models.js";
import type { PosRepository } from "../repositories/pos-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function createSalesCounter(
  repositories: {
    branches: BranchRepository;
    pos: PosRepository;
    salesSources: SalesSourceRepository;
  },
  input: {
    boothId?: string;
    branchId?: string;
    code: string;
    name: string;
    organizationId: string;
    type: SalesCounterType;
  },
): Promise<SalesCounter> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const code = normalizeCode(input.code);
  if (await repositories.pos.findCounterByCode(organizationId, code)) {
    throw new ConflictError("Sales counter code already exists.");
  }
  const branchId =
    input.branchId === undefined ? null : assertId(input.branchId, "branchId");
  const boothId =
    input.boothId === undefined ? null : assertId(input.boothId, "boothId");
  if (input.type === "STORE") {
    if (!branchId || boothId)
      throw new ValidationApplicationError(
        "A store counter requires one store.",
      );
    const branch = await repositories.branches.findById(
      branchId,
      organizationId,
    );
    if (!branch) throw new NotFoundError("Store was not found.");
    if (branch.status !== "ACTIVE")
      throw new BusinessRuleError("The store must be active.");
  } else {
    if (!boothId || branchId)
      throw new ValidationApplicationError(
        "An event counter requires one booth.",
      );
    const booth = await repositories.salesSources.findBoothById(
      boothId,
      organizationId,
    );
    if (!booth) throw new NotFoundError("Booth was not found.");
    if (booth.status !== "ACTIVE")
      throw new BusinessRuleError("The booth must be active.");
  }
  return repositories.pos.createCounter({
    boothId,
    branchId,
    code,
    name: normalizeName(input.name),
    organizationId,
    status: "ACTIVE",
    type: input.type,
  });
}

export function listSalesCounters(
  repository: PosRepository,
  organizationId: string,
) {
  return repository.listCounters(assertId(organizationId, "organizationId"));
}

export async function changeSalesCounterStatus(
  repository: PosRepository,
  input: {
    counterId: string;
    expectedVersion: number;
    organizationId: string;
    status: SalesCounterStatus;
  },
) {
  const counter = await repository.findCounterById(
    assertId(input.counterId, "counterId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!counter) throw new NotFoundError("Sales counter was not found.");
  if (
    input.status === "INACTIVE" &&
    (await repository.findOpenSessionByCounter(
      counter.id,
      counter.organizationId,
    ))
  ) {
    throw new BusinessRuleError(
      "Close the active sales session before deactivating this counter.",
    );
  }
  const updated = await repository.changeCounterStatus({
    ...input,
    id: counter.id,
    organizationId: counter.organizationId,
    expectedVersion: normalizeVersion(input.expectedVersion),
  });
  if (!updated) throw new ConcurrencyError();
  return updated;
}

export async function openSalesSession(
  repositories: {
    memberships: OrganizationMembershipRepository;
    pos: PosRepository;
    users: UserRepository;
  },
  input: {
    counterId: string;
    openedAt: Date;
    openingFloatMinor?: number;
    organizationId: string;
    userId: string;
  },
) {
  const organizationId = assertId(input.organizationId, "organizationId");
  await validateOrganizationAccess(repositories, {
    organizationId,
    userId: assertId(input.userId, "userId"),
  });
  const counter = await repositories.pos.findCounterById(
    assertId(input.counterId, "counterId"),
    organizationId,
  );
  if (!counter) throw new NotFoundError("Sales counter was not found.");
  if (counter.status !== "ACTIVE")
    throw new BusinessRuleError("The sales counter must be active.");
  if (
    await repositories.pos.findOpenSessionByCounter(counter.id, organizationId)
  )
    throw new ConflictError("This counter already has an open sales session.");
  return repositories.pos.openSession({
    counterId: counter.id,
    openedAt: input.openedAt,
    openedByUserId: input.userId,
    openingFloatMinor: normalizeOpeningFloat(input.openingFloatMinor),
    organizationId,
  });
}

export function listSalesSessions(
  repository: PosRepository,
  organizationId: string,
) {
  return repository.listSessions(assertId(organizationId, "organizationId"));
}

export function listCurrentUserSalesSessions(
  repository: PosRepository,
  input: { organizationId: string; userId: string },
) {
  return repository.listOpenSessionsByUser(
    assertId(input.organizationId, "organizationId"),
    assertId(input.userId, "userId"),
  );
}

export async function getPosCart(
  repository: PosRepository,
  input: { cartId: string; organizationId: string; userId: string },
): Promise<PosCartDetails> {
  if (!repository.findCartDetailsById) {
    throw new Error("POS cart read capability is required.");
  }
  const cart = await repository.findCartDetailsById(
    assertId(input.cartId, "cartId"),
    assertId(input.organizationId, "organizationId"),
    assertId(input.userId, "userId"),
  );
  if (!cart) throw new NotFoundError("Cart was not found.");
  return cart;
}

export async function closeSalesSession(
  repository: PosRepository,
  input: {
    closedAt: Date;
    expectedVersion: number;
    organizationId: string;
    sessionId: string;
  },
) {
  const closed = await repository.closeSession({
    closedAt: input.closedAt,
    expectedVersion: normalizeVersion(input.expectedVersion),
    id: assertId(input.sessionId, "sessionId"),
    organizationId: assertId(input.organizationId, "organizationId"),
  });
  if (!closed)
    throw new ConcurrencyError("Open sales session was not found or changed.");
  return closed;
}

export async function lookupPosSale(
  repositories: {
    barcodes: BarcodeRepository;
    inventory: InventoryReadRepository;
  },
  input: { organizationId: string; value: string },
): Promise<PosSaleLookup> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const barcode = await repositories.barcodes.lookupActive(
    organizationId,
    input.value.trim().toUpperCase(),
  );
  if (!barcode || barcode.variantStatus !== "ACTIVE")
    throw new NotFoundError("Sellable barcode was not found.");
  const availability = await repositories.inventory.getVariantAvailability({
    organizationId,
    variantId: barcode.variantId,
  });
  const availableQuantity =
    availability?.locations.reduce(
      (sum, item) => sum + item.availableToSell,
      0,
    ) ?? 0;
  if (availableQuantity <= 0)
    throw new BusinessRuleError("This item is currently unavailable.");
  return {
    availabilityStatus: "AVAILABLE",
    availableQuantity,
    barcode: barcode.barcode.value,
    color: barcode.color,
    productName: barcode.productName,
    sellingPriceMinor: barcode.sellingPriceMinor,
    size: barcode.size,
    sku: barcode.sku,
    variantId: barcode.variantId,
  };
}

export const lookupBarcodeForSale = lookupPosSale;
export const addCartItem = addPosCartItem;
export const removeCartItem = removePosCartItem;
export const updateCartQuantity = updatePosCartItem;

export async function addPosCartItem(
  repositories: {
    inventory: InventoryReadRepository;
    pos: PosRepository;
  },
  input: {
    cartId: string;
    organizationId: string;
    productVariantId: string;
    quantity: number;
    userId: string;
  },
): Promise<PosCartLine> {
  const cart = await requireOpenCart(
    repositories.pos,
    input.cartId,
    input.organizationId,
    input.userId,
  );
  const variant = await repositories.pos.findSellableVariant(
    assertId(input.productVariantId, "productVariantId"),
    cart.organizationId,
  );
  if (!variant || variant.status !== "ACTIVE")
    throw new NotFoundError("Sellable product variant was not found.");
  const quantity = normalizeQuantity(input.quantity);
  const availability = await repositories.inventory.getVariantAvailability({
    organizationId: cart.organizationId,
    variantId: variant.id,
  });
  const availableQuantity =
    availability?.locations.reduce(
      (sum, item) => sum + item.availableToSell,
      0,
    ) ?? 0;
  if (availableQuantity < quantity) {
    throw new BusinessRuleError("Requested quantity is unavailable.");
  }
  return repositories.pos.addCartLine({
    cartId: cart.id,
    lineSubtotalMinor: subtotal(variant.sellingPriceMinor, quantity),
    organizationId: cart.organizationId,
    productVariantId: variant.id,
    quantity,
    unitPriceMinor: variant.sellingPriceMinor,
  });
}

export async function updatePosCartItem(
  repository: PosRepository,
  input: {
    cartId: string;
    itemId: string;
    organizationId: string;
    quantity: number;
    userId: string;
  },
) {
  const cart = await requireOpenCart(
    repository,
    input.cartId,
    input.organizationId,
    input.userId,
  );
  const line = await repository.findCartLineById(
    assertId(input.itemId, "itemId"),
    cart.id,
    cart.organizationId,
  );
  if (!line) throw new NotFoundError("Cart item was not found.");
  const quantity = normalizeQuantity(input.quantity);
  const updated = await repository.updateCartLine({
    cartId: cart.id,
    id: line.id,
    lineSubtotalMinor: subtotal(line.unitPriceMinor, quantity),
    organizationId: cart.organizationId,
    quantity,
  });
  if (!updated) throw new NotFoundError("Cart item was not found.");
  return updated;
}

export async function removePosCartItem(
  repository: PosRepository,
  input: {
    cartId: string;
    itemId: string;
    organizationId: string;
    userId: string;
  },
) {
  const cart = await requireOpenCart(
    repository,
    input.cartId,
    input.organizationId,
    input.userId,
  );
  if (
    !(await repository.removeCartLine(
      assertId(input.itemId, "itemId"),
      cart.id,
      cart.organizationId,
    ))
  )
    throw new NotFoundError("Cart item was not found.");
}

async function requireOpenCart(
  repository: PosRepository,
  cartId: string,
  organizationId: string,
  userId: string,
) {
  const cart = await repository.findCartById(
    assertId(cartId, "cartId"),
    assertId(organizationId, "organizationId"),
    assertId(userId, "userId"),
  );
  if (!cart) throw new NotFoundError("Cart was not found.");
  if (cart.sessionStatus !== "OPEN")
    throw new BusinessRuleError("The sales session is closed.");
  if (cart.checkoutId)
    throw new BusinessRuleError("This sale has already been completed.");
  return cart;
}

function assertId(value: string, field: string) {
  if (!uuidPattern.test(value))
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  return value;
}
function normalizeCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/u.test(code))
    throw new ValidationApplicationError("Counter code is invalid.");
  return code;
}
function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || name.length > 160)
    throw new ValidationApplicationError("Counter name is invalid.");
  return name;
}
function normalizeQuantity(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10000)
    throw new ValidationApplicationError(
      "Quantity must be between 1 and 10000.",
    );
  return value;
}
function normalizeVersion(value: number) {
  if (!Number.isInteger(value) || value < 1)
    throw new ValidationApplicationError(
      "expectedVersion must be a positive integer.",
    );
  return value;
}
function normalizeOpeningFloat(value?: number) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new ValidationApplicationError(
      "openingFloatMinor must be a non-negative integer.",
    );
  }
  return value;
}
function subtotal(price: number, quantity: number) {
  const value = price * quantity;
  if (!Number.isSafeInteger(value) || value > 2147483647)
    throw new ValidationApplicationError("Cart subtotal is too large.");
  return value;
}
