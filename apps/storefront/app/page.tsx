import { ApplicationShell, Panel } from "@senvo/ui";

export default function StorefrontPage() {
  return (
    <ApplicationShell
      appName="SENVO Wear Storefront"
      eyebrow="Customer storefront foundation"
    >
      <Panel aria-labelledby="storefront-status">
        <h2 id="storefront-status">Foundation status</h2>
        <p>
          This application is ready for future customer-facing commerce work.
          Product discovery, checkout, accounts, and order flows have not been
          implemented yet.
        </p>
      </Panel>
    </ApplicationShell>
  );
}
