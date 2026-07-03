# ADR-050: Deterministic Priority Selection

Status: Accepted

Allocation candidate order is explicit: preferred location, preferred branch by priority, then remaining policy locations by priority and stock location ID.

The final stock location must not depend on implicit database ordering. Stable ordering keeps preview, allocation, tests, and operations explainable.
