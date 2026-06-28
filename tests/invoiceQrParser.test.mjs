import assert from 'node:assert/strict';

function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
function normNo(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function findAfter(text,patterns){for(const p of patterns){const m=text.match(p);if(m)return clean(m[1]||m[0])}return''}
function dateIso(s){s=clean(s);const m=s.match(/(\d{1,2})[-\/. ]([A-Za-z]{3}|\d{1,2})[-\/. ](\d{2,4})/);if(!m)return'';const mon=isNaN(+m[2])?['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(m[2].slice(0,3).toUpperCase())+1:+m[2];let y=+m[3];if(y<100)y+=2000;return `${y}-${String(mon).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`}
function invoiceQrParser(raw){
  const text=String(raw||'').replace(/\r/g,'\n'), flat=clean(text);
  const sap=findAfter(flat,[/(\b7\d{9})(?=\s*SAP\s*Doc\s*no)/i,/SAP\s*Doc\s*no\.?\s*[:\-]?\s*(\d{8,12})/i]);
  const tt=findAfter(flat,[/([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,5})\s*T\.?T\.?No/i,/T\.?T\.?\s*No\.?\s*[:\-]?\s*([A-Z0-9 -]{6,15})/i]);
  const distCode=findAfter(flat,[/Supplier Recipient \(Ship to party\)\s*(\d{5,8})/i,/PAYER\s*-\s*(\d{5,8})/i]);
  const distName=findAfter(flat,[/Supplier Recipient \(Ship to party\)\s*\d{5,8}\s+(.+?)\s+(?:Shop|Delivery no\.|GST|[A-Z ]+\d{6})/i,/PAYER\s*-\s*\d{5,8}\s+(.+?)(?:\s+Ordering Party|\s+GSTIN|\s+Shop)/i]);
  const delivery=findAfter(flat,[/Delivery\s*no\.?\s*(\d{6,12})/i]);
  const salesOrder=findAfter(flat,[/Sales\s*Order\s*(\d{6,12})/i]);
  const dt=findAfter(flat,[/(\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4})\s+(\d{1,2}:\d{2})\s*Road/i]);
  const time=findAfter(flat,[/\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4}\s+(\d{1,2}:\d{2})\s*Road/i]);
  const invDate=(dt.match(/\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4}/)||[])[0]||'';
  const cylinders=[]; let m; const re=/\b(M\d{5})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(EA|KG|NOS|NO)\b/gi;
  while((m=re.exec(flat))) cylinders.push({material_code:m[1].toUpperCase(),cylinder_type:clean(m[2]),quantity:Math.round(+m[3]||0),unit:m[4].toUpperCase()});
  return {sap_doc_no:normNo(sap),tt_number:normNo(tt),distributor_code:distCode,distributor_name:distName,delivery_number:delivery,sales_order_number:salesOrder,invoice_date:invDate,invoice_date_iso:dateIso(invDate),invoice_time:time,cylinders};
}

const sample = `Supplier Recipient (Ship to party) 169360 BS Indane Gas Service Shop No.16, Super Market, GHAZIABAD 201010
Delivery no. 0570962235 / Sales Order 0399436427
7006702088SAP Doc no. UP81DT2495T.T.No. 19-May-26 20:48Road Delivered
Item Material Code / Material Description Quantity Unit Rate Unit HSN code Total
10 M00087 14.2 kg NON SUB. DOM. H.HOLD CYLINDER 360.000 EA 271119`;

const parsed = invoiceQrParser(sample);
assert.equal(parsed.sap_doc_no, '7006702088');
assert.equal(parsed.tt_number, 'UP81DT2495');
assert.equal(parsed.distributor_code, '169360');
assert.equal(parsed.distributor_name, 'BS Indane Gas Service');
assert.equal(parsed.delivery_number, '0570962235');
assert.equal(parsed.sales_order_number, '0399436427');
assert.equal(parsed.invoice_date, '19-May-26');
assert.equal(parsed.invoice_date_iso, '2026-05-19');
assert.equal(parsed.invoice_time, '20:48');
assert.equal(parsed.cylinders[0].material_code, 'M00087');
assert.equal(parsed.cylinders[0].quantity, 360);
assert.equal(parsed.cylinders[0].unit, 'EA');
console.log('invoiceQrParser sample test passed');
