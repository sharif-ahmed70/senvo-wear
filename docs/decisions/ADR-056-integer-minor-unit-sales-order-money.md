# ADR-056: Integer Minor-Unit Sales Order Money

Sales orders store all money as integer minor units. For BDT, `10000` means Tk 100.00.

This avoids floating-point rounding defects and keeps order totals auditable. Tax and pricing engines are intentionally outside this foundation.
