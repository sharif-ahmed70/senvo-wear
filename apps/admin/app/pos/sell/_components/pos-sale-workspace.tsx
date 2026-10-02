"use client";

import { AlertCircle, LoaderCircle, ShoppingCart } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  CheckoutPosCartServiceInputContract,
  PosCartDetailsContract,
  PosCheckoutContract,
  SalesCounterContract,
  SalesSessionContract,
} from "@senvo/contracts";
import { AdminApiClient } from "../../../_lib/api-client";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import {
  prepareCheckoutAttempt,
  type CheckoutAttempt,
} from "../_lib/checkout-attempt";
import {
  friendlyPosError,
  type FriendlyPosError,
} from "../_lib/pos-error-messages";
import { formatBdt } from "../_lib/money";
import { reconcileNextSale } from "../_lib/reconcile-next-sale";
import { BarcodeEntry } from "./barcode-entry";
import { CartLineList } from "./cart-line-list";
import { PaymentPanel } from "./payment-panel";
import { SaleSuccess } from "./sale-success";
import {
  SellingContextSelector,
  type SellingContext,
} from "./selling-context-selector";

import { useAdminPermissions } from "../../../admin-shell";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});
const requiredPermissions: readonly AdminPermissionKey[] = [
  "POS:READ",
  "POS:CREATE",
  "POS:UPDATE",
  "SALES:CREATE",
  "PAYMENT:CREATE",
];

export function PosSaleWorkspace({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const allowed = requiredPermissions.every((permission) =>
    permissions.includes(permission),
  );

  if (!allowed) {
    return (
      <main className="pos-sale-page">
        <section className="pos-sale-state">
          <AlertCircle aria-hidden="true" size={28} />
          <strong>New Sale access is restricted</strong>
          <p>
            Your role does not include everything needed to record counter
            sales.
          </p>
        </section>
      </main>
    );
  }
  return <ActivePosSale permissions={permissions} />;
}

function ActivePosSale({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const [contexts, setContexts] = useState<SellingContext[]>([]);
  const [activeCounters, setActiveCounters] = useState<SalesCounterContract[]>(
    [],
  );
  const [openingCounter, setOpeningCounter] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [cart, setCart] = useState<PosCartDetailsContract | null>(null);
  const [checkout, setCheckout] = useState<PosCheckoutContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preparingNext, setPreparingNext] = useState(false);
  const [nextSaleError, setNextSaleError] = useState<FriendlyPosError | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<FriendlyPosError | null>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const checkoutAttempt = useRef<CheckoutAttempt | null>(null);
  const selectedContext =
    contexts.find(({ session }) => session.id === selectedSessionId) ?? null;
  const subtotalMinor =
    cart?.lines.reduce((sum, line) => sum + line.lineSubtotalMinor, 0) ?? 0;
  const itemCount =
    cart?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const canReadReceipt =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ");

  const loadCart = useCallback(async (cartId: string) => {
    setCartLoading(true);
    try {
      const result = await client.getPosCart(cartId);
      setCart(result.data);
      if (result.data.checkoutId) {
        const completed = await client.getPosCheckout(result.data.checkoutId);
        setCheckout(completed.data);
      }
      setError(null);
    } catch (reason) {
      setError(friendlyPosError(reason, "cart"));
      setCart(null);
    } finally {
      setCartLoading(false);
    }
  }, []);

  const loadContexts = useCallback(async () => {
    setLoading(true);
    try {
      const [counterResult, sessionResult] = await Promise.all([
        client.listSalesCounters(),
        client.listCurrentSalesSessions(),
      ]);
      const activeList = counterResult.data.filter(
        (counter) => counter.status === "ACTIVE",
      );
      setActiveCounters(activeList);
      const counters = new Map<string, SalesCounterContract>(
        activeList.map((counter) => [counter.id, counter]),
      );
      const available = sessionResult.data.flatMap(
        (session: SalesSessionContract) => {
          const counter = counters.get(session.counterId);
          return session.status === "OPEN" && counter
            ? [{ counter, session }]
            : [];
        },
      );
      setContexts(available);
      setSelectedSessionId((current) =>
        available.some(({ session }) => session.id === current)
          ? current
          : available.length === 1
            ? (available[0]?.session.id ?? "")
            : "",
      );
      setError(null);
    } catch (reason) {
      setError(friendlyPosError(reason, "session"));
      setContexts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleOpenCounter(
    counterId: string,
    openingFloatMinor: number,
  ) {
    setOpeningCounter(true);
    setError(null);
    try {
      const opened = await client.openSalesSession({
        counterId,
        openingFloatMinor,
      });
      setNotice("Sales counter opened.");
      await loadContexts();
      setSelectedSessionId(opened.data.id);
    } catch (reason) {
      setError(friendlyPosError(reason, "session"));
    } finally {
      setOpeningCounter(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContexts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContexts]);
  useEffect(() => {
    if (!selectedContext) return;
    const timer = window.setTimeout(
      () => void loadCart(selectedContext.session.cartId),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [loadCart, selectedContext]);
  useEffect(() => {
    if (cart && !paymentOpen && !checkout) scanInput.current?.focus();
  }, [cart, checkout, paymentOpen]);

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!cart || !value || scanBusy || mutatingId) return;
    setScanBusy(true);
    setError(null);
    try {
      const lookup = await client.lookupPosSale(value);
      const existing = cart.lines.find(
        (line) => line.productVariantId === lookup.data.variantId,
      );
      if (existing) {
        await client.updatePosCartItem({
          cartId: cart.id,
          expectedVersion: cart.version,
          itemId: existing.id,
          quantity: existing.quantity + 1,
        });
      } else {
        await client.addPosCartItem({
          cartId: cart.id,
          expectedVersion: cart.version,
          productVariantId: lookup.data.variantId,
          quantity: 1,
        });
      }
      await loadCart(cart.id);
      setScanValue("");
      setNotice(
        `${lookup.data.productName}, ${lookup.data.color}, ${lookup.data.size} added.`,
      );
    } catch (reason) {
      setError(friendlyPosError(reason, "lookup"));
    } finally {
      setScanBusy(false);
      setTimeout(() => scanInput.current?.focus());
    }
  }

  async function changeQuantity(lineId: string, quantity: number) {
    if (!cart || mutatingId || quantity < 1) return;
    setMutatingId(lineId);
    try {
      await client.updatePosCartItem({
        cartId: cart.id,
        expectedVersion: cart.version,
        itemId: lineId,
        quantity,
      });
      await loadCart(cart.id);
      setNotice("Quantity updated.");
    } catch (reason) {
      setError(friendlyPosError(reason, "cart"));
    } finally {
      setMutatingId(null);
    }
  }

  async function removeLine(lineId: string) {
    if (!cart || mutatingId) return;
    setMutatingId(lineId);
    try {
      await client.removePosCartItem({
        cartId: cart.id,
        expectedVersion: cart.version,
        itemId: lineId,
      });
      await loadCart(cart.id);
      setNotice("Item removed.");
    } catch (reason) {
      setError(friendlyPosError(reason, "cart"));
    } finally {
      setMutatingId(null);
    }
  }

  async function completeSale(
    payload: Omit<
      CheckoutPosCartServiceInputContract,
      "cartId" | "idempotencyKey" | "expectedVersion"
    >,
  ) {
    if (!cart || submitting) return;
    const attempt = prepareCheckoutAttempt(checkoutAttempt.current, payload);
    checkoutAttempt.current = attempt;
    setSubmitting(true);
    setError(null);
    try {
      const result = await client.checkoutPosCart({
        ...payload,
        cartId: cart.id,
        expectedVersion: cart.version,
        idempotencyKey: attempt.idempotencyKey,
      });
      setCheckout(result.data);
      setPaymentOpen(false);
      setNotice("Sale completed.");
    } catch (reason) {
      setError(friendlyPosError(reason, "checkout"));
    } finally {
      setSubmitting(false);
    }
  }

  async function startNextSale() {
    if (!selectedContext || preparingNext) return;
    setPreparingNext(true);
    setNextSaleError(null);
    try {
      const next = await reconcileNextSale(
        {
          startNextCart: async (sessionId) =>
            (await client.startNextPosCart(sessionId)).data,
        },
        {
          completedSessionId: selectedContext.session.id,
          counterId: selectedContext.counter.id,
        },
      );
      const nextCart = (await client.getPosCart(next.cartId)).data;
      checkoutAttempt.current = null;
      setContexts((current) => [
        ...current.filter(
          ({ counter, session }) =>
            counter.id !== selectedContext.counter.id && session.id !== next.id,
        ),
        { counter: selectedContext.counter, session: next },
      ]);
      setSelectedSessionId(next.id);
      setCart(nextCart);
      setCheckout(null);
      setNotice("New sale ready.");
    } catch (reason) {
      setNextSaleError(friendlyPosError(reason, "session"));
    } finally {
      setPreparingNext(false);
    }
  }

  if (checkout)
    return (
      <SaleSuccess
        canReadReceipt={canReadReceipt}
        checkout={checkout}
        onNextSale={() => void startNextSale()}
        preparationError={nextSaleError}
        preparingNext={preparingNext}
      />
    );

  return (
    <main className="pos-sale-page">
      <header className="pos-sale-header">
        <div>
          <p>Point of sale</p>
          <h1>New Sale</h1>
          <span>Scan items, review the order, and take payment.</span>
        </div>
        {selectedContext ? (
          <div className="pos-sale-header__counter">
            <span>Sales counter</span>
            <strong>{selectedContext.counter.name}</strong>
          </div>
        ) : null}
      </header>
      <div aria-live="polite" className="pos-sale-announcer">
        {notice ? <p className="pos-notice">{notice}</p> : null}
        {error ? (
          <p className="pos-form-error" role="alert">
            {error.message}
            {cart &&
            error.message === "Cart changed on another screen. Refresh." ? (
              <button
                className="pos-sale-secondary"
                disabled={cartLoading || submitting}
                type="button"
                onClick={() => {
                  setPaymentOpen(false);
                  void loadCart(cart.id);
                }}
              >
                Refresh cart
              </button>
            ) : null}
            {error.requestId ? (
              <small> Support reference: {error.requestId}</small>
            ) : null}
          </p>
        ) : null}
      </div>
      {loading ? (
        <section className="pos-sale-state">
          <LoaderCircle className="pos-spin" size={26} />
          <strong>Preparing New Sale</strong>
          <p>Checking sales counters and open sessions.</p>
        </section>
      ) : (
        <>
          <SellingContextSelector
            availableCounters={activeCounters}
            contexts={contexts}
            onOpenCounter={(counterId, floatMinor) =>
              void handleOpenCounter(counterId, floatMinor)
            }
            onSelect={setSelectedSessionId}
            openingCounter={openingCounter}
            selectedId={selectedSessionId}
          />
          {selectedContext &&
            (cartLoading && !cart ? (
              <section className="pos-sale-state">
                <LoaderCircle className="pos-spin" size={26} />
                <strong>Loading your order</strong>
              </section>
            ) : cart ? (
              paymentOpen ? (
                <PaymentPanel
                  canApproveDue={permissions.includes("PAYMENT:APPROVE")}
                  onCancel={() => !submitting && setPaymentOpen(false)}
                  onComplete={(input) => void completeSale(input)}
                  submitting={submitting}
                  totalMinor={subtotalMinor}
                />
              ) : (
                <div className="pos-sale-layout">
                  <section className="pos-sale-main">
                    <BarcodeEntry
                      busy={scanBusy}
                      disabled={Boolean(mutatingId)}
                      inputRef={scanInput}
                      onSubmit={(event) => void scan(event)}
                      onValueChange={setScanValue}
                      value={scanValue}
                    />
                    <CartLineList
                      cart={cart}
                      mutatingId={mutatingId}
                      onQuantity={(itemId, quantity) =>
                        void changeQuantity(itemId, quantity)
                      }
                      onRemove={(itemId) => void removeLine(itemId)}
                    />
                  </section>
                  <aside className="pos-order-summary">
                    <div>
                      <ShoppingCart size={20} />
                      <h2>Order summary</h2>
                    </div>
                    <dl>
                      <div>
                        <dt>Items</dt>
                        <dd>{itemCount}</dd>
                      </div>
                      <div>
                        <dt>Subtotal</dt>
                        <dd>{formatBdt(subtotalMinor)}</dd>
                      </div>
                      <div className="pos-order-total">
                        <dt>Total</dt>
                        <dd>{formatBdt(subtotalMinor)}</dd>
                      </div>
                    </dl>
                    <p>
                      The final amount is confirmed when you complete the sale.
                    </p>
                    <button
                      disabled={
                        cart.lines.length === 0 ||
                        scanBusy ||
                        Boolean(mutatingId)
                      }
                      onClick={() => setPaymentOpen(true)}
                      type="button"
                    >
                      Take payment
                    </button>
                  </aside>
                </div>
              )
            ) : null)}
        </>
      )}
    </main>
  );
}
