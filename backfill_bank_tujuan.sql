update pembayaran p
set bank_tujuan = v.bank_tujuan
from pembayaran v
where p.gateway_ref like 'trx:%'
  and p.bank_tujuan is null
  and v.order_id = p.order_id
  and v.gateway_ref = 'va:' || substr(p.gateway_ref, 5)
  and v.bank_tujuan is not null;
