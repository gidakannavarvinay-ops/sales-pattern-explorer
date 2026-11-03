const dns = require("dns");
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // ignore if unable to set custom DNS servers
}
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ---------- Model ----------
const saleSchema = new mongoose.Schema({
  orderId: { type: String, required: true, trim: true },
  product: { type: String, required: true, trim: true },
  category: { type: String, default: "General", trim: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
}, { timestamps: true });
saleSchema.virtual("revenue").get(function () { return this.quantity * this.unitPrice; });
saleSchema.set("toJSON", { virtuals: true });
const Sale = mongoose.model("Sale", saleSchema);

// ---------- Validation ----------
function validateSale(b) {
  const errors = [];
  if (!b.orderId || !String(b.orderId).trim()) errors.push("orderId is required");
  if (!b.product || !String(b.product).trim()) errors.push("product is required");
  if (!Number.isInteger(Number(b.quantity)) || Number(b.quantity) < 1) errors.push("quantity must be a whole number >= 1");
  if (b.unitPrice === "" || b.unitPrice == null || isNaN(Number(b.unitPrice)) || Number(b.unitPrice) < 0) errors.push("unitPrice must be a number >= 0");
  if (!b.date || isNaN(new Date(b.date).getTime())) errors.push("date must be a valid date");
  return errors;
}
const clean = (b) => ({
  orderId: String(b.orderId).trim(), product: String(b.product).trim(),
  category: (b.category || "General").toString().trim(), quantity: Number(b.quantity),
  unitPrice: Number(b.unitPrice), date: new Date(b.date)
});

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---------- Root / Health Check ----------
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "SalesPattern Explorer REST API is running",
    dashboard: "https://sales-pattern-explorer.vercel.app",
    endpoints: [
      "GET  /api/sales",
      "POST /api/sales",
      "POST /api/sales/bulk",
      "GET  /api/analytics/periods",
      "GET  /api/analytics/compare",
      "GET  /api/analytics/top-products"
    ]
  });
});

// ---------- CRUD ----------
app.get("/api/sales", wrap(async (req, res) => {
  res.json(await Sale.find().sort({ date: -1 }).limit(200));
}));

app.post("/api/sales", wrap(async (req, res) => {
  require("dotenv").config();
  const errors = validateSale(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.status(201).json(await Sale.create(clean(req.body)));
}));

app.post("/api/sales/bulk", wrap(async (req, res) => {
  if (!Array.isArray(req.body.rows) || !req.body.rows.length)
    return res.status(400).json({ errors: ["rows must be a non-empty array"] });
  const good = [], bad = [];
  req.body.rows.forEach((r, i) => {
    const e = validateSale(r);
    e.length ? bad.push({ row: i + 1, errors: e }) : good.push(clean(r));
  });
  if (good.length) await Sale.insertMany(good);
  res.status(201).json({ inserted: good.length, skipped: bad.length, problems: bad.slice(0, 10) });
}));

app.delete("/api/sales", wrap(async (req, res) => {
  const r = await Sale.deleteMany({});
  res.json({ cleared: true, deleted: r.deletedCount });
}));

app.delete("/api/sales/:id", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ errors: ["invalid id"] });
  const del = await Sale.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ errors: ["sale not found"] });
  res.json({ deleted: true });
}));

app.post("/api/sales/seed", wrap(async (req, res) => {
  const products = [["Notebook", "Stationery", 60], ["Pen Pack", "Stationery", 120], ["Backpack", "Bags", 900],
  ["Water Bottle", "Lifestyle", 350], ["Headphones", "Electronics", 1500], ["USB Drive", "Electronics", 450]];
  const rows = [];
  for (let i = 0; i < 400; i++) {
    const [product, category, price] = products[Math.floor(Math.random() * products.length)];
    const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 365));
    rows.push({
      orderId: "SEED-" + (1000 + i), product, category,
      quantity: 1 + Math.floor(Math.random() * 5), unitPrice: price, date: d
    });
  }
  await Sale.insertMany(rows);
  res.status(201).json({ inserted: rows.length });
}));

// ---------- Analytics ----------
const FORMATS = { day: "%Y-%m-%d", week: "%G-W%V", month: "%Y-%m", year: "%Y" };

function matchStage(q) {
  const m = {};
  if (q.from || q.to) {
    m.date = {};
    if (q.from) m.date.$gte = new Date(q.from);
    if (q.to) m.date.$lte = new Date(new Date(q.to).setHours(23, 59, 59, 999));
  }
  return m;
}
const groupFields = {
  revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
  quantity: { $sum: "$quantity" },
  orders: { $sum: 1 },
};
const withAov = (r) => ({ ...r, avgOrderValue: r.orders ? +(r.revenue / r.orders).toFixed(2) : 0 });
const pct = (cur, prev) => (prev ? +(((cur - prev) / prev) * 100).toFixed(1) : null);

// Revenue, quantity and average order value per period, with % change vs previous period
app.get("/api/analytics/periods", wrap(async (req, res) => {
  const g = req.query.granularity || "month";
  if (!FORMATS[g]) return res.status(400).json({ errors: ["granularity must be day, week, month or year"] });
  const rows = await Sale.aggregate([
    { $match: matchStage(req.query) },
    { $group: { _id: { $dateToString: { format: FORMATS[g], date: "$date" } }, ...groupFields } },
    { $sort: { _id: 1 } },
  ]);
  const out = rows.map((r) => withAov({ period: r._id, revenue: r.revenue, quantity: r.quantity, orders: r.orders }));
  out.forEach((r, i) => {
    const p = out[i - 1];
    r.change = p ? {
      revenue: pct(r.revenue, p.revenue), quantity: pct(r.quantity, p.quantity),
      avgOrderValue: pct(r.avgOrderValue, p.avgOrderValue)
    } : null;
  });
  res.json(out);
}));

// Compare two custom date ranges
app.get("/api/analytics/compare", wrap(async (req, res) => {
  const { aFrom, aTo, bFrom, bTo } = req.query;
  if (![aFrom, aTo, bFrom, bTo].every((d) => d && !isNaN(new Date(d))))
    return res.status(400).json({ errors: ["aFrom, aTo, bFrom, bTo must be valid dates"] });
  const total = async (from, to) => {
    const [r] = await Sale.aggregate([{ $match: matchStage({ from, to }) }, { $group: { _id: null, ...groupFields } }]);
    return withAov(r ? { revenue: r.revenue, quantity: r.quantity, orders: r.orders } : { revenue: 0, quantity: 0, orders: 0 });
  };
  const a = await total(aFrom, aTo), b = await total(bFrom, bTo);
  res.json({
    a, b, change: {
      revenue: pct(b.revenue, a.revenue), quantity: pct(b.quantity, a.quantity),
      avgOrderValue: pct(b.avgOrderValue, a.avgOrderValue)
    }
  });
}));

app.get("/api/analytics/top-products", wrap(async (req, res) => {
  const rows = await Sale.aggregate([
    { $match: matchStage(req.query) },
    { $group: { _id: "$product", ...groupFields } },
    { $sort: { revenue: -1 } }, { $limit: 5 },
  ]);
  res.json(rows.map((r) => withAov({ product: r._id, revenue: r.revenue, quantity: r.quantity, orders: r.orders })));
}));

// ---------- Errors ----------
app.use((req, res) => res.status(404).json({ errors: ["route not found"] }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === "ValidationError") return res.status(400).json({ errors: Object.values(err.errors).map((e) => e.message) });
  res.status(500).json({ errors: ["internal server error"] });
});

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sales_pattern_explorer")
  .then(() => app.listen(process.env.PORT || 5000, () => console.log("API running on port", process.env.PORT || 5000)))
  .catch((e) => { console.error("MongoDB connection failed:", e.message); process.exit(1); });
