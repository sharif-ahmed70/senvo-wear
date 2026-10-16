import type { Supplier, SupplierStatus } from "../domain/models.js";

export type CreateSupplierRecord = {
  address?: string | null;
  code: string;
  contactPerson?: string | null;
  email?: string | null;
  name: string;
  notes?: string | null;
  organizationId: string;
  phone?: string | null;
  status?: SupplierStatus;
};

export type UpdateSupplierRecord = {
  address?: string | null;
  code?: string;
  contactPerson?: string | null;
  email?: string | null;
  id: string;
  name?: string;
  notes?: string | null;
  organizationId: string;
  phone?: string | null;
  status?: SupplierStatus;
};

export type SupplierListFilter = {
  organizationId: string;
  search?: string;
  status?: SupplierStatus;
};

export type SupplierRepository = {
  create(record: CreateSupplierRecord): Promise<Supplier>;
  deactivate(id: string, organizationId: string): Promise<Supplier | null>;
  findByCode(organizationId: string, code: string): Promise<Supplier | null>;
  findById(id: string, organizationId: string): Promise<Supplier | null>;
  list(filter: SupplierListFilter): Promise<Supplier[]>;
  update(record: UpdateSupplierRecord): Promise<Supplier | null>;
};
