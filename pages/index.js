import { useEffect, useMemo, useState } from 'react';
import { supabaseApp } from '../lib/supabaseClient';

function parseCSV(text){const r=[];let i=0,c='',row=[],q=false;while(i<text.length){const ch=text[i];if(q){if(ch=='"'){if(text[i+1]=='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch=='"')q=true;else if(ch==','){row.push(c);c='';}else if(ch=='\n'||ch=='\r'){if(c!==''||row.length){row.push(c);r.push(row);row=[];c='';}if(ch=='\r'&&text[i+1]=='\n')i++;}else c+=ch;}i++;}if(c!==''||row.length)row.push(c);if(row.length)r.push(row);return r;}

export default function Home(){
  const [products,setProducts]=useState([]); const[loadingProducts,setLP]=useState(true);
  const [session,setSession]=useState(null); const[email,setEmail]=useState(''); const[pw,setPw]=useState('');
  const [inventory,setInventory]=useState([]); const[orders,setOrders]=useState([]); const[loading,setLoading]=useState(false);
  const [items,setItems]=useState([]); const[name,setName]=useState(''); const[em,setEm]=useState('');
  const [pm,setPm]=useState(''); const[pr,setPr]=useState(''); const[dep,setDep]=useState(false);
  const [notes,setNotes]=useState(''); const[deliv,setDeliv]=useState(0); const[disc,setDisc]=useState(0);
  const [mode,setMode]=useState('set'); const [toast,setToast]=useState(''); const t=(m)=>{setToast(m);setTimeout(()=>setToast(''),3000);};

  useEffect(()=>{(async()=>{setLP(true);const {data,error}=await supabaseApp.from('products').select('id,sku,name,unit,price,rrp,description').order('name');if(error)console.error(error);setProducts(data||[]);setLP(false);})()},[]);
  useEffect(()=>{(async()=>{const {data:{session}}=await supabaseApp.auth.getSession();setSession(session);})();const {data:sub}=supabaseApp.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>sub.subscription?.unsubscribe?.();},[]);
  const load=async()=>{if(!session)return;setLoading(true);
    const inv=await supabaseApp.from('inventory').select('id,qty,product_id,products(id,sku,name,unit,price)').order('product_id');
    const ord=await supabaseApp.from('orders').select('id,created_at,invoice_no,status,is_deposit,total_gross,customer_name,customer_email').order('created_at',{ascending:false}).limit(50);
    if(!inv.error)setInventory(inv.data||[]); if(!ord.error)setOrders(ord.data||[]); setLoading(false);
  }; useEffect(()=>{if(session)load();},[session]);

  const login=async(e)=>{e.preventDefault();const {error}=await supabaseApp.auth.signInWithPassword({email,password:pw});if(error)return t(error.message);t('Logged in');await load();};
  const logout=async()=>{await supabaseApp.auth.signOut();setInventory([]);setOrders([]);t('Logged out');};

  const add=()=>setItems([...items,{id:crypto.randomUUID(),product_id:'',qty:1,unit_price_override_gross:'',line_discount_per_unit_gross:''}]);
  const rm=(id)=>setItems(items.filter(it=>it.id!==id));
  const up=(id,p)=>setItems(items.map(it=>it.id===id?{...it,...p}:it));
  const opts=useMemo(()=>products.map(p=>({id:p.id,label:`${p.name} (${p.sku})`,price:p.price})),[products]);

  const est=useMemo(()=>{let g=0;items.forEach(it=>{const p=products.find(x=>x.id===it.product_id);const u=Number(it.unit_price_override_gross|| (p?.price??0));const d=Number(it.line_discount_per_unit_gross||0);const q=Number(it.qty||0);g+=Math.max(0,(u-d))*q;});const discounted=Math.max(0,g-Number(disc||0));return discounted+Number(deliv||0);},[items,products,deliv,disc]);

  const create=async(e)=>{e.preventDefault();const li=items.filter(i=>i.product_id&&Number(i.qty)>0).map(i=>({product_id:i.product_id,qty:Number(i.qty),...(i.unit_price_override_gross?{unit_price_override_gross:Number(i.unit_price_override_gross)}:{}),...(i.line_discount_per_unit_gross?{line_discount_per_unit_gross:Number(i.line_discount_per_unit_gross)}:{})}));if(!li.length)return t('Add at least one line item');
    const {data,error}=await supabaseApp.rpc('create_order_atomic',{p_status:dep?'deposit':'completed',p_is_deposit:dep,p_customer_name:name||null,p_customer_email:em||null,p_payment_method:pm||null,p_payment_ref:pr||null,p_notes:notes||null,p_delivery_fee_gross:Number(deliv)||0,p_discount_invoice_gross:Number(disc)||0,p_items:li}); if(error)return t(error.message||'Failed to create order');
    t(`Order #${data.invoice_no} created`); setItems([]);setName('');setEm('');setPm('');setPr('');setNotes('');setDeliv(0);setDisc(0);setDep(false); await load();
  };

  const importProducts=async(f)=>{const rows=parseCSV(await f.text());if(!rows.length)return t('Empty CSV');const h=rows[0].map(x=>x.trim().toLowerCase());const at=n=>h.indexOf(n);for(const r of ['name','unit','price','type'])if(at(r)===-1)return t(`Missing column: ${r}`);let ok=0,fail=0;for(let i=1;i<rows.length;i++){const row=rows[i];if(!row||!row.length)continue;const body={p_sku:row[at('sku')]||null,p_type:row[at('type')]||'other',p_name:row[at('name')]||'',p_size:(at('size')>-1?row[at('size')]:null),p_unit:row[at('unit')]||'unit',p_description:(at('description')>-1?row[at('description')]:null),p_rrp:(at('rrp')>-1&&row[at('rrp')]?Number(row[at('rrp')]):null),p_price:Number(row[at('price')]||0),p_vat_rate:(at('vat_rate')>-1&&row[at('vat_rate')]?Number(row[at('vat_rate')]):0.20),p_min_stock_qty:(at('min_stock_qty')>-1&&row[at('min_stock_qty')]?Number(row[at('min_stock_qty')]):0)};const {error}=await supabaseApp.rpc('upsert_product',body);if(error){console.error(error);fail++;}else ok++;}t(`Products import: ${ok} ok, ${fail} failed`);const {data}=await supabaseApp.from('products').select('*').order('name');setProducts(data||[]);await load();};
  const importInventory=async(f)=>{const rows=parseCSV(await f.text());if(!rows.length)return t('Empty CSV');const h=rows[0].map(x=>x.trim().toLowerCase());const iS=h.indexOf('sku'),iQ=h.indexOf('qty');if(iS===-1||iQ===-1)return t('CSV must have sku,qty');let ok=0,fail=0;for(let i=1;i<rows.length;i++){const r=rows[i];if(!r||!r.length)continue;const {error}=await supabaseApp.rpc('adjust_inventory',{p_sku:r[iS],p_qty:Number(r[iQ]||0),p_mode:mode});if(error){console.error(error);fail++;}else ok++;}t(`Inventory ${mode}: ${ok} ok, ${fail} failed`);await load();};

  return (<div className="container">
    <header className="card hdr">
      <div><h1 style={{margin:0}}>Tiling Smart EPOS <span className="badge">v3.0 • multi-line + CSV</span></h1><div className="small">Next.js (Pages) · Supabase · Resend</div></div>
      <div className="row">
        {session? (<><span className="tag">{session.user.email}</span><button className="btn" onClick={logout}>Logout</button></>):
        (<form onSubmit={login} className="row"><input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input" type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)}/><button className="btn btn-primary" type="submit">Login</button></form>)}
      </div>
    </header>

    <section className="card">
      <h2 style={{marginTop:0}}>Products (public)</h2>
      {loadingProducts? <div className="small">Loading…</div> : (
        <div style={{overflowX:'auto'}}>
          <table className="table"><thead><tr><th>SKU</th><th>Name</th><th>Unit</th><th>Price</th><th>RRP</th><th>Description</th></tr></thead><tbody>
            {products.map(p=>(<tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td>{p.unit}</td><td>£{Number(p.price).toFixed(2)}</td><td>{p.rrp!=null?`£${Number(p.rrp).toFixed(2)}`:'-'}</td><td className="small">{p.description||'-'}</td></tr>))}
          </tbody></table>
        </div>
      )}
    </section>

    {session && (<>
      <section className="card">
        <h2 style={{marginTop:0}}>Create Order</h2>
        <div className="row" style={{marginBottom:10}}>
          <button className="btn" onClick={()=>setItems([])}>Clear</button>
          <button className="btn" onClick={()=>setItems(prev=>prev.length?prev:[{id:crypto.randomUUID(),product_id:'',qty:1}])}>Start</button>
          <button className="btn" onClick={add}>+ Add item</button>
          <span className="tag">Estimated: £{Number(est).toFixed(2)}</span>
        </div>
        <div style={{overflowX:'auto'}}>
          <table className="table"><thead><tr><th style={{minWidth:260}}>Product</th><th>Qty</th><th>Unit Price (override)</th><th>Discount / unit</th><th></th></tr></thead>
            <tbody>{items.map(it=>(<tr key={it.id}>
              <td><select className="select" value={it.product_id} onChange={e=>up(it.id,{product_id:e.target.value})}><option value="">Select…</option>{opts.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></td>
              <td><input className="input" type="number" min="0.001" step="0.001" value={it.qty} onChange={e=>up(it.id,{qty:e.target.value})}/></td>
              <td><input className="input" type="number" step="0.01" placeholder="(optional)" value={it.unit_price_override_gross||''} onChange={e=>up(it.id,{unit_price_override_gross:e.target.value})}/></td>
              <td><input className="input" type="number" step="0.01" placeholder="(optional)" value={it.line_discount_per_unit_gross||''} onChange={e=>up(it.id,{line_discount_per_unit_gross:e.target.value})}/></td>
              <td><button className="btn btn-danger" onClick={()=>rm(it.id)}>Remove</button></td>
            </tr>))}</tbody>
          </table>
        </div>
        <form onSubmit={create} style={{marginTop:12}}>
          <div className="row">
            <label className="row" style={{gap:6}}><input type="checkbox" checked={dep} onChange={e=>setDep(e.target.checked)}/><span>Deposit</span></label>
            <input className="input" placeholder="Customer name" value={name} onChange={e=>setName(e.target.value)} style={{maxWidth:220}}/>
            <input className="input" placeholder="Customer email" value={em} onChange={e=>setEm(e.target.value)} style={{maxWidth:240}}/>
            <input className="input" placeholder="Payment method" value={pm} onChange={e=>setPm(e.target.value)} style={{maxWidth:180}}/>
            <input className="input" placeholder="Payment reference" value={pr} onChange={e=>setPr(e.target.value)} style={{maxWidth:180}}/>
          </div>
          <div className="row" style={{marginTop:8}}>
            <input className="input" type="number" step="0.01" placeholder="Delivery fee" value={deliv} onChange={e=>setDeliv(e.target.value)} style={{maxWidth:160}}/>
            <input className="input" type="number" step="0.01" placeholder="Invoice discount" value={disc} onChange={e=>setDisc(e.target.value)} style={{maxWidth:160}}/>
          </div>
          <textarea className="input" style={{marginTop:8,height:90}} placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/>
          <div className="row" style={{marginTop:10}}><button className="btn btn-primary" type="submit">Create Order</button></div>
        </form>
      </section>

      <section className="card">
        <h2 style={{marginTop:0}}>Inventory</h2>
        {loading? <div className="small">Loading…</div> : (
          <div style={{overflowX:'auto'}}>
            <table className="table"><thead><tr><th>SKU</th><th>Name</th><th>Unit</th><th>Price</th><th>Qty</th></tr></thead>
              <tbody>{inventory.map(r=>(<tr key={r.id}><td>{r.products?.sku}</td><td>{r.products?.name}</td><td>{r.products?.unit}</td><td>£{Number(r.products?.price??0).toFixed(2)}</td><td>{r.qty}</td></tr>))}</tbody>
            </table>
          </div>
        )}
        <hr className="sep"/>
        <div className="grid grid-2">
          <div>
            <div className="small" style={{fontWeight:700,marginBottom:6}}>Import Products CSV</div>
            <input type="file" accept=".csv" onChange={e=>e.target.files?.[0]&&importProducts(e.target.files[0])}/>
            <div className="small" style={{marginTop:6}}>Columns: <code>sku,type,name,size,unit,description,rrp,price,vat_rate,min_stock_qty</code></div>
          </div>
          <div>
            <div className="small" style={{fontWeight:700,marginBottom:6}}>Import Inventory CSV</div>
            <div className="row" style={{marginBottom:6}}>
              <input type="file" accept=".csv" onChange={e=>e.target.files?.[0]&&importInventory(e.target.files[0])}/>
              <label className="row" style={{gap:6}}><input type="radio" name="mode" checked={mode==='set'} onChange={()=>setMode('set')}/> set</label>
              <label className="row" style={{gap:6}}><input type="radio" name="mode" checked={mode==='add'} onChange={()=>setMode('add')}/> add</label>
            </div>
            <div className="small">Columns: <code>sku,qty</code></div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 style={{marginTop:0}}>Recent Orders</h2>
        {loading? <div className="small">Loading…</div> : (
          <div style={{overflowX:'auto'}}>
            <table className="table"><thead><tr><th>Invoice #</th><th>Date</th><th>Total</th><th>Status</th><th>Customer</th><th>Actions</th></tr></thead>
              <tbody>{orders.map(o=>(<tr key={o.id}>
                <td><a href={`/invoice/${o.id}`} target="_blank" rel="noreferrer">#{o.invoice_no}</a></td>
                <td>{new Date(o.created_at).toLocaleString()}</td>
                <td>£{Number(o.total_gross??0).toFixed(2)}</td>
                <td>{o.status}{o.is_deposit?' (Deposit)':''}</td>
                <td>{o.customer_name||'-'}<div className="small">{o.customer_email||''}</div></td>
                <td><button className="btn" onClick={async()=>{
                  if(!o.customer_email)return t('No customer email on order');
                  const origin=typeof window!=='undefined'?window.location.origin:'';
                  const {data:its,error}=await supabaseApp.from('order_items').select('qty,line_gross,vat_rate,products(sku,name,unit,price)').eq('order_id',o.id);
                  if(error)return t('Failed to load order items');
                  const res=await fetch('/api/email-invoice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:o.customer_email,order:{...o,items:its},invoiceUrl:`${origin}/invoice/${o.id}`})});
                  const j=await res.json(); if(!res.ok)return t(j?.error||'Email send failed'); t('Invoice email sent (Resend sandbox: send to your account email).');
                }}>Email invoice</button></td>
              </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>)}
    {toast&&<div className="toast">{toast}</div>}
  </div>);}
