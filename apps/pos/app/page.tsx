import { ApplicationShell, Button, Panel } from "@senvo/ui";

export default function PosPage() {
  return (
    <ApplicationShell
      appName="SENVO Wear POS"
      eyebrow="Online-first showroom foundation"
    >
      <Panel aria-labelledby="pos-status">
        <h2 id="pos-status">Foundation status</h2>
        <p>
          This touch-friendly shell is prepared for a future online-first
          showroom POS. Cart, barcode, sale, refund, and offline transaction
          features have not been implemented yet.
        </p>
        <div style={{ marginTop: "1.5rem" }}>
          <Button variant="secondary" disabled>
            Workflow not implemented
          </Button>
        </div>
      </Panel>
    </ApplicationShell>
  );
}
