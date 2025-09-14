# Tiling Smart v3 — multi-line + CSV import

This build adds:
- Multi-line order creation (calls `app.create_order_atomic`),
- CSV import for **products** (calls `app.upsert_product`),
- CSV import for **inventory** (calls `app.adjust_inventory` with set/add modes),
- Printable multi-line invoice page,
- Email invoice (Resend sandbox).

CSV columns:
- Products: sku,type,name,size,unit,description,rrp,price,vat_rate,min_stock_qty
- Inventory: sku,qty

Note: Requires the SQL from earlier with the three RPCs: `create_order_atomic`, `upsert_product`, `adjust_inventory`.
