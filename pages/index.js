import { useEffect, useMemo, useState } from 'react';
import { supabaseApp } from '../lib/supabaseClient';

/** Simple CSV parser (handles commas inside quotes) */
function parseCSV(text) {
  const rows = [];
  let i = 0, cur = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; }
        // consume \r\n
        if (ch === '\r' && text[i+1] === '\n') i++;
      } else {
        cur += ch;
      }
    }
    i++;
  }
  if (cur !== '' || row.length) row.push(cur);
  if (row.length) rows.push(row);
  return rows;
}

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingAppData, setLoadingAppData] = useState(false);

  // Multi-line order items
  const [items, setItems] = useState([]); // {product_id, qty, unit_price_override_gross?, line_discount_per_unit_gross?}
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);
  const [notes, setNotes] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);

  const [csvMode, setCsvMode] = useState('set'); // set or add for inventory import
  const toast = (msg) => alert(msg);

  // Load public products
  useEffect(() => {
    (async () => {
      setLoadingProducts(true);
      const { data, error } = await supabaseApp
        .from('products')
        .select('id, sku, name, unit, price, rrp, description')
        .order('name', { ascending: true });
      if (error) console.error(error);
      setProducts(data || []);
      setLoadingProducts(false);
    })();
  }, []);

  // Auth
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabaseApp.auth.getSession();
      setSession(session);
    })();
    const { data: sub } = supabaseApp.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription?.unsubscribe?.();
  }, []);

  const loadAppData = async () => {
    if (!session) return;
    setLoadingAppData(true);
    const inv = await supabaseApp
      .from('inventory')
      .select('id, qty, product_id, products ( id, sku, name, unit, price )')
      .order('product_id', { ascending: true });
    const ord = await supabaseApp
      .from('orders')
      .select('id, created_at, invoice_no, status, is_deposit, total_gross, customer_name, customer_email')
      .order('created_at', { ascending: false })
      .limit(50);

    if (inv.error) console.error(inv.error);
    if (ord.error) console.error(ord.error);

    setInventory(inv.data || []);
    setOrders(ord.data || []);
    setLoadingAppData(false);
  };
  useEffect(() => { if (session) loadAppData(); }, [session]);

  const onLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabaseApp.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) return toast(error.message);
    toast('Logged in');
    await loadAppData();
  };
  const onLogout = async () => {
    await supabaseApp.auth.signOut();
    setInventory([]); setOrders([]);
    toast('Logged out');
  };

  // Item helpers
  const addEmptyItem = () => setItems([...items, { id: crypto.randomUUID(), product_id: '', qty: 1, unit_price_override_gross: '', line_discount_per_unit_gross: '' }]);
  const removeItem = (id) => setItems(items.filter(it => it.id !== id));
  const updateItem = (id, patch) => setItems(items.map(it => it.id === id ? { ...it, ...patch } : it));

  const subtotalEstimate = useMemo(() => {
    let gross = 0;
    items.forEach(it => {
      const prod = products.find(p => p.id === it.product_id);
      const unit = Number(it.unit_price_override_gross || (prod?.price ?? 0));
      const disc = Number(it.line_discount_per_unit_gross || 0);
      const q = Number(it.qty || 0);
      const line = Math.max(0, (unit - disc)) * q;
      gross += line;
    });
    const discounted = Math.max(0, gross - Number(invoiceDiscount || 0));
    return (discounted + Number(deliveryFee || 0));
  }, [items, products, deliveryFee, invoiceDiscount]);

  const onCreateOrder = async (e) => {
    e.preventDefault();
    const payloadItems = items
      .filter(it => it.product_id && Number(it.qty) > 0)
      .map(it => ({
        product_id: it.product_id,
        qty: Number(it.qty),
        ...(it.unit_price_override_gross ? { unit_price_override_gross: Number(it.unit_price_override_gross) } : {}),
        ...(it.line_discount_per_unit_gross ? { line_discount_per_unit_gross: Number(it.line_discount_per_unit_gross) } : {}),
      }));
    if (payloadItems.length === 0) return toast('Add at least one line item');

    const { data, error } = await supabaseApp.rpc('create_order_atomic', {
      p_status: isDeposit ? 'deposit' : 'completed',
      p_is_deposit: isDeposit,
      p_customer_name: customerName || null,
      p_customer_email: customerEmail || null,
      p_payment_method: paymentMethod || null,
      p_payment_ref: paymentRef || null,
      p_notes: notes || null,
      p_delivery_fee_gross: Number(deliveryFee) || 0,
      p_discount_invoice_gross: Number(invoiceDiscount) || 0,
      p_items: payloadItems
    });
    if (error) { console.error(error); return toast(error.message || 'Failed to create order'); }
    toast(`Order #${data.invoice_no} created`);
    // reset
    setItems([]); setCustomerName(''); setCustomerEmail(''); setPaymentMethod(''); setPaymentRef(''); setNotes(''); setDeliveryFee(0); setInvoiceDiscount(0); setIsDeposit(false);
    await loadAppData();
  };

  // CSV imports
  const importProductsCSV = async (file) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return toast('Empty CSV');
    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const req = ['name','unit','price','type']; // sku optional
    for (const r of req) if (idx(r) === -1) return toast(`Missing column: ${r}`);

    let ok = 0, fail = 0;
    for (let i=1;i<rows.length;i++) {
      const row = rows[i]; if (!row || row.length===0) continue;
      const body = {
        p_sku: row[idx('sku')] || null,
        p_type: row[idx('type')] || 'other',
        p_name: row[idx('name')] || '',
        p_size: (idx('size')>-1 ? row[idx('size')] : null),
        p_unit: row[idx('unit')] || 'unit',
        p_description: (idx('description')>-1 ? row[idx('description')] : null),
        p_rrp: (idx('rrp')>-1 && row[idx('rrp')] ? Number(row[idx('rrp')]) : null),
        p_price: Number(row[idx('price')] || 0),
        p_vat_rate: (idx('vat_rate')>-1 && row[idx('vat_rate')] ? Number(row[idx('vat_rate')]) : 0.20),
        p_min_stock_qty: (idx('min_stock_qty')>-1 && row[idx('min_stock_qty')] ? Number(row[idx('min_stock_qty')]) : 0),
      };
      const { error } = await supabaseApp.rpc('upsert_product', body);
      if (error) { console.error(error); fail++; } else ok++;
    }
    toast(`Products import: ${ok} ok, ${fail} failed`);
    // reload
    const { data } = await supabaseApp.from('products').select('*').order('name',{ascending:true});
    setProducts(data||[]);
    await loadAppData();
  };

  const importInventoryCSV = async (file) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return toast('Empty CSV');
    const header = rows[0].map(h => h.trim().toLowerCase());
    const idxSku = header.indexOf('sku');
    const idxQty = header.indexOf('qty');
    if (idxSku === -1 || idxQty === -1) return toast('CSV must have sku,qty');
    let ok = 0, fail = 0;
    for (let i=1;i<rows.length;i++) {
      const row = rows[i]; if (!row || row.length===0) continue;
      const sku = row[idxSku]; const qty = Number(row[idxQty] || 0);
      const { error } = await supabaseApp.rpc('adjust_inventory', { p_sku: sku, p_qty: qty, p_mode: csvMode });
      if (error) { console.error(error); fail++; } else ok++;
    }
    toast(`Inventory ${csvMode}: ${ok} ok, ${fail} failed`);
    await loadAppData();
  };

  const productOptions = useMemo(() => products.map(p => ({ id: p.id, label: `${p.name} (${p.sku})`, price: p.price })), [products]);

  const s = {
    container: { maxWidth: 1000, margin: '20px auto', padding: '0 16px', fontFamily: 'Inter, system-ui, Arial, sans-serif' },
    card: { border: '1px solid #eaeaea', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' },
    td: { borderBottom: '1px solid #f5f5f5', padding: '8px', verticalAlign: 'top' },
    btn: { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', background: '#fff' },
    btnPrimary: { padding: '8px 12px', borderRadius: 8, border: '1px solid #0070f3', cursor: 'pointer', background: '#0070f3', color: '#fff' },
    input: { padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' },
    select: { padding: 8, borderRadius: 8, border: '1px solid #ddd' },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    pill: (bg) => ({ padding: '2px 8px', borderRadius: 8, display: 'inline-block', background: bg, color: '#fff', fontSize: 12 }),
  };

  return (
    <div style={s.container}>
      <header style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Tiling Smart EPOS <span style={{ fontWeight: 400, color: '#777' }}>v3.0</span></h1>
          <div style={{ color: '#777' }}>Next.js (Pages), Supabase, Resend</div>
        </div>
        <div>
          {session ? (
            <div style={s.row}>
              <span style={{ color: '#444' }}>{session.user.email}</span>
              <button style={s.btn} onClick={onLogout}>Logout</button>
            </div>
          ) : (
            <form onSubmit={onLogin} style={s.row}>
              <input style={s.input} placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              <input style={s.input} type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
              <button style={s.btnPrimary} type="submit">Login</button>
            </form>
          )}
        </div>
      </header>

      <section style={s.card}>
        <h2>Products (public)</h2>
        {loadingProducts ? <div>Loading…</div> : (
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>SKU</th><th style={s.th}>Name</th><th style={s.th}>Unit</th><th style={s.th}>Price</th><th style={s.th}>RRP</th><th style={s.th}>Description</th>
            </tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td style={s.td}>{p.sku}</td>
                  <td style={s.td}>{p.name}</td>
                  <td style={s.td}>{p.unit}</td>
                  <td style={s.td}>£{Number(p.price).toFixed(2)}</td>
                  <td style={s.td}>{p.rrp != null ? `£${Number(p.rrp).toFixed(2)}` : '-'}</td>
                  <td style={s.td}>{p.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {session && (
        <>
          <section style={s.card}>
            <h2>Create Order (multi-line)</h2>
            <div style={{ marginBottom: 8 }}>
              <button style={s.btn} onClick={addEmptyItem}>+ Add item</button>
            </div>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Product</th>
                <th style={s.th}>Qty</th>
                <th style={s.th}>Unit Price (override)</th>
                <th style={s.th}>Discount / unit</th>
                <th style={s.th}>Actions</th>
              </tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td style={s.td}>
                      <select style={{ ...s.select, minWidth: 260 }} value={it.product_id} onChange={e => updateItem(it.id, { product_id: e.target.value })}>
                        <option value="">Select…</option>
                        {productOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </td>
                    <td style={s.td}><input style={{ ...s.input, maxWidth: 120 }} type="number" min="0.001" step="0.001" value={it.qty} onChange={e => updateItem(it.id, { qty: e.target.value })} /></td>
                    <td style={s.td}><input style={{ ...s.input, maxWidth: 160 }} type="number" step="0.01" placeholder="(optional)" value={it.unit_price_override_gross} onChange={e => updateItem(it.id, { unit_price_override_gross: e.target.value })} /></td>
                    <td style={s.td}><input style={{ ...s.input, maxWidth: 160 }} type="number" step="0.01" placeholder="(optional)" value={it.line_discount_per_unit_gross} onChange={e => updateItem(it.id, { line_discount_per_unit_gross: e.target.value })} /></td>
                    <td style={s.td}><button style={s.btn} onClick={() => removeItem(it.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={onCreateOrder} style={{ marginTop: 12 }}>
              <div style={{ ...s.row, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={isDeposit} onChange={e => setIsDeposit(e.target.checked)} />
                  Deposit
                </label>
                <input style={{ ...s.input, minWidth: 220 }} placeholder="Customer name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                <input style={{ ...s.input, minWidth: 220 }} placeholder="Customer email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
                <input style={{ ...s.input, minWidth: 180 }} placeholder="Payment method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} />
                <input style={{ ...s.input, minWidth: 180 }} placeholder="Payment reference" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
              </div>
              <div style={{ ...s.row, marginBottom: 8 }}>
                <input style={{ ...s.input, minWidth: 140 }} type="number" step="0.01" placeholder="Delivery fee" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} />
                <input style={{ ...s.input, minWidth: 140 }} type="number" step="0.01" placeholder="Invoice discount" value={invoiceDiscount} onChange={e => setInvoiceDiscount(e.target.value)} />
                <div style={{ color: '#777' }}>Estimated total: <strong>£{Number(subtotalEstimate).toFixed(2)}</strong></div>
              </div>
              <textarea style={{ ...s.input, height: 80 }} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
              <div style={{ marginTop: 8 }}>
                <button style={s.btnPrimary} type="submit">Create Order</button>
              </div>
            </form>
          </section>

          <section style={s.card}>
            <h2>Inventory</h2>
            {loadingAppData ? <div>Loading…</div> : (
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>SKU</th><th style={s.th}>Name</th><th style={s.th}>Unit</th><th style={s.th}>Price</th><th style={s.th}>Qty</th>
                </tr></thead>
                <tbody>
                  {inventory.map(row => (
                    <tr key={row.id}>
                      <td style={s.td}>{row.products?.sku}</td>
                      <td style={s.td}>{row.products?.name}</td>
                      <td style={s.td}>{row.products?.unit}</td>
                      <td style={s.td}>£{Number(row.products?.price ?? 0).toFixed(2)}</td>
                      <td style={s.td}>{row.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Import Products CSV</div>
                <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && importProductsCSV(e.target.files[0])} />
                <div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>Columns: sku,type,name,size,unit,description,rrp,price,vat_rate,min_stock_qty</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Import Inventory CSV</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && importInventoryCSV(e.target.files[0])} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="mode" checked={csvMode==='set'} onChange={() => setCsvMode('set')} /> set
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="mode" checked={csvMode==='add'} onChange={() => setCsvMode('add')} /> add
                  </label>
                </div>
                <div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>Columns: sku,qty</div>
              </div>
            </div>
          </section>

          <section style={s.card}>
            <h2>Recent Orders</h2>
            {loadingAppData ? <div>Loading…</div> : (
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Invoice #</th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Total (gross)</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Customer</th>
                  <th style={s.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td style={s.td}><a href={`/invoice/${o.id}`} target="_blank" rel="noreferrer">#{o.invoice_no}</a></td>
                      <td style={s.td}>{new Date(o.created_at).toLocaleString()}</td>
                      <td style={s.td}>£{Number(o.total_gross ?? 0).toFixed(2)}</td>
                      <td style={s.td}>{o.status}{o.is_deposit ? ' (Deposit)' : ''}</td>
                      <td style={s.td}>{o.customer_name || '-'}<div style={{ color: '#999' }}>{o.customer_email || ''}</div></td>
                      <td style={s.td}>
                        <button style={s.btn} onClick={async () => {
                          if (!o.customer_email) return toast('No customer email on order');
                          const origin = typeof window !== 'undefined' ? window.location.origin : '';
                          const { data: items, error } = await supabaseApp
                            .from('order_items')
                            .select('qty, line_gross, vat_rate, products ( sku, name, unit, price )')
                            .eq('order_id', o.id);
                          if (error) return toast('Failed to load order items');
                          const res = await fetch('/api/email-invoice', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ to: o.customer_email, order: { ...o, items }, invoiceUrl: `${origin}/invoice/${o.id}` }),
                          });
                          const json = await res.json();
                          if (!res.ok) return toast(json?.error || 'Email send failed');
                          toast('Invoice email sent (Resend sandbox: send to your account email).');
                        }}>Email invoice</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
