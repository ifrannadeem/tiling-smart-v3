import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseApp } from '../../lib/supabaseClient';

export default function InvoicePage(){
  const { query:{id} } = useRouter();
  const [order,setOrder]=useState(null); const [items,setItems]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{ if(!id)return; (async()=>{
    setLoading(true);
    const o=await supabaseApp.from('orders').select('*').eq('id',id).single();
    const it=await supabaseApp.from('order_items').select('qty,line_gross,unit_price_gross,line_discount_per_unit_gross,products(sku,name,unit)').eq('order_id',id);
    if(!o.error)setOrder(o.data); if(!it.error)setItems(it.data||[]); setLoading(false);
  })(); },[id]);
  if(loading) return <div className="container">Loading…</div>;
  if(!order) return <div className="container">Invoice not found</div>;
  return (<div className="container">
    <div className="card"><div className="hdr">
      <div><h1 style={{margin:0}}>Invoice #{order.invoice_no}</h1><div className="small">{new Date(order.created_at).toLocaleString()}</div></div>
      <button onClick={()=>window.print()} className="btn print-hide">Print / Save PDF</button>
    </div></div>
    <div className="card"><div className="row" style={{justifyContent:'space-between'}}>
      <div><strong>Tiling Smart</strong><br/><span className="small">Invoice</span></div>
      <div><strong>Bill To</strong><br/>{order.customer_name||'-'}<br/><span className="small">{order.customer_email||''}</span></div>
    </div></div>
    <div className="card" style={{overflowX:'auto'}}>
      <table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Discount/u</th><th style={{textAlign:'right'}}>Line Total</th></tr></thead>
      <tbody>{items.map((it,idx)=>(<tr key={idx}><td>{it.products?.name}</td><td>{it.products?.sku}</td><td>{it.products?.unit}</td><td>{it.qty}</td><td>£{Number(it.unit_price_gross??0).toFixed(2)}</td><td>£{Number(it.line_discount_per_unit_gross??0).toFixed(2)}</td><td style={{textAlign:'right'}}>£{Number(it.line_gross??0).toFixed(2)}</td></tr>))}</tbody></table>
    </div>
    <div className="card"><div className="grid grid-2">
      <div>
        <div><strong>Status:</strong> {order.status}{order.is_deposit?' (Deposit)':''}</div>
        {order.payment_method && <div><strong>Payment Method:</strong> {order.payment_method}</div>}
        {order.payment_ref && <div><strong>Payment Reference:</strong> {order.payment_ref}</div>}
        {order.notes && <div style={{marginTop:8}}><strong>Notes:</strong><div className="small" dangerouslySetInnerHTML={{__html:String(order.notes).replace(/\n/g,'<br/>')}}/></div>}
      </div>
      <div>
        <div className="row" style={{justifyContent:'space-between'}}><div>Delivery</div><strong>£{Number(order.delivery_fee_gross??0).toFixed(2)}</strong></div>
        <div className="row" style={{justifyContent:'space-between',borderTop:'1px solid #1a1f28',paddingTop:8,marginTop:8}}><div>Total</div><strong>£{Number(order.total_gross??0).toFixed(2)}</strong></div>
      </div>
    </div></div>
    <style jsx global>{`@media print{@page{size:A4;margin:14mm}.print-hide{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
  </div>);
}
