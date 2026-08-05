import type {
  PaymentBalanceStatus,
  PaymentMethod,
} from "../../payment/domain/models.js";
import type { SalesChannel } from "../../sales/domain/models.js";

export type SalesReceiptLine = {
  color: string | null;
  discountMinor: number;
  lineNumber: number;
  lineTotalMinor: number;
  productName: string;
  quantity: number;
  size: string | null;
  sku: string;
  unitPriceMinor: number;
};

export type SalesReceiptPayment = {
  amountMinor: number;
  lineNumber: number;
  method: PaymentMethod;
  reference: string | null;
};

export type SalesReceipt = {
  checkoutId: string;
  counterCode: string;
  counterName: string;
  currencyCode: "BDT";
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryMinor: number;
  discountMinor: number;
  id: string;
  issuedAt: Date;
  lines: SalesReceiptLine[];
  orderNumber: string;
  organizationAddressLine1: string | null;
  organizationAddressLine2: string | null;
  organizationCity: string | null;
  organizationDistrict: string | null;
  organizationEmail: string | null;
  organizationId: string;
  organizationName: string;
  organizationPhone: string | null;
  organizationPostalCode: string | null;
  outstandingMinor: number;
  paidMinor: number;
  paymentBatchId: string;
  paymentStatus: PaymentBalanceStatus;
  payments: SalesReceiptPayment[];
  receiptNumber: string;
  salesChannel: SalesChannel;
  salesOrderId: string;
  sourceName: string;
  staffName: string;
  subtotalMinor: number;
  totalMinor: number;
};

export type ReceiptDocument = SalesReceipt;
