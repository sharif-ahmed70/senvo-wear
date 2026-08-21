import type { PaymentMethod } from "../payment/domain/models.js";

export type OperationalReport = {
  period: { from: string; timezone: string; to: string };
  sales: {
    collectedMinor: number;
    grossMinor: number;
    orderCount: number;
    outstandingMinor: number;
    refundMinor: number;
    returnCreditMinor: number;
  };
  payments: { amountMinor: number; method: PaymentMethod }[];
  products: {
    productName: string;
    quantity: number;
    salesMinor: number;
    sku: string;
  }[];
  inventory: {
    availableToSell: number;
    onHand: number;
    outOfStockPositions: number;
    reserved: number;
  };
  returns: {
    count: number;
    creditMinor: number;
    refundCount: number;
    refundMinor: number;
    reasons: { count: number; reason: string }[];
  };
  staff: {
    collectedMinor: number;
    name: string;
    orderCount: number;
    salesMinor: number;
  }[];
};

export type OperationalReportRepository = {
  get(input: {
    from: string;
    organizationId: string;
    to: string;
  }): Promise<OperationalReport>;
};
