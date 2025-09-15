import { Resend } from 'resend';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const resendApiKey=process.env.RESEND_API_KEY; if(!resendApiKey) return res.status(500).json({error:'RESEND_API_KEY is missing on the server'});
  try{
    const {to,order,invoiceUrl}=req.body||{}; if(!to||!order) return res.status(400).json({error:'Missing "to" or "order"'});
    const resend=new Resend(resendApiKey); const subject=`Invoice #${order.invoice_no} — Tiling Smart`;
    const itemsRows=(order.items||[]).map(it=>`<tr>
      <td style="border-bottom:1px solid #f5f5f5;padding:8px">${it.products?.name??''}</td>
      <td style="border-bottom:1px solid #f5f5f5;padding:8px">${it.products?.sku??''}</td>
      <td style="border-bottom:1px solid #f5f5f5;padding:8px">${it.products?.unit??''}</td>
      <td style="border-bottom:1px solid #f5f5f5;padding:8px">${it.qty}</td>
      <td style="border-bottom:1px solid #f5f5f5;padding:8px">£${Number(it.products?.price??0).toFixed(2)}</td>
      <td style="border-bottom:1px solid #f5f5f5;padding:8px">£${Number(it.line_gross??0).toFixed(2)}</td>
    </tr>`).join('');
    const html=`<div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.45">
      <h2 style="margin:0 0 8px">Invoice #${order.invoice_no}</h2>
      <div style="color:#666;margin-bottom:16px">${new Date(order.created_at).toLocaleString()}</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:16px"><thead><tr>
      <th align="left" style="border-bottom:1px solid #eee;padding:8px">Item</th><th align="left" style="border-bottom:1px solid #eee;padding:8px">SKU</th><th align="left" style="border-bottom:1px solid #eee;padding:8px">Unit</th><th align="left" style="border-bottom:1px solid #eee;padding:8px">Qty</th><th align="left" style="border-bottom:1px solid #eee;padding:8px">Unit Price</th><th align="left" style="border-bottom:1px solid #eee;padding:8px">Total</th>
      </tr></thead><tbody>${itemsRows}</tbody></table>
      <p><strong>Total:</strong> £${Number(order.total_gross??0).toFixed(2)}</p>
      ${invoiceUrl?`<p><a href="${invoiceUrl}">View printable invoice</a></p>`:''}
      <p style="color:#777;font-size:12px">Sent via Resend sandbox. Use your Resend account email as the recipient, or verify a domain to email customers.</p>
    </div>`;
    const { error } = await resend.emails.send({ from:'onboarding@resend.dev', to, subject, html });
    if(error) return res.status(500).json({error:String(error)});
    return res.status(200).json({ok:true});
  }catch(e){console.error(e);return res.status(500).json({error:'Unexpected server error'});}
}
