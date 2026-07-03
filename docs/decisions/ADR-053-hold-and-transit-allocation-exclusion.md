# ADR-053: Hold And Transit Allocation Exclusion

Status: Accepted

Allocation always rejects `QC_HOLD`, `DAMAGE_HOLD`, `RETURN_HOLD`, and `TRANSIT` stock locations.

These location types represent stock that needs inspection, is damaged, has been returned, or is in transit. They are not eligible for sellable reservation allocation even when their status is active.
