# Sets up the Xprinter XP-365B (USB) for SENVO as separate Windows printers,
# each with its own default paper. Run once as administrator (Windows asks
# "Yes"); safe to run again.
#
#   Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "<path>\setup-printers.ps1"'
#
# Needs the Xprinter XP-365B driver (Seagull, from the printer's CD or
# seagullscientific.com). Optional: the Xprinter "58/80/76 universal receipt
# driver" (https://www.xprinter.net/Driver_Download/2.html), which installs a
# printer "Xprinter XP-80" for receipt mode.
#
# Result:
#   SENVO Label (XP-365B)        barcode labels, 2 x 1.5 in, labels with gaps
#   SENVO Receipt (Label mode)   receipts while the printer is in label mode:
#                                3 x 4 in pages on a continuous roll, 180 deg,
#                                tear off (a long bill continues on the roll)
#   SENVO Receipt                receipts in receipt (ESC/POS) mode, 80 mm roll;
#                                the paper stops where the receipt ends. Only if
#                                the XP-80 driver is installed.
$ErrorActionPreference = "Stop"
$log = Join-Path $env:TEMP "senvo-setup-printers.log"
Start-Transcript -Path $log -Force | Out-Null

$driver = "Xprinter XP-365B"
$label = "SENVO Label (XP-365B)"
$receiptLabelMode = "SENVO Receipt (Label mode)"
$receipt = "SENVO Receipt"
$tsc = "seagull.driver.printer.tsc"

function Set-Option([string]$ticket, [string]$feature, [string]$option) {
  return [regex]::Replace($ticket,
    "(<psf:Feature name=""$([regex]::Escape($feature))"">)[\s\S]*?(</psf:Feature>)",
    "`$1<psf:Option name=""$option""/>`$2")
}

# The queue the driver created ("Xprinter XP-365B") becomes the label printer.
if ((Get-Printer -Name $driver -ErrorAction SilentlyContinue) -and -not (Get-Printer -Name $label -ErrorAction SilentlyContinue)) {
  Rename-Printer -Name $driver -NewName $label
}
$labelPrinter = Get-Printer -Name $label -ErrorAction SilentlyContinue
if (-not $labelPrinter) { throw "No '$driver' printer found. Install the Xprinter XP-365B driver first." }
$port = $labelPrinter.PortName

$t = (Get-PrintConfiguration -PrinterName $label).PrintTicketXML
$t = Set-Option $t "psk:PageMediaSize" "seagull.driver.base:StockBarcode2by1_51_5"
$t = Set-Option $t "${tsc}:JobMediaType" "${tsc}:opt0"        # labels with gaps
$t = Set-Option $t "${tsc}:JobPostPrintAction" "${tsc}:opt2"  # tear off
Set-PrintConfiguration -PrinterName $label -PrintTicketXML $t
Write-Host "$label : Barcode 2 by 1.5, labels with gaps, tear off"

if (-not (Get-Printer -Name $receiptLabelMode -ErrorAction SilentlyContinue)) {
  Add-Printer -Name $receiptLabelMode -DriverName $driver -PortName $port
}
$t = (Get-PrintConfiguration -PrinterName $receiptLabelMode).PrintTicketXML
$t = Set-Option $t "psk:PageMediaSize" "seagull.driver.base:StockUSER"      # 3 x 4 in
$t = Set-Option $t "psk:PageOrientation" "psk:ReversePortrait"              # header first
$t = Set-Option $t "${tsc}:JobMediaType" "${tsc}:opt2"                      # continuous
$t = Set-Option $t "${tsc}:JobPostPrintAction" "${tsc}:opt2"                # tear off
Set-PrintConfiguration -PrinterName $receiptLabelMode -PrintTicketXML $t
Write-Host "$receiptLabelMode : USER 3x4 in, continuous, 180 deg, tear off"

# Receipt mode (ESC/POS) queue from the Xprinter universal receipt driver.
if ((Get-Printer -Name "Xprinter XP-80" -ErrorAction SilentlyContinue) -and -not (Get-Printer -Name $receipt -ErrorAction SilentlyContinue)) {
  Rename-Printer -Name "Xprinter XP-80" -NewName $receipt
}
if (Get-Printer -Name $receipt -ErrorAction SilentlyContinue) {
  $t = (Get-PrintConfiguration -PrinterName $receipt).PrintTicketXML
  $t = Set-Option $t "psk:PageMediaSize" "ns0000:User0000000261"            # 80(72)mm x 3276mm
  Set-PrintConfiguration -PrinterName $receipt -PrintTicketXML $t
  Write-Host "$receipt : 80(72)mm x 3276mm roll (printer must be in receipt mode)"
}

Stop-Transcript | Out-Null
