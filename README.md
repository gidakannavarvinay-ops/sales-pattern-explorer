# SalesPattern Explorer (MERN)
Sales trend dashboard. Differentiating feature: compare revenue, quantity and average order value across periods.

## Run
1. Start MongoDB locally (or use an Atlas URI).
2. `cd server && npm install && cp .env.example .env && npm run dev`
3. `cd client && npm install && npm run dev` then open http://localhost:5173
4. Click "Load sample data" or upload a CSV: `orderId,product,category,quantity,unitPrice,date`

## API
- GET/POST /api/sales, POST /api/sales/bulk, DELETE /api/sales/:id, POST /api/sales/seed
- GET /api/analytics/periods?granularity=day|week|month|year
- GET /api/analytics/compare?aFrom&aTo&bFrom&bTo
- GET /api/analytics/top-products
