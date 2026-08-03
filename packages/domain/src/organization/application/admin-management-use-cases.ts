import type { Organization } from "../../catalog/domain/models.js";
import {
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import {
  assertPositiveVersion,
  normalizeCountryCode,
  normalizeDisplayName,
  normalizeOptionalCityLike,
  normalizeOptionalEmail,
  normalizeOptionalPhone,
  normalizeOptionalText,
  normalizeTimezone,
} from "../domain/value-objects.js";
import type {
  OrganizationProfileRepository,
  OrganizationTeamMember,
  OrganizationTeamReadRepository,
} from "../repositories/organization-repositories.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type UpdateOrganizationProfileInput = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  countryCode?: string;
  district?: string | null;
  email?: string | null;
  expectedVersion: number;
  name?: string;
  organizationId: string;
  phone?: string | null;
  postalCode?: string | null;
  timezone?: string;
};

export async function getOrganizationProfile(
  repository: OrganizationProfileRepository,
  organizationId: string,
): Promise<Organization> {
  const organization = await repository.findById(assertId(organizationId));
  if (!organization) throw new NotFoundError("Organization was not found.");
  return organization;
}

export async function updateOrganizationProfile(
  repository: OrganizationProfileRepository,
  input: UpdateOrganizationProfileInput,
): Promise<Organization> {
  const organization = await getOrganizationProfile(
    repository,
    input.organizationId,
  );
  const updated = await repository.updateProfile({
    expectedVersion: assertPositiveVersion(input.expectedVersion),
    id: organization.id,
    profile: {
      addressLine1:
        input.addressLine1 === undefined
          ? organization.addressLine1
          : normalizeOptionalText(input.addressLine1, "addressLine1"),
      addressLine2:
        input.addressLine2 === undefined
          ? organization.addressLine2
          : normalizeOptionalText(input.addressLine2, "addressLine2"),
      city:
        input.city === undefined
          ? organization.city
          : normalizeOptionalCityLike(input.city, "city"),
      countryCode:
        input.countryCode === undefined
          ? organization.countryCode
          : normalizeCountryCode(input.countryCode),
      district:
        input.district === undefined
          ? organization.district
          : normalizeOptionalCityLike(input.district, "district"),
      email:
        input.email === undefined
          ? organization.email
          : normalizeOptionalEmail(input.email),
      name:
        input.name === undefined
          ? organization.name
          : normalizeDisplayName(input.name, "business name"),
      phone:
        input.phone === undefined
          ? organization.phone
          : normalizeOptionalPhone(input.phone),
      postalCode:
        input.postalCode === undefined
          ? organization.postalCode
          : normalizeOptionalCityLike(input.postalCode, "postalCode"),
      timezone:
        input.timezone === undefined
          ? organization.timezone
          : normalizeTimezone(input.timezone),
    },
  });
  if (!updated)
    throw new ConflictError("Business profile changed. Please reload.");
  return updated;
}

export function listOrganizationTeam(
  repository: OrganizationTeamReadRepository,
  organizationId: string,
): Promise<OrganizationTeamMember[]> {
  return repository.listByOrganization(assertId(organizationId));
}

function assertId(value: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(
      "organizationId must be a valid UUID.",
    );
  }
  return value;
}
