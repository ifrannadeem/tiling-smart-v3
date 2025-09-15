create or replace function app.upsert_product(
  p_sku text default null,
  p_type text default 'other',
  p_name text,
  p_size text default null,
  p_unit text default 'unit',
  p_description text default null,
  p_rrp numeric default null,
  p_price numeric default 0,
  p_vat_rate numeric default 0.20,
  p_min_stock_qty numeric default 0
) returns app.products language plpgsql security definer set search_path=app,public as $$
declare v_prod app.products%rowtype; v_sku text;
begin
  if not app.is_admin() then raise exception 'Not permitted'; end if;
  v_sku := nullif(p_sku,'');
  if v_sku is null then v_sku := 'TS-'||to_char(now(),'YYYYMM')||'-'||substring(gen_random_uuid()::text from 1 for 4); end if;
  insert into app.products (sku,type,name,size,unit,description,rrp,price,vat_rate,min_stock_qty)
  values (v_sku,p_type,p_name,p_size,p_unit,p_description,p_rrp,p_price,p_vat_rate,p_min_stock_qty)
  on conflict (sku) do update set
    type=excluded.type,name=excluded.name,size=excluded.size,unit=excluded.unit,
    description=excluded.description,rrp=excluded.rrp,price=excluded.price,vat_rate=excluded.vat_rate,
    min_stock_qty=excluded.min_stock_qty
  returning * into v_prod;
  insert into app.inventory (product_id,qty) values (v_prod.id,0) on conflict (product_id) do nothing;
  return v_prod;
end $$;
grant execute on function app.upsert_product(text,text,text,text,text,text,numeric,numeric,numeric,numeric) to authenticated;

create or replace function app.adjust_inventory(p_sku text,p_qty numeric,p_mode text default 'set')
returns app.inventory language plpgsql security definer set search_path=app,public as $$
declare v_prod app.products%rowtype; v_inv app.inventory%rowtype; v_new numeric;
begin
  if not app.is_sales_or_admin() then raise exception 'Not permitted'; end if;
  select * into v_prod from app.products where sku=p_sku;
  if v_prod.id is null then
    insert into app.products (sku,type,name,unit,price,vat_rate) values (p_sku,'other','Imported '||p_sku,'unit',0,0.20) returning * into v_prod;
    insert into app.inventory (product_id,qty) values (v_prod.id,0) on conflict do nothing;
  end if;
  select * into v_inv from app.inventory where product_id=v_prod.id for update;
  if v_inv.id is null then insert into app.inventory (product_id,qty) values (v_prod.id,0) returning * into v_inv; end if;
  if p_mode='add' then v_new := coalesce(v_inv.qty,0)+coalesce(p_qty,0); else v_new := coalesce(p_qty,0); end if;
  update app.inventory set qty=v_new where id=v_inv.id returning * into v_inv;
  return v_inv;
end $$;
grant execute on function app.adjust_inventory(text,numeric,text) to authenticated;

select pg_notify('pgrst','reload schema');
