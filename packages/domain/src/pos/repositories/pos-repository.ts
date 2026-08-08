import type {
  PosCart,
  PosCartDetails,
  PosCartLine,
  SalesCounter,
  SalesSession,
  SellableVariant,
} from "../domain/models.js";

export type PosRepository = {
  addCartLine(record: {
    cartId: string;
    lineSubtotalMinor: number;
    organizationId: string;
    productVariantId: string;
    quantity: number;
    unitPriceMinor: number;
  }): Promise<PosCartLine>;
  changeCounterStatus(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: SalesCounter["status"];
  }): Promise<SalesCounter | null>;
  closeSession(record: {
    closedAt: Date;
    expectedVersion: number;
    id: string;
    organizationId: string;
  }): Promise<SalesSession | null>;
  createCounter(
    record: Omit<SalesCounter, "createdAt" | "id" | "updatedAt" | "version">,
  ): Promise<SalesCounter>;
  findCartById(
    id: string,
    organizationId: string,
    openedByUserId: string,
  ): Promise<PosCart | null>;
  findCartDetailsById?(
    id: string,
    organizationId: string,
    openedByUserId: string,
  ): Promise<PosCartDetails | null>;
  findCartLineById(
    id: string,
    cartId: string,
    organizationId: string,
  ): Promise<PosCartLine | null>;
  findCounterByCode(
    organizationId: string,
    code: string,
  ): Promise<SalesCounter | null>;
  findCounterById(
    id: string,
    organizationId: string,
  ): Promise<SalesCounter | null>;
  findOpenSessionByCounter(
    counterId: string,
    organizationId: string,
  ): Promise<SalesSession | null>;
  listOpenSessionsByUser(
    organizationId: string,
    openedByUserId: string,
  ): Promise<SalesSession[]>;
  findSellableVariant(
    id: string,
    organizationId: string,
  ): Promise<SellableVariant | null>;
  listCounters(organizationId: string): Promise<SalesCounter[]>;
  listSessions(organizationId: string): Promise<SalesSession[]>;
  openSession(record: {
    counterId: string;
    openedAt: Date;
    openedByUserId: string;
    organizationId: string;
  }): Promise<SalesSession>;
  removeCartLine(
    id: string,
    cartId: string,
    organizationId: string,
  ): Promise<boolean>;
  updateCartLine(record: {
    cartId: string;
    id: string;
    lineSubtotalMinor: number;
    organizationId: string;
    quantity: number;
  }): Promise<PosCartLine | null>;
};
