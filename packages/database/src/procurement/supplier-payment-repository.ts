import {
  ConflictError,
  type CreateSupplierLedgerEntryRecord,
  type CreateSupplierPaymentRecord,
  type SupplierBalanceSummary,
  type SupplierLedgerEntry,
  type SupplierLedgerListFilter,
  type SupplierLedgerRepository,
  type SupplierPayment,
  type SupplierPaymentListFilter,
  type SupplierPaymentRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export type SupplierPaymentPrismaClient = Pick<
  PrismaClient,
  "supplierPayment" | "supplierLedgerEntry"
>;

export class PrismaSupplierPaymentRepository implements SupplierPaymentRepository {
  constructor(private readonly prisma: SupplierPaymentPrismaClient) {}

  async recordPayment(
    data: CreateSupplierPaymentRecord,
  ): Promise<SupplierPayment> {
    try {
      const created = await this.prisma.supplierPayment.create({
        data: {
          amountMinor: data.amountMinor,
          idempotencyKey: data.idempotencyKey ?? null,
          notes: data.notes ?? null,
          organizationId: data.organizationId,
          paymentDate: data.paymentDate ?? new Date(),
          paymentMethod: data.paymentMethod,
          purchaseId: data.purchaseId ?? null,
          reference: data.reference ?? null,
          supplierId: data.supplierId,
        },
      });

      return mapSupplierPayment(created);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        throw new ConflictError(
          "A supplier payment with this idempotency key already exists.",
        );
      }
      throw error;
    }
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SupplierPayment | null> {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: {
        idempotencyKey,
        organizationId,
      },
    });

    return payment ? mapSupplierPayment(payment) : null;
  }

  async getPaymentById(
    paymentId: string,
    organizationId: string,
  ): Promise<SupplierPayment | null> {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: {
        id: paymentId,
        organizationId,
      },
    });

    return payment ? mapSupplierPayment(payment) : null;
  }

  async listPayments(
    filter: SupplierPaymentListFilter,
  ): Promise<SupplierPayment[]> {
    const where: Prisma.SupplierPaymentWhereInput = {
      organizationId: filter.organizationId,
    };

    if (filter.supplierId) {
      where.supplierId = filter.supplierId;
    }

    if (filter.purchaseId) {
      where.purchaseId = filter.purchaseId;
    }

    if (filter.from || filter.to) {
      where.paymentDate = {};
      if (filter.from) {
        where.paymentDate.gte = filter.from;
      }
      if (filter.to) {
        where.paymentDate.lte = filter.to;
      }
    }

    const payments = await this.prisma.supplierPayment.findMany({
      orderBy: { paymentDate: "desc" },
      skip: filter.offset ?? 0,
      take: filter.limit ?? 50,
      where,
    });

    return payments.map(mapSupplierPayment);
  }
}

export class PrismaSupplierLedgerRepository implements SupplierLedgerRepository {
  constructor(private readonly prisma: SupplierPaymentPrismaClient) {}

  async recordLedgerEntry(
    data: CreateSupplierLedgerEntryRecord,
  ): Promise<SupplierLedgerEntry> {
    const created = await this.prisma.supplierLedgerEntry.create({
      data: {
        amountMinor: data.amountMinor,
        balanceAfterMinor: data.balanceAfterMinor,
        direction: data.direction,
        entryDate: data.entryDate ?? new Date(),
        entryType: data.entryType,
        notes: data.notes ?? null,
        organizationId: data.organizationId,
        referenceId: data.referenceId ?? null,
        referenceType: data.referenceType ?? null,
        supplierId: data.supplierId,
      },
    });

    return mapSupplierLedgerEntry(created);
  }

  async getSupplierBalance(
    supplierId: string,
    organizationId: string,
  ): Promise<SupplierBalanceSummary> {
    const entries = await this.prisma.supplierLedgerEntry.findMany({
      orderBy: { entryDate: "asc" },
      where: {
        organizationId,
        supplierId,
      },
    });

    let totalBilledMinor = 0n;
    let totalPaidMinor = 0n;
    let totalAdjustedMinor = 0n;
    let lastBillDate: Date | null = null;
    let lastPaymentDate: Date | null = null;

    for (const entry of entries) {
      if (entry.entryType === "BILL") {
        totalBilledMinor += entry.amountMinor;
        if (!lastBillDate || entry.entryDate > lastBillDate) {
          lastBillDate = entry.entryDate;
        }
      } else if (entry.entryType === "PAYMENT") {
        totalPaidMinor += entry.amountMinor;
        if (!lastPaymentDate || entry.entryDate > lastPaymentDate) {
          lastPaymentDate = entry.entryDate;
        }
      } else if (entry.entryType === "RETURN_CREDIT") {
        totalPaidMinor += entry.amountMinor;
      } else if (entry.entryType === "ADJUSTMENT") {
        if (entry.direction === "DEBIT") {
          totalAdjustedMinor += entry.amountMinor;
        } else {
          totalAdjustedMinor -= entry.amountMinor;
        }
      } else if (entry.entryType === "OPENING_BALANCE") {
        if (entry.direction === "CREDIT") {
          totalBilledMinor += entry.amountMinor;
        } else {
          totalPaidMinor += entry.amountMinor;
        }
      }
    }

    const outstandingBalanceMinor =
      totalBilledMinor - totalPaidMinor - totalAdjustedMinor;

    return {
      lastBillDate,
      lastPaymentDate,
      organizationId,
      outstandingBalanceMinor,
      supplierId,
      totalAdjustedMinor,
      totalBilledMinor,
      totalPaidMinor,
    };
  }

  async listLedgerEntries(
    filter: SupplierLedgerListFilter,
  ): Promise<SupplierLedgerEntry[]> {
    const where: Prisma.SupplierLedgerEntryWhereInput = {
      organizationId: filter.organizationId,
      supplierId: filter.supplierId,
    };

    if (filter.entryType) {
      where.entryType = filter.entryType;
    }

    if (filter.from || filter.to) {
      where.entryDate = {};
      if (filter.from) {
        where.entryDate.gte = filter.from;
      }
      if (filter.to) {
        where.entryDate.lte = filter.to;
      }
    }

    const entries = await this.prisma.supplierLedgerEntry.findMany({
      orderBy: { entryDate: "desc" },
      skip: filter.offset ?? 0,
      take: filter.limit ?? 50,
      where,
    });

    return entries.map(mapSupplierLedgerEntry);
  }
}

function mapSupplierPayment(record: {
  amountMinor: bigint;
  createdAt: Date;
  id: string;
  idempotencyKey: string | null;
  notes: string | null;
  organizationId: string;
  paymentDate: Date;
  paymentMethod: string;
  purchaseId: string | null;
  reference: string | null;
  supplierId: string;
  updatedAt: Date;
}): SupplierPayment {
  return {
    amountMinor: record.amountMinor,
    createdAt: record.createdAt,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    notes: record.notes,
    organizationId: record.organizationId,
    paymentDate: record.paymentDate,
    paymentMethod: record.paymentMethod as SupplierPayment["paymentMethod"],
    purchaseId: record.purchaseId,
    reference: record.reference,
    supplierId: record.supplierId,
    updatedAt: record.updatedAt,
  };
}

function mapSupplierLedgerEntry(record: {
  amountMinor: bigint;
  balanceAfterMinor: bigint;
  createdAt: Date;
  direction: string;
  entryDate: Date;
  entryType: string;
  id: string;
  notes: string | null;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  supplierId: string;
}): SupplierLedgerEntry {
  return {
    amountMinor: record.amountMinor,
    balanceAfterMinor: record.balanceAfterMinor,
    createdAt: record.createdAt,
    direction: record.direction as SupplierLedgerEntry["direction"],
    entryDate: record.entryDate,
    entryType: record.entryType as SupplierLedgerEntry["entryType"],
    id: record.id,
    notes: record.notes,
    organizationId: record.organizationId,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    supplierId: record.supplierId,
  };
}
