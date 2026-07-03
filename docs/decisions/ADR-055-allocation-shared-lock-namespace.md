# ADR-055: Allocation Shared Lock Namespace

Status: Accepted

Allocation reuses the inventory advisory lock namespace:

`organizationId:stockLocationId:productVariantId`

Sharing this namespace keeps movement posting, reversal, reservation creation, reservation consumption, and allocation serialized around the same physical stock and active-reservation facts.
