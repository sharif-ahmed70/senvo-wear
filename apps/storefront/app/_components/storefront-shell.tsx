"use client";

import {
  ArrowRight,
  Heart,
  Menu,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  cartChangedEvent,
  hydrateStoredCart,
  readCart,
  writeCart,
  type HydratedCart,
} from "../_lib/cart";
import { trapFocus } from "../_lib/focus-trap";
import { whatsappHref } from "../_lib/storefront-ui";
import {
  storefrontApi,
  taka,
  type StorefrontCatalog,
} from "../_lib/storefront-api";
import { useCustomerAuth } from "./customer-auth-provider";

const emptyCart: HydratedCart = { lines: [], unavailable: [] };
const mobileLinks = [
  ["01", "New arrivals", "/#collection"],
  ["02", "Categories", "/#categories"],
  ["03", "Our story", "/#journal"],
  ["04", "Your bag", "/cart"],
] as const;

export function StorefrontShell({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useCustomerAuth();
  const [cart, setCart] = useState<HydratedCart>(emptyCart);
  const [cartCount, setCartCount] = useState(0);
  const [cartError, setCartError] = useState("");
  const [cartLoading, setCartLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchCatalog, setSearchCatalog] = useState<StorefrontCatalog | null>(
    null,
  );
  const [searchError, setSearchError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const cartCloseButton = useRef<HTMLButtonElement>(null);
  const authCloseButton = useRef<HTMLButtonElement>(null);
  const menuCloseButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    damping: 30,
    mass: 0.2,
    stiffness: 120,
  });
  const whatsapp = whatsappHref(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);

  const updateCount = useCallback(() => {
    setCartCount(
      readCart(window.localStorage).reduce(
        (total, line) => total + line.quantity,
        0,
      ),
    );
  }, []);

  const loadCart = useCallback(async () => {
    setCartLoading(true);
    setCartError("");
    try {
      setCart(
        await hydrateStoredCart(window.localStorage, () =>
          storefrontApi.fullCatalog(),
        ),
      );
    } catch {
      setCartError(
        "We could not refresh current prices and availability. Your bag is still saved.",
      );
    } finally {
      setCartLoading(false);
    }
  }, []);

  const closePanels = useCallback(() => {
    setCartOpen(false);
    setAuthOpen(false);
    setMenuOpen(false);
    setSearchOpen(false);
    const previous = returnFocus.current;
    window.setTimeout(() => previous?.focus(), 0);
  }, []);

  const openPanel = (panel: "auth" | "cart" | "menu" | "search") => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setCartOpen(panel === "cart");
    setAuthOpen(panel === "auth");
    setMenuOpen(panel === "menu");
    setSearchOpen(panel === "search");
  };

  useEffect(() => {
    const timer = window.setTimeout(updateCount, 0);
    window.addEventListener(cartChangedEvent, updateCount);
    window.addEventListener("storage", updateCount);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(cartChangedEvent, updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, [updateCount]);

  useEffect(() => {
    const open = authOpen || cartOpen || menuOpen || searchOpen;
    document.body.classList.toggle("no-scroll", open);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanels();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [authOpen, cartOpen, closePanels, menuOpen, searchOpen]);

  useEffect(() => {
    const target = authOpen
      ? authCloseButton.current
      : cartOpen
        ? cartCloseButton.current
        : menuOpen
          ? menuCloseButton.current
          : searchOpen
            ? searchInput.current
            : null;
    if (!target) return;
    const timer = window.setTimeout(() => target.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [authOpen, cartOpen, menuOpen, searchOpen]);

  useEffect(() => {
    if (!searchOpen || searchCatalog) return;
    let active = true;
    void Promise.resolve().then(() => active && setSearchError(""));
    void storefrontApi
      .fullCatalog()
      .then((catalog) => active && setSearchCatalog(catalog))
      .catch(
        () =>
          active && setSearchError("Search is unavailable. Please try again."),
      );
    return () => {
      active = false;
    };
  }, [searchCatalog, searchOpen]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const products = searchCatalog?.products ?? [];
    if (!query) return products.slice(0, 6);
    return products
      .filter((product) =>
        [
          product.name,
          product.productCode,
          product.category.name,
          product.collection?.name ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 8);
  }, [searchCatalog, searchQuery]);

  const saveCart = (next: HydratedCart) => {
    setCart(next);
    writeCart(window.localStorage, [...next.lines, ...next.unavailable]);
  };
  const total = cart.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceMinor,
    0,
  );
  const subscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewsletterMessage(
      "Thank you for your interest. SENVO Circle registration is coming soon.",
    );
  };

  return (
    <>
      <motion.div className="scroll-progress" style={{ scaleX: progress }} />
      <div className="senvo-announcement-bar">
        Designed in Dhaka. Delivery available across Bangladesh.
      </div>
      <header className="premium-header">
        <button
          aria-label="Open navigation"
          className="header-icon mobile-menu-trigger"
          onClick={() => openPanel("menu")}
          type="button"
        >
          <Menu size={21} />
        </button>
        <nav aria-label="Primary navigation" className="desktop-navigation">
          <Link href="/#collection">New in</Link>
          <Link href="/#categories">Categories</Link>
          <Link href="/#journal">Journal</Link>
        </nav>
        <Link aria-label="SENVO home" className="senvo-wordmark" href="/">
          senvo<span>wear</span>
        </Link>
        <div className="header-actions">
          {session ? (
            <Link
              aria-label={
                session
                  ? `Account for ${session.profile.firstName}`
                  : "Sign in to your account"
              }
              className="header-icon"
              href="/account"
            >
              <UserRound aria-hidden="true" size={20} />
              <span className="sr-only">
                {authLoading
                  ? "Checking account"
                  : session
                    ? "Your account"
                    : "Sign in"}
              </span>
            </Link>
          ) : (
            <button
              aria-label="Sign in to your account"
              className="header-icon"
              disabled={authLoading}
              onClick={() => openPanel("auth")}
              type="button"
            >
              <UserRound aria-hidden="true" size={20} />
              <span className="sr-only">
                {authLoading ? "Checking account" : "Sign in"}
              </span>
            </button>
          )}
          <button
            aria-label="Search products"
            className="header-icon"
            onClick={() => openPanel("search")}
            type="button"
          >
            <Search size={20} />
          </button>
          <Link
            aria-label="View local wishlist"
            className="header-icon desktop-heart"
            href="/#collection"
          >
            <Heart size={20} />
          </Link>
          <button
            aria-label={`Open shopping bag with ${cartCount} items`}
            className="header-icon bag-trigger"
            onClick={() => {
              openPanel("cart");
              void loadCart();
            }}
            type="button"
          >
            <ShoppingBag size={20} />
            {cartCount > 0 ? <span>{cartCount}</span> : null}
          </button>
        </div>
      </header>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="route-transition"
        initial={false}
        key={pathname}
        transition={{ duration: reduceMotion ? 0 : 0.38 }}
      >
        {children}
      </motion.div>

      <section className="newsletter-band" aria-labelledby="newsletter-title">
        <div>
          <p className="eyebrow light">The SENVO circle</p>
          <h2 id="newsletter-title">
            First look. Private drops. Quiet confidence.
          </h2>
        </div>
        <form onSubmit={subscribe}>
          <label htmlFor="newsletter-email">Email address</label>
          <div>
            <input
              id="newsletter-email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            <button type="submit">
              Join the circle <ArrowRight size={17} />
            </button>
          </div>
          <p aria-live="polite">{newsletterMessage}</p>
        </form>
      </section>

      <footer className="premium-footer">
        <div className="footer-brand-row">
          <Link href="/">senvo</Link>
          <p>Everyday pieces. Extraordinary presence.</p>
        </div>
        <div className="footer-links">
          <div>
            <span>Shop</span>
            <Link href="/#collection">New arrivals</Link>
            <Link href="/#categories">Categories</Link>
            <Link href="/cart">Your bag</Link>
          </div>
          <div>
            <span>Service</span>
            <Link href="/checkout">Delivery</Link>
            <Link href="/payment-return/status">Payment status</Link>
            <a href={whatsapp ?? "#support"}>WhatsApp help</a>
          </div>
          <div>
            <span>About</span>
            <Link href="/#journal">Our story</Link>
            <Link href="/#journal">SENVO journal</Link>
            <Link href="/#newsletter-title">SENVO circle</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>Copyright 2026 SENVO Wear</span>
          <span>Dhaka, Bangladesh</span>
          <span>Prices in BDT</span>
        </div>
      </footer>

      <div
        aria-hidden="true"
        className={`panel-backdrop${
          authOpen || cartOpen || menuOpen || searchOpen ? " open" : ""
        }`}
        onClick={closePanels}
      />

      <aside
        aria-hidden={!authOpen}
        aria-label="Sign in options"
        aria-modal="true"
        className={`side-panel auth-drawer${authOpen ? " open" : ""}`}
        inert={!authOpen}
        onKeyDown={trapFocus}
        role="dialog"
      >
        <div className="panel-header">
          <span>Welcome to SENVO</span>
          <button
            aria-label="Close sign in options"
            onClick={closePanels}
            ref={authCloseButton}
            type="button"
          >
            <X size={21} />
          </button>
        </div>
        <div className="auth-drawer-body">
          <p>Sign in your way and keep your saved bag exactly as it is.</p>
          <Link href="/account/login" onClick={closePanels}>
            Continue with email <ArrowRight size={17} />
          </Link>
          <Link href="/account/code?channel=phone" onClick={closePanels}>
            Continue with phone <ArrowRight size={17} />
          </Link>
          <Link href="/account/code?channel=email" onClick={closePanels}>
            Continue with email code <ArrowRight size={17} />
          </Link>
          <Link href="/account/register" onClick={closePanels}>
            Create an account <ArrowRight size={17} />
          </Link>
        </div>
      </aside>

      <aside
        aria-hidden={!menuOpen}
        aria-label="Mobile navigation"
        aria-modal="true"
        inert={!menuOpen}
        onKeyDown={trapFocus}
        role="dialog"
        className={`side-panel mobile-navigation${menuOpen ? " open" : ""}`}
      >
        <div className="panel-header">
          <span className="senvo-wordmark">senvo</span>
          <button
            aria-label="Close navigation"
            onClick={closePanels}
            ref={menuCloseButton}
          >
            <X size={21} />
          </button>
        </div>
        <nav>
          {mobileLinks.map(([index, label, href]) => (
            <Link href={href} key={label} onClick={closePanels}>
              <span>{index}</span>
              {label}
              <ArrowRight size={18} />
            </Link>
          ))}
        </nav>
        <p>Designed in Dhaka. Made for your everyday.</p>
      </aside>

      <section
        aria-hidden={!searchOpen}
        aria-label="Search SENVO products"
        aria-modal="true"
        inert={!searchOpen}
        onKeyDown={trapFocus}
        role="dialog"
        className={`search-panel${searchOpen ? " open" : ""}`}
      >
        <div className="panel-header">
          <span>Search SENVO</span>
          <button aria-label="Close search" onClick={closePanels}>
            <X size={21} />
          </button>
        </div>
        <label className="search-input">
          <Search size={25} />
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="What are you looking for?"
            ref={searchInput}
            value={searchQuery}
          />
        </label>
        <p className="result-label">
          {searchQuery ? `${searchResults.length} matches` : "Discover now"}
        </p>
        {searchError ? (
          <p className="state-notice error">{searchError}</p>
        ) : null}
        {!searchCatalog && !searchError ? (
          <div className="search-skeletons" aria-label="Loading search results">
            <i />
            <i />
            <i />
          </div>
        ) : null}
        <div className="search-results">
          {searchResults.map((product) => {
            const variant =
              product.variants.find(
                (item) => item.availability === "IN_STOCK",
              ) ?? product.variants[0];
            return (
              <Link
                href={`/products/${product.slug}`}
                key={product.id}
                onClick={closePanels}
              >
                <span className="search-thumb">
                  {product.primaryImage ? (
                    <img alt="" src={product.primaryImage.url} />
                  ) : (
                    product.category.name
                  )}
                </span>
                <span>
                  <small>{product.category.name}</small>
                  <strong>{product.name}</strong>
                  <em>
                    {variant ? taka(variant.sellingPriceMinor) : "Unavailable"}
                  </em>
                </span>
              </Link>
            );
          })}
        </div>
        {searchCatalog && searchResults.length === 0 ? (
          <div className="panel-empty">No pieces match that search.</div>
        ) : null}
      </section>

      <aside
        aria-hidden={!cartOpen}
        aria-label="Shopping bag"
        aria-modal="true"
        inert={!cartOpen}
        onKeyDown={trapFocus}
        role="dialog"
        className={`side-panel cart-drawer${cartOpen ? " open" : ""}`}
      >
        <div className="panel-header">
          <span>Your bag ({cartCount})</span>
          <button
            aria-label="Close shopping bag"
            onClick={closePanels}
            ref={cartCloseButton}
          >
            <X size={21} />
          </button>
        </div>
        <div className="drawer-body">
          {cartLoading ? (
            <div className="drawer-loading">Refreshing your bag...</div>
          ) : null}
          {cartError ? (
            <div className="panel-empty">
              <p>{cartError}</p>
              <button onClick={() => void loadCart()} type="button">
                Try again
              </button>
            </div>
          ) : null}
          {!cartLoading &&
          !cartError &&
          cart.lines.length === 0 &&
          cart.unavailable.length === 0 ? (
            <div className="panel-empty">
              <ShoppingBag size={34} />
              <h2>Your bag is waiting.</h2>
              <p>Start with a signature piece from the SENVO edit.</p>
              <Link href="/#collection" onClick={closePanels}>
                Explore the collection
              </Link>
            </div>
          ) : null}
          {cart.lines.map((line) => (
            <article className="drawer-cart-line" key={line.productVariantId}>
              <Link
                className="drawer-thumb"
                href={`/products/${line.productSlug}`}
              >
                {line.imageUrl ? (
                  <img alt={line.imageAlt ?? ""} src={line.imageUrl} />
                ) : null}
              </Link>
              <div>
                <small>
                  {line.color} / {line.size}
                </small>
                <h2>{line.productName}</h2>
                <strong>{taka(line.unitPriceMinor)}</strong>
                <div className="quantity-control compact">
                  <button
                    aria-label={`Decrease ${line.productName} quantity`}
                    onClick={() =>
                      saveCart({
                        ...cart,
                        lines: cart.lines.map((item) =>
                          item.productVariantId === line.productVariantId
                            ? {
                                ...item,
                                quantity: Math.max(1, item.quantity - 1),
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <Minus size={13} />
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    aria-label={`Increase ${line.productName} quantity`}
                    onClick={() =>
                      saveCart({
                        ...cart,
                        lines: cart.lines.map((item) =>
                          item.productVariantId === line.productVariantId
                            ? {
                                ...item,
                                quantity: Math.min(20, item.quantity + 1),
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <button
                aria-label={`Remove ${line.productName}`}
                className="remove-cart-line"
                onClick={() =>
                  saveCart({
                    ...cart,
                    lines: cart.lines.filter(
                      (item) => item.productVariantId !== line.productVariantId,
                    ),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
          {cart.unavailable.length ? (
            <div className="state-notice error">
              {cart.unavailable.length} saved selection is unavailable. Review
              it on the full bag page.
            </div>
          ) : null}
        </div>
        {cart.lines.length ? (
          <div className="drawer-summary">
            <p>
              <span>Current subtotal</span>
              <strong>{taka(total)}</strong>
            </p>
            <small>
              Final availability and totals are verified again at checkout.
            </small>
            <Link href="/cart" onClick={closePanels}>
              Review bag <ArrowRight size={17} />
            </Link>
          </div>
        ) : null}
      </aside>

      <div className="whatsapp-helper" id="support">
        {whatsapp ? (
          <a
            aria-label="Chat with SENVO on WhatsApp"
            href={whatsapp}
            rel="noreferrer"
            target="_blank"
          >
            <MessageCircle size={24} />
            <span>Chat with us</span>
          </a>
        ) : (
          <button
            aria-label="SENVO WhatsApp support is not configured"
            disabled
            title="WhatsApp support is not configured"
            type="button"
          >
            <MessageCircle size={24} />
          </button>
        )}
      </div>
    </>
  );
}
