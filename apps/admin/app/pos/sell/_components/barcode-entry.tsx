import { LoaderCircle, ScanBarcode } from "lucide-react";
import type { FormEvent, RefObject } from "react";

export function BarcodeEntry({
  busy,
  disabled,
  inputRef,
  onSubmit,
  value,
  onValueChange,
}: {
  busy: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <form className="pos-scan" onSubmit={onSubmit}>
      <label htmlFor="pos-scan-code">Scan barcode or enter code</label>
      <div className="pos-scan__control">
        <ScanBarcode aria-hidden="true" size={22} />
        <input
          autoComplete="off"
          autoFocus
          disabled={disabled}
          id="pos-scan-code"
          maxLength={80}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Scan or type, then press Enter"
          ref={inputRef}
          value={value}
        />
        <button disabled={disabled || busy || !value.trim()} type="submit">
          {busy ? (
            <LoaderCircle aria-hidden="true" className="pos-spin" size={18} />
          ) : null}
          Add item
        </button>
      </div>
    </form>
  );
}
