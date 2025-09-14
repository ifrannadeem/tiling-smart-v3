import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseApp } from '../../lib/supabaseClient';

export default function InvoicePage() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const o = await supabaseApp.from('orders').select('*').eq('id', id).single();
      const it = await supabaseApp
        .from('order_items')
        .select('qty, line_gross, line_net, line_vat, unit_price_gross, line_discount_per_unit_gross, products ( id, sku, name, unit )')
        .eq('order_id', id);
      if (!o.error) setOrder(o.data);
      if (!it.error) setItems(it.data || []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!order) return <div style={{ padding: 24 }}>Invoice not found</div>;

  const styles = {
    page: { maxWidth: 800, margin: '20px auto', padding: '0 16px', fontFamily: 'Inter, system-ui, Arial, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    card: { border: '1px solid #eaeaea', borderRadius: 12, padding: 16, marginBottom: 16 },
    h1: { margin: 0 },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' },
    td: { borderBottom: '1px solid #f5f5f5', padding: '8px' },
    small: { color: '#666' },
    right: { textAlign: 'right' },
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>Invoice #{order.invoice_no}</h1>
          <div style={styles.small}>{new Date(order.created_at).toLocaleString()}</div>
        </div>
        <button onClick={() => window.print()} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}>Print / Save PDF</button>
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><strong>Tiling Smart</strong><br /><span style={styles.small}>Invoice</span></div>
          <div>
            <strong>Bill To</strong><br />
            {order.customer_name || '-'}<br />
            <span style={styles.small}>{order.customer_email || ''}</span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead><tr>
            <th style={styles.th}>Item</th><th style={styles.th}>SKU</th><th style={styles.th}>Unit</th><th style={styles.th}>Qty</th><th style={styles.th}>Unit Price</th><th style={styles.th}>Discount/u</th><th style={{...styles.th, ...styles.right}}>Line Total</th>
          </tr></thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td style={styles.td}>{it.products?.name}</td>
                <td style={styles.td}>{it.products?.sku}</td>
                <td style={styles.td}>{it.products?.unit}</td>
                <td style={styles.td}>{it.qty}</td>
                <td style={styles.td}>£{Number(it.unit_price_gross ?? 0).toFixed(2)}</td>
                <td style={styles.td}>£{Number(it.line_discount_per_unit_gross ?? 0).toFixed(2)}</td>
                <td style={{...styles.td, ...styles.right}}>£{Number(it.line_gross ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.card}>
        <div><strong>Status:</strong> {order.status}{order.is_deposit ? ' (Deposit)' : ''}</div>
        {order.payment_method && <div><strong>Payment Method:</strong> {order.payment_method}</div>}
        {order.payment_ref && <div><strong>Payment Reference:</strong> {order.payment_ref}</div>}
        {order.notes && <div style={{ marginTop: 8 }}><strong>Notes:</strong><div style={styles.small} dangerouslySetInnerHTML={{ __html: String(order.notes).replace(/\n/g, '<br/>') }} /></div>}
      </div>

      <div style={{ ...styles.card, display: 'grid', gridTemplateColumns: '1fr 240px', gap: 12 }}>
        <div />
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div>Items Net</div><div>£{Number(order.total_net - (order.delivery_fee_gross / (1+order.delivery_vat_rate))).toFixed(2)}</div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div>Items VAT</div><div>£{Number(order.total_vat - (order.delivery_fee_gross - (order.delivery_fee_gross/(1+order.delivery_vat_rate)))).toFixed(2)}</div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div>Delivery</div><div>£{Number(order.delivery_fee_gross).toFixed(2)}</div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #eee', marginTop: 8, paddingTop: 8 }}><div>Total</div><div>£{Number(order.total_gross).toFixed(2)}</div></div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          button { display: none !important; }
          a { text-decoration: none; color: #000; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
