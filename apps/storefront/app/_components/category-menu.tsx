"use client";

import { ArrowRight, ChevronDown, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { storefrontApi, type StorefrontCatalog } from "../_lib/storefront-api";

type Category = StorefrontCatalog["categories"][number];
type Collection = StorefrontCatalog["collections"][number];
export type CategoryNode = Category & { children: CategoryNode[] };
export type StorefrontFacets = {
  collections: Collection[];
  error: boolean;
  loading: boolean;
  retry: () => void;
  sections: CategoryNode[];
};

/** Sections shown in the bar before the rest move under "More". */
const maxBarSections = 7;

export const categoryHref = (code: string) =>
  `/?category=${encodeURIComponent(code)}#collection`;
export const collectionHref = (code: string) =>
  `/?collection=${encodeURIComponent(code)}#collection`;

const byOrder = (a: Category, b: Category) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);

/** Nests categories under their parents; orphans become main sections. */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: CategoryNode[]) => {
    list.sort(byOrder);
    list.forEach((node) => sort(node.children));
    return list;
  };
  return sort(roots);
}

export function useStorefrontFacets(): StorefrontFacets {
  const [catalog, setCatalog] = useState<Pick<
    StorefrontCatalog,
    "categories" | "collections"
  > | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void storefrontApi
      .catalog({ pageSize: "1" })
      .then((next) => {
        if (!active) return;
        setCatalog(next);
        setError(false);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(false);
    setAttempt((current) => current + 1);
  }, []);

  const sections = useMemo(
    () => buildCategoryTree(catalog?.categories ?? []),
    [catalog],
  );
  const collections = useMemo(
    () =>
      [...(catalog?.collections ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [catalog],
  );

  return { collections, error, loading, retry, sections };
}

type BarItem =
  | { id: string; kind: "section"; label: string; section: CategoryNode }
  | { id: string; kind: "more"; label: string; sections: CategoryNode[] }
  | { id: string; kind: "collections"; label: string };

function SectionLinks({
  onNavigate,
  section,
}: {
  onNavigate: () => void;
  section: CategoryNode;
}) {
  const leaves = section.children.filter((child) => !child.children.length);
  const groups = section.children.filter((child) => child.children.length);
  return (
    <>
      <div className="section-menu-group">
        <h2>{section.name}</h2>
        <ul>
          <li>
            <Link
              className="section-menu-all"
              href={categoryHref(section.code)}
              onClick={onNavigate}
            >
              Shop all {section.name}
            </Link>
          </li>
          {leaves.map((child) => (
            <li key={child.id}>
              <Link href={categoryHref(child.code)} onClick={onNavigate}>
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {groups.map((group) => (
        <div className="section-menu-group" key={group.id}>
          <h2>
            <Link href={categoryHref(group.code)} onClick={onNavigate}>
              {group.name}
            </Link>
          </h2>
          <ul>
            {flatten(group.children).map((child) => (
              <li key={child.id}>
                <Link href={categoryHref(child.code)} onClick={onNavigate}>
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export function SectionBar({ facets }: { facets: StorefrontFacets }) {
  const [openId, setOpenId] = useState("");
  const [closing, setClosing] = useState(false);
  const reduceMotion = useReducedMotion();

  const items = useMemo<BarItem[]>(() => {
    const visible = facets.sections.slice(0, maxBarSections);
    const more = facets.sections.slice(maxBarSections);
    return [
      ...visible.map((section) => ({
        id: section.id,
        kind: "section" as const,
        label: section.name,
        section,
      })),
      ...(more.length
        ? [{ id: "more", kind: "more" as const, label: "More", sections: more }]
        : []),
      ...(facets.collections.length
        ? [
            {
              id: "collections",
              kind: "collections" as const,
              label: "Collections",
            },
          ]
        : []),
    ];
  }, [facets.collections.length, facets.sections]);

  const hasPanel = (item: BarItem) =>
    item.kind !== "section" || item.section.children.length > 0;
  const open = (id: string) => {
    setClosing(false);
    setOpenId(id);
  };
  const close = () => {
    setClosing(false);
    setOpenId("");
  };
  const enter = (item: BarItem) => (hasPanel(item) ? open(item.id) : close());
  const focusTrigger = (item: BarItem, trigger: HTMLElement) => {
    // Escape hands focus back to the trigger without reopening its menu.
    if (trigger.dataset.skipOpen) delete trigger.dataset.skipOpen;
    else enter(item);
  };

  // A short delay lets the pointer travel from the bar into the menu.
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      setOpenId("");
    }, 160);
    return () => window.clearTimeout(timer);
  }, [closing]);

  return (
    <nav
      aria-label="Shop by category"
      className="section-bar"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && openId) {
          event.stopPropagation();
          const trigger = event.currentTarget.querySelector<HTMLElement>(
            `[data-section="${openId}"]`,
          );
          close();
          if (trigger) {
            trigger.dataset.skipOpen = "true";
            trigger.focus();
          }
        }
      }}
      onMouseLeave={() => setClosing(true)}
    >
      <ul className="section-bar-list">
        <li>
          <Link
            className="section-bar-link"
            href="/#collection"
            onFocus={close}
            onMouseEnter={close}
          >
            New in
          </Link>
        </li>
        {facets.loading ? (
          <li aria-label="Loading categories" className="section-bar-loading">
            <i />
            <i />
            <i />
          </li>
        ) : facets.error ? (
          <li>
            <button
              className="section-bar-retry"
              onClick={facets.retry}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={13} /> Categories could not
              load. Try again
            </button>
          </li>
        ) : (
          items.map((item) => {
            const expandable = hasPanel(item);
            const expanded = expandable && openId === item.id;
            const className = `section-bar-link${expanded ? " open" : ""}`;
            return (
              <li key={item.id}>
                {item.kind === "section" ? (
                  <Link
                    aria-controls={
                      expandable ? `section-menu-${item.id}` : undefined
                    }
                    aria-expanded={expandable ? expanded : undefined}
                    className={className}
                    data-section={item.id}
                    href={categoryHref(item.section.code)}
                    onClick={close}
                    onFocus={(event) => focusTrigger(item, event.currentTarget)}
                    onMouseEnter={() => enter(item)}
                  >
                    {item.label}
                    {expandable ? (
                      <ChevronDown aria-hidden="true" size={12} />
                    ) : null}
                  </Link>
                ) : (
                  <button
                    aria-controls={
                      expandable ? `section-menu-${item.id}` : undefined
                    }
                    aria-expanded={expandable ? expanded : undefined}
                    className={className}
                    data-section={item.id}
                    onClick={() => (expanded ? close() : open(item.id))}
                    onFocus={(event) => focusTrigger(item, event.currentTarget)}
                    onMouseEnter={() => enter(item)}
                    type="button"
                  >
                    {item.label}
                    <ChevronDown aria-hidden="true" size={12} />
                  </button>
                )}
                <AnimatePresence>
                  {expanded ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="section-menu"
                      exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                      id={`section-menu-${item.id}`}
                      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                      onMouseEnter={() => open(item.id)}
                      transition={{
                        duration: reduceMotion ? 0 : 0.25,
                        ease: "easeOut",
                      }}
                    >
                      <div className="section-menu-inner">
                        <div className="section-menu-groups">
                          {item.kind === "section" ? (
                            <SectionLinks
                              onNavigate={close}
                              section={item.section}
                            />
                          ) : item.kind === "more" ? (
                            item.sections.map((section) => (
                              <SectionLinks
                                key={section.id}
                                onNavigate={close}
                                section={section}
                              />
                            ))
                          ) : (
                            <div className="section-menu-group">
                              <h2>Collections</h2>
                              <ul>
                                {facets.collections.map((item) => (
                                  <li key={item.id}>
                                    <Link
                                      href={collectionHref(item.code)}
                                      onClick={close}
                                    >
                                      {item.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <Link
                          className="section-menu-feature"
                          href="/#collection"
                          onClick={close}
                        >
                          <span
                            aria-hidden="true"
                            className="section-menu-feature-image"
                            style={{
                              backgroundImage: "url(/senvo-hero-urban.png)",
                            }}
                          />
                          <strong>New arrivals</strong>
                          <small>
                            Shop the latest pieces <ArrowRight size={14} />
                          </small>
                        </Link>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
}

function MobileSection({
  onNavigate,
  section,
}: {
  onNavigate: () => void;
  section: CategoryNode;
}) {
  const [open, setOpen] = useState(false);
  if (!section.children.length) {
    return (
      <li>
        <Link href={categoryHref(section.code)} onClick={onNavigate}>
          {section.name}
        </Link>
      </li>
    );
  }
  const panelId = `mobile-section-${section.id}`;
  return (
    <li>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={open ? "open" : ""}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {section.name}
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open ? (
        <ul id={panelId}>
          <li>
            <Link
              className="mobile-section-all"
              href={categoryHref(section.code)}
              onClick={onNavigate}
            >
              Shop all {section.name}
            </Link>
          </li>
          {flatten(section.children).map((child) => (
            <li key={child.id}>
              <Link href={categoryHref(child.code)} onClick={onNavigate}>
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function MobileCategoryList({
  facets,
  onNavigate,
}: {
  facets: StorefrontFacets;
  onNavigate: () => void;
}) {
  return (
    <div className="mobile-sections">
      <h2 id="mobile-sections-title">Shop</h2>
      {facets.loading ? (
        <div aria-label="Loading categories" className="menu-skeleton">
          <i />
          <i />
          <i />
        </div>
      ) : facets.error ? (
        <div className="menu-error" role="alert">
          <p>Categories could not load.</p>
          <button onClick={facets.retry} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Try again
          </button>
        </div>
      ) : (
        <ul aria-labelledby="mobile-sections-title">
          {facets.sections.map((section) => (
            <MobileSection
              key={section.id}
              onNavigate={onNavigate}
              section={section}
            />
          ))}
        </ul>
      )}
      {facets.collections.length ? (
        <>
          <h2 id="mobile-collections-title">Collections</h2>
          <ul aria-labelledby="mobile-collections-title">
            {facets.collections.map((item) => (
              <li key={item.id}>
                <Link href={collectionHref(item.code)} onClick={onNavigate}>
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
