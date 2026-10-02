import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  Clock3,
  CreditCard,
  PackageCheck,
  ShoppingBag,
  Store,
  TentTree,
} from "lucide-react";
import Link from "next/link";
import styles from "./dashboard.module.css";

export type DashboardMetric = {
  label: string;
  value: string;
  meta: string;
  tone?: "default" | "attention";
};

export type DashboardAttentionItem = {
  count: string;
  detail: string;
  href: string;
  kind: "orders" | "inventory" | "session" | "payment";
  label: string;
};

export type DashboardChannel = {
  amount: string;
  change: string;
  kind: "store" | "online" | "booth";
  label: string;
};

export type DashboardOrder = {
  channel: string;
  customer: string;
  href: string;
  id: string;
  status: string;
  time: string;
  total: string;
};

export type DashboardProduct = {
  label: string;
  meta: string;
  revenue: string;
  sold: string;
};

export type DashboardInventorySlice = {
  count: string;
  label: string;
  tone: "healthy" | "warning" | "danger" | "muted";
};

/**
 * chart, channels, products and revenueTotal are financial figures: they are
 * absent for roles that may not see sales money, and those panels are hidden.
 */
export type DashboardModel = {
  attention: DashboardAttentionItem[];
  chart?: {
    labels: string[];
    values: number[];
  };
  channels?: DashboardChannel[];
  dateLabel: string;
  greetingName: string;
  inventory: {
    note: string;
    slices: DashboardInventorySlice[];
    total: string;
  };
  metrics: DashboardMetric[];
  orders: DashboardOrder[];
  products?: DashboardProduct[];
  revenueTotal?: string;
};

const attentionIcons = {
  inventory: AlertTriangle,
  orders: ShoppingBag,
  payment: CreditCard,
  session: Clock3,
} as const;

const channelIcons = {
  booth: TentTree,
  online: ShoppingBag,
  store: Store,
} as const;

export function AdminDashboard({ model }: { model: DashboardModel }) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Operations overview</p>
          <h1>Good morning, {model.greetingName}.</h1>
          <p className={styles.heroCopy}>
            Here&apos;s what needs your attention across the business today.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span>{model.dateLabel}</span>
          <span className={styles.heroDot} aria-hidden="true" />
          <span>Live operational view</span>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Today at a glance">
        {model.metrics.map((metric, index) => (
          <article
            className={`${styles.metricCard} ${metric.tone === "attention" ? styles.metricAttention : ""}`}
            key={metric.label}
          >
            <div className={styles.metricTopline}>
              <span>{metric.label}</span>
              <span className={styles.metricIcon} aria-hidden="true">
                {index === 0 ? (
                  <CircleDollarSign size={18} strokeWidth={1.8} />
                ) : index === 1 ? (
                  <ShoppingBag size={18} strokeWidth={1.8} />
                ) : index === 2 ? (
                  <PackageCheck size={18} strokeWidth={1.8} />
                ) : index === 3 ? (
                  <ArrowUpRight size={18} strokeWidth={1.8} />
                ) : index === 4 ? (
                  <Clock3 size={18} strokeWidth={1.8} />
                ) : (
                  <AlertTriangle size={18} strokeWidth={1.8} />
                )}
              </span>
            </div>
            <strong>{metric.value}</strong>
            <span className={styles.metricMeta}>{metric.meta}</span>
          </article>
        ))}
      </section>

      <section className={styles.primaryGrid}>
        {model.chart ? (
          <article className={`${styles.panel} ${styles.salesPanel}`}>
            <PanelHeader title="Sales overview" action="Last 7 days" />
            <SalesChart
              labels={model.chart.labels}
              values={model.chart.values}
            />
            <div className={styles.panelFootnote}>All sales channels</div>
          </article>
        ) : null}

        <article className={`${styles.panel} ${styles.attentionPanel}`}>
          <PanelHeader
            title="Needs your attention"
            href="/sales/orders"
            action="View all"
          />
          <div className={styles.attentionList}>
            {model.attention.map((item) => {
              const Icon = attentionIcons[item.kind];
              return (
                <Link
                  className={styles.attentionRow}
                  href={item.href}
                  key={item.label}
                >
                  <span
                    className={`${styles.attentionIcon} ${styles[`attention_${item.kind}`]}`}
                  >
                    <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  </span>
                  <strong>{item.count}</strong>
                  <span className={styles.attentionCopy}>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    size={15}
                    strokeWidth={1.8}
                  />
                </Link>
              );
            })}
          </div>
        </article>

        {model.channels ? (
          <article className={`${styles.panel} ${styles.channelPanel}`}>
            <PanelHeader title="Channel performance" action="Last 7 days" />
            <div className={styles.channelList}>
              {model.channels.map((channel) => {
                const Icon = channelIcons[channel.kind];
                return (
                  <div className={styles.channelRow} key={channel.label}>
                    <span
                      className={`${styles.channelIcon} ${styles[`channel_${channel.kind}`]}`}
                    >
                      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                    </span>
                    <span className={styles.channelName}>{channel.label}</span>
                    <strong>{channel.amount}</strong>
                    <span className={styles.positive}>{channel.change}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.channelSummary}>
              <div className={styles.donut} aria-hidden="true" />
              <div>
                <span>Total revenue</span>
                <strong>{model.revenueTotal}</strong>
                <small>Last 7 days, all sales channels</small>
              </div>
            </div>
          </article>
        ) : null}
      </section>

      <section className={styles.secondaryGrid}>
        <article className={`${styles.panel} ${styles.ordersPanel}`}>
          <PanelHeader
            title="Recent orders"
            href="/sales/orders"
            action="View all orders"
          />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Channel</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {model.orders.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No orders yet.</td>
                  </tr>
                ) : null}
                {model.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className={styles.orderLink} href={order.href}>
                        {order.id}
                      </Link>
                    </td>
                    <td>{order.customer}</td>
                    <td>
                      <span className={styles.channelPill}>
                        {order.channel}
                      </span>
                    </td>
                    <td>{order.total}</td>
                    <td>
                      <span
                        className={`${styles.statusPill} ${styles[`status_${order.status.toLowerCase()}`]}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>{order.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {model.products ? (
          <article className={`${styles.panel} ${styles.productsPanel}`}>
            <PanelHeader
              title="Top selling products"
              href="/catalog"
              action="View all"
            />
            <div className={styles.productList}>
              {model.products.length === 0 ? (
                <p className={styles.panelFootnote}>
                  No sales in the last 7 days.
                </p>
              ) : null}
              {model.products.map((product, index) => (
                <div className={styles.productRow} key={product.label}>
                  <span className={styles.productThumb} aria-hidden="true">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <span className={styles.productCopy}>
                    <strong>{product.label}</strong>
                    <small>{product.meta}</small>
                  </span>
                  <span className={styles.productSold}>{product.sold}</span>
                  <strong>{product.revenue}</strong>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <article className={`${styles.panel} ${styles.inventoryPanel}`}>
          <PanelHeader
            title="Inventory snapshot"
            href="/inventory"
            action="View inventory"
          />
          <div className={styles.inventoryBody}>
            <div className={styles.inventoryDonut} aria-hidden="true">
              <span>
                <small>Total variants</small>
                <strong>{model.inventory.total}</strong>
              </span>
            </div>
            <div className={styles.inventoryLegend}>
              {model.inventory.slices.map((slice) => (
                <div className={styles.legendRow} key={slice.label}>
                  <span
                    className={`${styles.legendDot} ${styles[`legend_${slice.tone}`]}`}
                  />
                  <span>{slice.label}</span>
                  <strong>{slice.count}</strong>
                </div>
              ))}
            </div>
          </div>
          <Link className={styles.inventoryNote} href="/inventory">
            <Boxes aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>{model.inventory.note}</span>
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} />
          </Link>
        </article>
      </section>

      <section
        className={styles.brandStatement}
        aria-label="SENVO operating principle"
      >
        <div>
          <span className={styles.quoteMark} aria-hidden="true">
            “
          </span>
          <div>
            <strong>Great businesses are built on great systems.</strong>
            <p>Stay focused. Your store. Your team. Your customers.</p>
          </div>
        </div>
        <span className={styles.brandRule}>SENVO Wear · Operations</span>
      </section>
    </div>
  );
}

function PanelHeader({
  action,
  href,
  title,
}: {
  action: string;
  href?: string;
  title: string;
}) {
  return (
    <header className={styles.panelHeader}>
      <h2>{title}</h2>
      {href ? <Link href={href}>{action}</Link> : <span>{action}</span>}
    </header>
  );
}

function SalesChart({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const width = 560;
  const height = 220;
  const padX = 24;
  const padY = 26;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const step = (width - padX * 2) / Math.max(values.length - 1, 1);
  const coordinates = values.map((value, index) => {
    const x = padX + index * step;
    const y = height - padY - ((value - min) / span) * (height - padY * 2);
    return { x, y };
  });
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div className={styles.chartWrap}>
      <svg
        aria-label="Seven day sales trend"
        className={styles.chart}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="senvo-sales-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7a101e" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7a101e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.18, 0.42, 0.66, 0.9].map((position) => (
          <line
            className={styles.chartGrid}
            key={position}
            x1={padX}
            x2={width - padX}
            y1={height * position}
            y2={height * position}
          />
        ))}
        <polygon
          fill="url(#senvo-sales-fill)"
          points={`${padX},${height - padY} ${points} ${width - padX},${height - padY}`}
        />
        <polyline className={styles.chartLine} fill="none" points={points} />
        {coordinates.map(({ x, y }, index) => (
          <circle
            className={styles.chartPoint}
            cx={x}
            cy={y}
            key={`${x}-${y}-${index}`}
            r="4"
          />
        ))}
      </svg>
      <div className={styles.chartLabels}>
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
