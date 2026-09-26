export type SupplierStatus = "ACTIVE" | "INACTIVE";

export type Supplier = {
  address: string | null;
  code: string;
  contactPerson: string | null;
  createdAt: Date;
  email: string | null;
  id: string;
  name: string;
  notes: string | null;
  organizationId: string;
  phone: string | null;
  status: SupplierStatus;
  updatedAt: Date;
};
