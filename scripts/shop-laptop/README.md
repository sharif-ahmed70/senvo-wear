# Shop laptop setup (Windows)

Helpers for the shop counter laptop that runs SENVO Wear from the portable
package (`setup-senvo.ps1`, code in `C:\xampp\htdocs\SENVO Wear`, tools and
backups in `C:\SENVO`). Everything here was tested on that laptop in October
2026.

## দোকানের জন্য সংক্ষেপে (Bangla quick steps)

1. নতুন ল্যাপটপ বা UPDATE-এর পর এই কমান্ড চালান (Admin লাগবে না):
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\shop-laptop\install-shop-laptop.ps1`
   — ডেস্কটপের **SENVO Start / SENVO Stop** আইকন আর রাত ৯টার ব্যাকআপ ঠিক হয়ে যাবে।
2. প্রিন্টার: `printers\setup-printers.ps1` Admin হিসেবে একবার চালান (Windows "Yes" চাইবে)।
3. রসিদ ছাপার সময় Edge-এ: Printer **SENVO Receipt (Label mode)**, Paper **USER**,
   Scale **Actual size**, Margins **None**, Headers and footers বন্ধ।
   বারকোড লেবেল: Printer **SENVO Label (XP-365B)**।

## Files

| File | What it does |
|---|---|
| `install-shop-laptop.ps1` | Copies the files below to `C:\SENVO`, points the desktop icons at them and keeps the `SENVO DB Backup` task at 21:00. Run after every `setup-senvo.ps1` (it resets the icons). |
| `senvo-start.cmd` / `senvo-start.ps1` | Desktop **SENVO Start**. Starts PostgreSQL (waits up to 10 min for crash recovery on the HDD), frees ports 3000/3001/4000 and 5432 from other programs, runs `scripts\start-local.ps1`, retries up to 3 times, one run at a time (mutex), QuickEdit off so a click cannot pause it, then opens `http://localhost:3001/login` in Edge. If SENVO already runs it only opens Edge. |
| `senvo-stop.cmd` | Desktop **SENVO Stop**. Stops the servers and shuts PostgreSQL down cleanly (no slow recovery at the next start). |
| `senvo-db.ps1` | `-Action start|stop|backup` for the portable PostgreSQL in `C:\SENVO`. `backup` starts the database if needed, runs `scripts\backup-db.ps1` and stops it again if it was off. |
| `senvo-backup.cmd` | What the 21:00 task runs (`senvo-db.ps1 -Action backup`). |
| `printers\setup-printers.ps1` | Admin, once. Xprinter XP-365B as separate Windows printers with their own default paper (below). |

## Printers (Xprinter XP-365B on USB)

| Windows printer | Driver | Default | Use |
|---|---|---|---|
| SENVO Label (XP-365B) | Xprinter XP-365B (Seagull) | Barcode 2 by 1.5 in, labels with gaps, tear off | Barcode labels (printer in label mode, label roll, FEED-calibrated) |
| SENVO Receipt (Label mode) | Xprinter XP-365B (Seagull) | USER 3 x 4 in, continuous, reverse portrait (header first), tear off | Receipts while the printer is in label mode. A long bill continues over the next 4 in pages; up to ~10 cm blank at the end. |
| SENVO Receipt | Xprinter XP-80 (ESC/POS) | 80(72) x 3276 mm | Receipts when the printer is switched to receipt mode; the paper stops where the receipt ends. Driver: [Xprinter 58/80/76 universal receipt driver](https://www.xprinter.net/Driver_Download/2.html). |

Why the receipt is printed at 100% and 72 mm wide: the label driver only knows
fixed page sizes. A forced CSS `@page` size made the browser shrink the whole
receipt onto the driver's page (tiny text), and the 3 inch head prints only
72 mm (576 dots at 203 dpi), so a 76 mm receipt lost its right edge. See
`apps/admin/app/pos/_components/thermal-page-size.tsx` and the receipt rules
in `apps/admin/app/globals.css`.

The XP-365B's mode (label or receipt) is changed on the printer itself (rear
DIP switch 1, or hold Pause while switching on and press Feed). Receipt mode
did not take on this unit, so receipts use "SENVO Receipt (Label mode)".

## Code changes made on the shop laptop (in this branch)

1. **Inventory card picture fills the card**: `ProductThumb` `fill` prop
   (`apps/admin/app/_components/product-thumb.*`), inventory card hero 220px.
2. **Inventory "Stock Value / মালের দাম" card** (cost value, owner/admin only):
   dashboard `financials.stock` (domain `reporting/dashboard.ts`, repository,
   contract); the inventory page shows it only when present.
3. **Staff may give POS discounts**: `approveDiscount` needs POS UPDATE (the
   checkout permission) instead of POS APPROVE; POS screen shows the discount
   controls for POS UPDATE.
4. **Receipt printing**: no forced `@page` size, receipt 72 mm, 3.5 mm from the
   left edge, compact sizes, print rules that zero the layout's margins, closing
   text "ধন্যবাদ, আবার আসবেন! / Thank you for shopping / ★ Always Stay With
   SENVO ★ / Best Product · Best Price".
5. **Barcode scanning** in Receive Stock and the restock search
   (`apps/admin/app/_lib/scan-input.ts`): Bangla digits from a Bangla keyboard
   layout become 0-9, spaces and control characters are dropped, Enter or Tab
   submits, the scan box keeps focus.
6. **Add a missed / new colour or size to an existing product**: buttons
   "নতুন রং / Size যোগ করুন" and "আবার মাল এলো" in the Inventory product panel
   and on the Catalog product page open
   `/inventory/intake?tab=restock&product=<id>&code=<code>[&add=1]` with the
   product chosen.
7. **Profit by product** (`/reports/profit`, the dashboard Profit card links
   there): per product pieces, sales, supplier price, extra cost
   (transport/labour, shown apart so the supplier price stays recognisable),
   profit and margin; rows add up to the Profit card. Owner/admin only.

## Data correction (database, not in git)

2026-10-25: purchase PO-MVL578BW-7832 (CAR-0002, supplier DARE, Memo 074) was
recorded without transport; at the owner's request 100 tk per piece was added
as extra cost, like CAR-0001 (PO-MVL4KPJ3-3947). The supplier ledger was not
changed. A backup from before the change is on the laptop in `C:\SENVO\backups`.
When one memo is received in several intakes, enter each intake's own share of
the transport.
