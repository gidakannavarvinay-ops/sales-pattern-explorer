import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Cell
} from "recharts";
import "./styles.css";

/* ── helpers ── */
const api = async (url, opts) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors || ["Request failed"]).join(", "));
  return data;
};
const fmt = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fmtShort = (n) => {
  if (n >= 1_00_000) return "₹" + (n / 1_00_000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(1) + "K";
  return "₹" + fmt(n);
};

/* ── Change Badge ── */
const Change = ({ v }) =>
  v == null ? <span className="muted">—</span> : (
    <span className={`change-badge ${v >= 0 ? "up" : "down"}`}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );

/* ── Custom Tooltip ── */
const CustomTooltip = ({ active, payload, label, metricLabel }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1c2128", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
    }}>
      <p style={{ color: "#e6edf3", fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: "#58a6ff", fontSize: "0.875rem" }}>
        {metricLabel}: <strong>{payload[0]?.value != null ? (metricLabel.includes("₹") ? "₹" + fmt(payload[0].value) : fmt(payload[0].value)) : "—"}</strong>
      </p>
    </div>
  );
};

/* ── Segment Control ── */
const SegCtrl = ({ options, value, onChange }) => (
  <div className="seg-ctrl">
    {options.map(o => (
      <button key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

const GRAN_OPTS = [
  { value: "day", label: "Day" }, { value: "week", label: "Week" },
  { value: "month", label: "Month" }, { value: "year", label: "Year" },
];
const METRIC_OPTS = [
  { value: "revenue", label: "Revenue" },
  { value: "quantity", label: "Quantity" },
  { value: "avgOrderValue", label: "Avg Order" },
];
const METRIC_LABEL = { revenue: "Revenue (₹)", quantity: "Quantity", avgOrderValue: "Avg Order Value (₹)" };
const BAR_COLORS = { revenue: "#58a6ff", quantity: "#39d353", avgOrderValue: "#a371f7" };

/* ════════════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════════════ */
export default function App() {
  const [gran, setGran] = useState("month");
  const [metric, setMetric] = useState("revenue");
  const [periods, setPeriods] = useState([]);
  const [top, setTop] = useState([]);
  const [sales, setSales] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, t, s] = await Promise.all([
        api(`/api/analytics/periods?granularity=${gran}`),
        api("/api/analytics/top-products"),
        api("/api/sales"),
      ]);
      setPeriods(p); setTop(t); setSales(s);
      setConnected(true);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [gran]);

  useEffect(() => { load(); }, [load]);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const totals = periods.reduce(
    (a, p) => ({ revenue: a.revenue + p.revenue, quantity: a.quantity + p.quantity, orders: a.orders + p.orders }),
    { revenue: 0, quantity: 0, orders: 0 }
  );

  /* ── Clear all data ── */
  const clearAll = async () => {
    if (!confirm("Delete ALL sales from the database? This cannot be undone.")) return;
    try {
      const r = await api("/api/sales", { method: "DELETE" });
      flash("ok", `Cleared ${r.deleted} records.`);
      load();
    } catch (e) { flash("error", e.message); }
  };

  return (
    <main>
      {/* ── Header ── */}
      <header>
        <div className="header-left">
          <div className="header-icon">📈</div>
          <div>
            <h1>SalesPattern Explorer</h1>
            <p className="header-subtitle">See which periods and products drive your revenue</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <div className="header-badge">
            <div className={`badge-dot ${connected ? "" : ""}` } style={{ background: connected ? "var(--up)" : "var(--down)", boxShadow: `0 0 6px ${connected ? "var(--up)" : "var(--down)"}` }} />
            {connected ? "Live · MongoDB Atlas" : "Connecting…"}
          </div>
          <button className="danger-outline" onClick={clearAll}>🗑 Clear All Data</button>
        </div>
      </header>

      {/* ── Toast ── */}
      {msg && (
        <div className={`msg ${msg.type}`} role="alert" onClick={() => setMsg(null)}>
          {msg.type === "error" ? "⚠️" : "✅"} {msg.text}
          <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: "0.75rem" }}>click to dismiss</span>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="kpis">
        <div className="kpi-card">
          <div className="kpi-icon">💰</div>
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value">{fmtShort(totals.revenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">📦</div>
          <div className="kpi-label">Units Sold</div>
          <div className="kpi-value">{fmt(totals.quantity)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">🛒</div>
          <div className="kpi-label">Avg Order Value</div>
          <div className="kpi-value">{totals.orders ? fmtShort(totals.revenue / totals.orders) : "—"}</div>
        </div>
      </div>

      {/* ── Analytics Chart + Table ── */}
      <div className="panel">
        <div className="panel-header">
          <h2>📊 Revenue Trends</h2>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <SegCtrl options={GRAN_OPTS} value={gran} onChange={setGran} />
            <SegCtrl options={METRIC_OPTS} value={metric} onChange={setMetric} />
          </div>
        </div>

        {loading ? (
          <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink3)" }}>
            Loading chart…
          </div>
        ) : periods.length === 0 ? (
          <p className="empty">📭 No sales yet. Add a sale or upload a CSV below.</p>
        ) : (
          <>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                {metric === "avgOrderValue" ? (
                  <AreaChart data={periods} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="aovGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a371f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a371f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="period" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip metricLabel={METRIC_LABEL[metric]} />} />
                    <Area type="monotone" dataKey={metric} stroke="#a371f7" strokeWidth={2.5} fill="url(#aovGrad)" dot={false} activeDot={{ r: 5, fill: "#a371f7" }} />
                  </AreaChart>
                ) : metric === "quantity" ? (
                  <AreaChart data={periods} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qtyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#39d353" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#39d353" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="period" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip metricLabel={METRIC_LABEL[metric]} />} />
                    <Area type="monotone" dataKey={metric} stroke="#39d353" strokeWidth={2.5} fill="url(#qtyGrad)" dot={false} activeDot={{ r: 5, fill: "#39d353" }} />
                  </AreaChart>
                ) : (
                  <BarChart data={periods} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip metricLabel={METRIC_LABEL[metric]} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey={metric} radius={[4, 4, 0, 0]}>
                      {periods.map((_, i) => (
                        <Cell key={i} fill={i === periods.length - 1 ? "#1f6feb" : "#58a6ff"} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Revenue</th><th>vs Prev</th>
                    <th>Qty</th><th>vs Prev</th>
                    <th>Avg Order</th><th>vs Prev</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.period}>
                      <td style={{ fontWeight: 600 }}>{p.period}</td>
                      <td style={{ color: "#58a6ff", fontWeight: 600 }}>₹{fmt(p.revenue)}</td>
                      <td><Change v={p.change?.revenue} /></td>
                      <td style={{ color: "#39d353" }}>{fmt(p.quantity)}</td>
                      <td><Change v={p.change?.quantity} /></td>
                      <td style={{ color: "#a371f7" }}>₹{fmt(p.avgOrderValue)}</td>
                      <td><Change v={p.change?.avgOrderValue} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Compare ── */}
      <Compare onError={(t) => flash("error", t)} />

      {/* ── Top Products ── */}
      <div className="panel">
        <h2>🏆 Top Products by Revenue</h2>
        {top.length === 0 ? (
          <p className="empty">No data yet.</p>
        ) : (
          <div className="products-list">
            {top.map((t, i) => {
              const pct = Math.round((t.revenue / top[0].revenue) * 100);
              return (
                <div className="product-row" key={t.product}>
                  <div className={`product-rank rank-${i < 3 ? i + 1 : "other"}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="product-name">{t.product}</div>
                    <div className="product-category">{t.quantity} units · {t.orders} orders</div>
                  </div>
                  <div className="product-bar-wrap">
                    <div className="product-bar" style={{ width: pct + "%" }} />
                  </div>
                  <div className="product-meta">
                    <div className="product-revenue">₹{fmt(t.revenue)}</div>
                    <div className="product-units">AOV ₹{fmt(t.avgOrderValue)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Upload ── */}
      <AddSale onDone={(t) => { flash("ok", t); load(); }} onError={(t) => flash("error", t)} />

      {/* ── Recent Sales ── */}
      <div className="panel">
        <div className="panel-header">
          <h2>🧾 Recent Sales <span style={{ fontSize: "0.8rem", color: "var(--ink3)", fontWeight: 400 }}>({sales.length} records)</span></h2>
          <button className="secondary" onClick={load}>↻ Refresh</button>
        </div>
        {sales.length === 0 ? <p className="empty">No records yet. Add some data above!</p> : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th><th>Product</th><th>Category</th>
                  <th>Qty</th><th>Unit Price</th><th>Revenue</th><th>Date</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 15).map((s) => (
                  <tr key={s._id}>
                    <td className="order-id">{s.orderId}</td>
                    <td style={{ fontWeight: 500 }}>{s.product}</td>
                    <td><span style={{ background: "var(--bg3)", padding: "2px 8px", borderRadius: 99, fontSize: "0.75rem", color: "var(--ink2)" }}>{s.category}</span></td>
                    <td>{s.quantity}</td>
                    <td>₹{fmt(s.unitPrice)}</td>
                    <td style={{ color: "#58a6ff", fontWeight: 600 }}>₹{fmt(s.revenue)}</td>
                    <td style={{ color: "var(--ink3)" }}>{s.date?.slice(0, 10)}</td>
                    <td>
                      <button className="link" onClick={async () => {
                        try { await api(`/api/sales/${s._id}`, { method: "DELETE" }); load(); }
                        catch (e) { flash("error", e.message); }
                      }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPARE
══════════════════════════════════════════════════════════════ */
function Compare({ onError }) {
  const [r, setR] = useState({ aFrom: "", aTo: "", bFrom: "", bTo: "" });
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setR({ ...r, [k]: e.target.value });

  const run = async (e) => {
    e.preventDefault();
    if (Object.values(r).some((v) => !v)) return onError("Pick all four dates to compare.");
    if (r.aFrom > r.aTo || r.bFrom > r.bTo) return onError("Each range must start before it ends.");
    try {
      setLoading(true);
      setRes(await api("/api/analytics/compare?" + new URLSearchParams(r)));
    } catch (err) { onError(err.message); }
    finally { setLoading(false); }
  };

  const metrics = [
    { key: "revenue", label: "Revenue", fmt: (v) => "₹" + fmt(v) },
    { key: "quantity", label: "Quantity", fmt: (v) => fmt(v) },
    { key: "avgOrderValue", label: "Avg Order Value", fmt: (v) => "₹" + fmt(v) },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>⚡ Compare Two Periods</h2>
      </div>
      <form onSubmit={run}>
        <div className="grid" style={{ marginBottom: "0.75rem" }}>
          <label>Period A — From<input type="date" value={r.aFrom} onChange={set("aFrom")} /></label>
          <label>Period A — To<input type="date" value={r.aTo} onChange={set("aTo")} /></label>
          <label>Period B — From<input type="date" value={r.bFrom} onChange={set("bFrom")} /></label>
          <label>Period B — To<input type="date" value={r.bTo} onChange={set("bTo")} /></label>
          <label style={{ justifyContent: "flex-end" }}>
            <button type="submit" disabled={loading} style={{ width: "100%" }}>
              {loading ? "⏳ Comparing…" : "⚡ Compare"}
            </button>
          </label>
        </div>
      </form>

      {res && (
        <div className="compare-grid">
          {metrics.map(({ key, label, fmt: f }) => (
            <div className="compare-card" key={key}>
              <div className="compare-metric">{label}</div>
              <div className="compare-vals">
                <span className="compare-a" style={{ color: "#58a6ff" }}>{f(res.a[key])}</span>
                <span className="compare-sep">→</span>
                <span className="compare-b" style={{ color: "#a371f7" }}>{f(res.b[key])}</span>
              </div>
              <Change v={res.change[key]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ADD SALE
══════════════════════════════════════════════════════════════ */
function AddSale({ onDone, onError }) {
  const blank = { orderId: "", product: "", category: "", quantity: 1, unitPrice: "", date: "" };
  const [f, setF] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.orderId || !f.product || !f.date || f.unitPrice === "") return onError("Fill Order ID, Product, Unit Price and Date.");
    try {
      setSubmitting(true);
      await api("/api/sales", { method: "POST", body: JSON.stringify(f) });
      setF(blank);
      onDone("✅ Sale added successfully!");
    } catch (err) { onError(err.message); }
    finally { setSubmitting(false); }
  };

  const upload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const [head, ...lines] = (await file.text()).trim().split(/\r?\n/);
    const keys = head.split(",").map((h) => h.trim());
    const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v.trim()])));
    try {
      const r = await api("/api/sales/bulk", { method: "POST", body: JSON.stringify({ rows }) });
      onDone(`📥 Imported ${r.inserted} rows${r.skipped ? `, skipped ${r.skipped}` : ""}.`);
    } catch (err) { onError(err.message); }
    e.target.value = "";
  };

  return (
    <div className="form-section">
      <div className="panel">
        <div className="panel-header">
          <h2>➕ Add Sales Data</h2>
        </div>
        <form className="grid" onSubmit={submit}>
          <label>Order ID<input value={f.orderId} onChange={set("orderId")} placeholder="ORD-001" /></label>
          <label>Product<input value={f.product} onChange={set("product")} placeholder="e.g. Notebook" /></label>
          <label>Category<input value={f.category} onChange={set("category")} placeholder="e.g. Stationery" /></label>
          <label>Quantity<input type="number" min="1" value={f.quantity} onChange={set("quantity")} /></label>
          <label>Unit Price (₹)<input type="number" min="0" step="0.01" value={f.unitPrice} onChange={set("unitPrice")} placeholder="0.00" /></label>
          <label>Date<input type="date" value={f.date} onChange={set("date")} /></label>
          <label style={{ justifyContent: "flex-end" }}>
            <button type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "⏳ Adding…" : "➕ Add Sale"}
            </button>
          </label>
        </form>

        <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--bg3)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--ink2)", marginBottom: "0.75rem", fontWeight: 500 }}>
            📄 Bulk Import via CSV — Header must be: <code style={{ background: "var(--bg2)", padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem" }}>orderId,product,category,quantity,unitPrice,date</code>
          </p>
          <label className="file-label">
            📂 Choose CSV File
            <input type="file" accept=".csv" onChange={upload} />
          </label>
        </div>
      </div>
    </div>
  );
}
