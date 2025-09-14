import { useEffect, useMemo, useState } from 'react';
import { supabaseApp } from '../lib/supabaseClient';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingAppData, setLoadingAppData] = useState(false);

  // Order form (single line for minimal demo; multi-line can be added later)
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);
  const [notes, setNotes] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);

  const toast = (msg) => alert(msg);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingProducts(true);
      const { data, error } = await supabaseApp
        .from('products')
        .select('id, sku, name, unit, price, rrp, description')
        .order('name', { ascending: true });
      if (!mounted) return;
      if (error) console.error(error);
      setProducts(data || []);
      setLoadingProducts(false);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabaseApp.auth.getSession();
      if (mounted) setSession(session);
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
      .select('*, products ( id, sku, name, unit, price )')
      .order('created_at', { ascending: false });

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
    setInventory([]);
    setOrders([]);
    toast('Logged out');
  };

  const onCreateOrder = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return toast('Select a product');
    if (!qty || qty <= 0) return toast('Enter a valid quantity');

    const items = [{
      product_id: selectedProduct,
      qty: Number(qty),
      // For minimal demo we use list price without per-unit discount
    }];

    const { data, error } = await supabaseApp.rpc('create_order_atomic', {
      p_status: isDeposit ? 'deposit' : 'completed',
      p_is_deposit: isDeposit,
      p_customer_name: customerName || null,
      p_customer_email: customerEmail || null,
      p_payment_method: paymentMethod || null,
      p_payment_ref: paymentRef || null,
      p_notes: notes || null,
      p_delivery_fee_gross: Number(deliveryFee) || 0,
      p_items: items
    });

    if (error) {
      console.error(error);
      return toast(error.message || 'Failed to create order');
    }
    toast(`Order #${data.invoice_no} created`);
    setQty(1); setIsDeposit(false); setPaymentMethod(''); setPaymentRef(''); setNotes(''); setDeliveryFee(0);
    await loadAppData();
  };

  const exportCSV = (rows, filename) => {
    if (!rows || rows.length === 0) return toast('Nothing to export');
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const cell = r[h];
        const s = cell == null ? '' : String(cell);
        return `"${s.replace(/"/g, '""')}"`;
      }).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const productOptions = useMemo(() => products.map(p => ({ id: p.id, label: `${p.name} (${p.sku})` })), [products]);

  const s = {
    container: { maxWidth: 980, margin: '20px auto', padding: '0 16px', fontFamily: 'Inter, system-ui, Arial, sans-serif' },
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
          <h1 style={{ margin: 0 }}>Tiling Smart EPOS <span style={{ fontWeight: 400, color: '#777' }}>v3.0 (minimal)</span></h1>
          <div style={{ color: '#777' }}>Next.js (Pages), Supabase, Resend</div>
        </div>
        <div>
          {session ? (
            <div style={s.row}>
              <span style={{ color: '#444' }}>{session.user.email}</span>
              <button style={s.btn} onClick={async () => { await onLogout(); }}>Logout</button>
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
            <h2>Create Order (minimal)</h2>
            <form onSubmit={onCreateOrder}>
              <div style={{ ...s.row, marginBottom: 8 }}>
                <select style={{ ...s.select, minWidth: 260 }} value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                  <option value="">Select product…</option>
                  {productOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <input style={{ ...s.input, maxWidth: 120 }} type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={isDeposit} onChange={e => setIsDeposit(e.target.checked)} />
                  Deposit
                </label>
                <input style={{ ...s.input, minWidth: 220 }} placeholder="Customer name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                <input style={{ ...s.input, minWidth: 220 }} placeholder="Customer email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              </div>
              <div style={{ ...s.row, marginBottom: 8 }}>
                <input style={{ ...s.input, minWidth: 180 }} placeholder="Payment method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} />
                <input style={{ ...s.input, minWidth: 180 }} placeholder="Payment reference" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
                <input style={{ ...s.input, minWidth: 140 }} type="number" step="0.01" placeholder="Delivery fee" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} />
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
          </section>

          <section style={s.card}>
            <h2>Recent Orders</h2>
            {loadingAppData ? <div>Loading…</div> : (
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Invoice #</th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Product</th>
                  <th style={s.th}>Qty</th>
                  <th style={s.th}>Total</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Customer</th>
                  <th style={s.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td style={s.td}><a href={`/invoice/${o.id}`} target="_blank" rel="noreferrer">#{o.invoice_no}</a></td>
                      <td style={s.td}>{new Date(o.created_at).toLocaleString()}</td>
                      <td style={s.td}>{o.products?.name} <div style={{ color: '#999' }}>{o.products?.sku}</div></td>
                      <td style={s.td}>{o.qty}</td>
                      <td style={s.td}>£{Number(o.total_price ?? o.total_gross ?? 0).toFixed(2)}</td>
                      <td style={s.td}>{o.status}</td>
                      <td style={s.td}>{o.customer_name || '-'}<div style={{ color: '#999' }}>{o.customer_email || ''}</div></td>
                      <td style={s.td}>
                        <button style={s.btn} onClick={async () => {
                          if (!o.customer_email) return toast('No customer email on order');
                          const origin = typeof window !== 'undefined' ? window.location.origin : '';
                          const res = await fetch('/api/email-invoice', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              to: o.customer_email,
                              order: {
                                id: o.id, invoice_no: o.invoice_no, created_at: o.created_at,
                                status: o.status, is_deposit: o.is_deposit,
                                qty: o.qty, total_price: o.total_price ?? o.total_gross ?? 0,
                                product: { name: o.products?.name, sku: o.products?.sku, unit: o.products?.unit, price: o.products?.price },
                                customer_name: o.customer_name, payment_method: o.payment_method, payment_ref: o.payment_ref, notes: o.notes,
                              },
                              invoiceUrl: `${origin}/invoice/${o.id}`,
                            }),
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
