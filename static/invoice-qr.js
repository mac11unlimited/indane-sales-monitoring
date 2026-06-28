(function(){
  window.invoiceQrScans=JSON.parse(localStorage.indaneInvoiceQrScans||'[]');
  let qrScanner=null, qrDraft=null;
  const MATERIAL_MAP={
    M00087:'14.2 kg NON SUB. DOM. H.HOLD CYLINDER',M00089:'14.2 kg N/S DOM.HH CYLINDER SM LOAD RETR',M00090:'14.2 kg N/S DOM. HH RET. CYLINDER SUB LD',
    M00002:'19 kg PACKED LPG CYLINDER',M00010:'19 kg DEFECTIVE SAME LOAD RETURN SBOM',M00011:'19 kg DEFECTIVE SUBSEQUENT LOAD RETURN',
    M00065:'47.5kg PACKED LPG CYLINDER (SC VALVE)',M00069:'47.5kg PACKED LPG CYLINDER (LOT VALVE)',M00071:'47.5kg DEFECTIVE SAME LOAD RETN (LOT)',
    M00104:'5.0 kg PCKD N/SUB DOM CYLINDER HOUSEHOLD',M00215:'5 kg ND CYLINDER - NEW FTL',M00217:'5 kg ND CYLINDER FTL NEW(Point of Sale)',M00140:'425 kg PACKED LPG CYLINDER'
  };
  function e(id){return document.getElementById(id)}
  function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
  function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
  function normNo(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
  function todayKey(){return typeof today==='string'?today:new Date().toISOString().slice(0,10)}
  function dateIso(s){s=clean(s);let m=s.match(/(\d{1,2})[-\/. ]([A-Za-z]{3}|\d{1,2})[-\/. ](\d{2,4})/);if(!m)return'';let mon=isNaN(+m[2])?['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(m[2].slice(0,3).toUpperCase())+1:+m[2];let y=+m[3];if(y<100)y+=2000;return y+'-'+String(mon).padStart(2,'0')+'-'+String(+m[1]).padStart(2,'0')}
  function displayDate(s){return s||''}
  function canQrScan(){return !!user&&!isReadOnly()&&(user.role==='ADMIN'||user.role==='SECURITY_GUARD'||user.role==='SND_USER'||String(user.role||'').startsWith('PLANT_'))}
  function canQrCorrect(){return !!user&&!isReadOnly()&&user.role==='ADMIN'}
  function canQrView(){return !!user&&(user.role==='ADMIN'||user.role==='SECURITY_GUARD'||user.role==='SND_USER'||String(user.role||'').startsWith('PLANT_'))}
  function rolePlant(){try{return typeof invRolePlant==='function'?invRolePlant():(typeof plantFromRole==='function'?plantFromRole():'All Plants')}catch(_){return'All Plants'}}
  function qrPlantAllowed(r){let p=rolePlant();return p==='All Plants'||!r.gate_name||r.gate_name===p}
  function findAfter(text,patterns){for(let p of patterns){let m=text.match(p);if(m)return clean(m[1]||m[0])}return''}
  function invoiceQrParser(raw){
    let text=String(raw||'').replace(/\r/g,'\n'), flat=clean(text);
    let sap=findAfter(flat,[/(\b7\d{9})(?=\s*SAP\s*Doc\s*no)/i,/SAP\s*Doc\s*no\.?\s*[:\-]?\s*(\d{8,12})/i,/Doc(?:ument)?\s*No\.?\s*[:\-]?\s*(\d{8,12})/i]);
    let tt=findAfter(flat,[/T\.?T\.?\s*No\.?\s*[:\-]?\s*([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,5})/i,/([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,5})\s*T\.?T\.?No/i,/Vehicle\s*No\.?\s*[:\-]?\s*([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,5})/i,/T\.?T\.?\s*No\.?\s*[:\-]?\s*([A-Z0-9 -]{6,15})(?=\s+(?:Time|Date|Cont|Supplier|$))/i]);
    let distCode=findAfter(flat,[/PAYER\s*-\s*(\d{5,8})/i,/Ordering Party\(Bill to party\)\s*:\s*(\d{5,8})/i,/Ship to party\D+(?:\d{3,4}\D+)?(\d{5,8})/i]);
    let distName=findAfter(flat,[/PAYER\s*-\s*\d{5,8}\s+(.+?)(?:\s+Reverse Charge|\s+Ordering Party|\s+GSTIN|\s+Shop)/i,/Ordering Party\(Bill to party\)\s*:\s*\d{5,8}\s+GSTIN\s+[A-Z0-9]+\s+(.+?)\s+(?:Shop|Place of supply|GHAZIABAD|[A-Z ]+\d{6})/i,/Supplier Recipient \(Ship to party\).*?\d{5,8}\s+\(Mob No\.-\d+\)\s+(.+?)\s+(?:IOCL|Shop|Delivery no\.|GST)/i]);
    let delivery=findAfter(flat,[/Delivery\s*no\.?\s*(\d{6,12})/i,/Delivery\s*Number\s*[:\-]?\s*(\d{6,12})/i]);
    let salesOrder=findAfter(flat,[/Sales\s*Order\s*(\d{6,12})/i,/Sales\s*Order\s*Number\s*[:\-]?\s*(\d{6,12})/i]);
    let dt=findAfter(flat,[/(\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4})\s+(\d{1,2}:\d{2})\s*Road/i,/Date\s*Time\s*(\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4})\s+(\d{1,2}:\d{2})/i]);
    let time=findAfter(flat,[/\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4}\s+(\d{1,2}:\d{2})\s*Road/i,/Time\s*[:\-]?\s*(\d{1,2}:\d{2})/i]);
    let invDate=(dt.match(/\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4}/)||[])[0]||findAfter(flat,[/Date\s*[:\-]?\s*(\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4})/i]);
    let cylinders=[], re=/\b(M\d{5})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(EA|KG|NOS|NO)\b/gi, m;
    while((m=re.exec(flat))){let desc=clean(m[2]).replace(/\s+\d+\s*$/,'');if(/Taxable|Total|Rate|HSN|Rounding/i.test(desc))continue;cylinders.push({material_code:m[1].toUpperCase(),cylinder_type:MATERIAL_MAP[m[1].toUpperCase()]||desc,quantity:Math.round(+m[3]||0),unit:m[4].toUpperCase()})}
    if(!cylinders.length){let m2=flat.match(/\b(M\d{5})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(EA|KG)\s+\d{6}/i);if(m2)cylinders.push({material_code:m2[1].toUpperCase(),cylinder_type:MATERIAL_MAP[m2[1].toUpperCase()]||clean(m2[2]),quantity:Math.round(+m2[3]||0),unit:m2[4].toUpperCase()})}
    return {sap_doc_no:normNo(sap),tt_number:normNo(tt),distributor_code:distCode,distributor_name:distName,delivery_number:delivery,sales_order_number:salesOrder,invoice_date:displayDate(invDate),invoice_date_iso:dateIso(invDate),invoice_time:time,cylinders:cylinders.filter(c=>c.material_code&&c.quantity),raw_qr_text_admin:raw};
  }
  function duplicateCheck(draft,exceptId=''){
    let rows=(invoiceQrScans||[]).filter(r=>r.id!==exceptId), tests=[
      ['SAP Doc No.',r=>draft.sap_doc_no&&normNo(r.sap_doc_no)===normNo(draft.sap_doc_no)],
      ['Delivery Number',r=>draft.delivery_number&&String(r.delivery_number)===String(draft.delivery_number)],
      ['Sales Order Number',r=>draft.sales_order_number&&String(r.sales_order_number)===String(draft.sales_order_number)],
      ['TT Number + Invoice Date',r=>draft.tt_number&&normNo(r.tt_number)===normNo(draft.tt_number)&&(r.invoice_date_iso||r.invoice_date)===(draft.invoice_date_iso||draft.invoice_date)]
    ];
    for(let [reason,fn] of tests){let hit=rows.find(fn);if(hit)return{duplicate:true,reason,record:hit}}return{duplicate:false};
  }
  function qrStatus(html,cls='qr-warn'){if(e('qrStatus')){qrStatus.className='qr-status '+cls;qrStatus.innerHTML=html}}
  function htmlCylRows(cyls){return (cyls||[]).map((c,i)=>'<tr><td><input id="qrMat_'+i+'" value="'+esc(c.material_code)+'"></td><td><input id="qrDesc_'+i+'" value="'+esc(c.cylinder_type)+'"></td><td><input id="qrQty_'+i+'" type="number" value="'+esc(c.quantity)+'"></td><td><input id="qrUnit_'+i+'" value="'+esc(c.unit||'EA')+'"></td></tr>').join('')}
  function blankDraft(source='Manual'){return{sap_doc_no:'',tt_number:'',distributor_code:'',distributor_name:'',delivery_number:'',sales_order_number:'',invoice_date:'',invoice_date_iso:todayKey(),invoice_time:'',cylinders:[{material_code:'M00087',cylinder_type:MATERIAL_MAP.M00087,quantity:0,unit:'EA'}],raw_qr_text_admin:'',source}}
  function draftLooksUseful(d){return !!(d&&(d.sap_doc_no||d.delivery_number||d.sales_order_number||d.tt_number||d.distributor_code||(d.cylinders||[]).some(c=>c.material_code&&c.quantity)))}
  function scannerHelp(){
    return '<div class="qr-scan-tools no-print"><input id="qrModalFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" capture="environment"><button onclick="scanInvoiceQrModalFile()">Read Complete Invoice / QR Image</button><button class="light" onclick="manualInvoiceQrEntry()">Manual Entry</button><button class="light" onclick="closeInvoiceQrScanner()">Close</button></div><div class="qr-remedy"><b>If camera cannot read:</b> the printed code may be too dense or may contain only GST/e-invoice data. Use <b>Read Complete Invoice</b>; the portal will crop/upscale QR and then OCR the full invoice. If the image/PDF is blurred or protected, use Manual Entry.</div>';
  }
  function showConfirm(draft,source='QR'){
    qrDraft={...draft,source};let dup=duplicateCheck(qrDraft), disabled=dup.duplicate?'disabled':'';
    let dupHtml=dup.duplicate?'<div class="qr-status qr-bad"><b>This invoice/truck has already been scanned.</b><br>Duplicate by '+esc(dup.reason)+' | Previous scan: '+esc(dup.record.scan_time||dup.record.created_at||'')+' | By '+esc(dup.record.scanned_by||'')+' | Gate '+esc(dup.record.gate_name||'')+' | Status '+esc(dup.record.scan_status||'')+'</div>':'<div class="qr-status qr-ok"><b>Scan decoded successfully.</b> Please verify and save.</div>';
    let html=dupHtml+'<div class="qr-form"><label>Invoice / SAP Doc No.<input id="qrSap" value="'+esc(qrDraft.sap_doc_no)+'"></label><label>TT Number<input id="qrTt" value="'+esc(qrDraft.tt_number)+'"></label><label>Distributor Code<input id="qrDistCode" value="'+esc(qrDraft.distributor_code)+'"></label><label>Distributor Name<input id="qrDistName" value="'+esc(qrDraft.distributor_name)+'"></label><label>Delivery Number<input id="qrDelivery" value="'+esc(qrDraft.delivery_number)+'"></label><label>Sales Order Number<input id="qrSalesOrder" value="'+esc(qrDraft.sales_order_number)+'"></label><label>Invoice Date<input id="qrInvDate" value="'+esc(qrDraft.invoice_date)+'"></label><label>Invoice Time<input id="qrInvTime" value="'+esc(qrDraft.invoice_time)+'"></label></div><table class="qr-cyl-table report"><tr><th>Material Code</th><th>Cylinder Type / Material Description</th><th>Quantity</th><th>Unit</th></tr>'+htmlCylRows(qrDraft.cylinders)+'</table><div class="toolbar" style="margin-top:10px"><button class="orange" '+disabled+' onclick="saveInvoiceQrScan()">Save & Auto-fill Gate OUT</button><button onclick="autoFillGateFromQr()">Auto-fill Gate Entry Only</button><button class="light" onclick="manualInvoiceQrEntry()">Manual Correction</button><button class="light" onclick="closeInvoiceQrScanner()">Close</button></div>';
    if(e('qrConfirm'))qrConfirm.innerHTML=html;
  }
  function manualInvoiceQrEntry(){showConfirm(blankDraft('Manual'),'Manual');qrStatus('Manual entry mode. Enter invoice fields, cylinder quantities, then Save & Auto-fill Gate OUT.','qr-warn')}
  function collectDraft(){let cyl=(qrDraft?.cylinders||[]).map((c,i)=>({material_code:e('qrMat_'+i)?.value||c.material_code,cylinder_type:e('qrDesc_'+i)?.value||c.cylinder_type,quantity:Math.round(+(e('qrQty_'+i)?.value||c.quantity)||0),unit:e('qrUnit_'+i)?.value||c.unit||'EA'})).filter(c=>c.material_code||c.quantity);return{...qrDraft,sap_doc_no:normNo(e('qrSap')?.value),tt_number:normNo(e('qrTt')?.value),distributor_code:e('qrDistCode')?.value?.trim()||'',distributor_name:e('qrDistName')?.value?.trim()||'',delivery_number:e('qrDelivery')?.value?.trim()||'',sales_order_number:e('qrSalesOrder')?.value?.trim()||'',invoice_date:e('qrInvDate')?.value?.trim()||'',invoice_date_iso:dateIso(e('qrInvDate')?.value)||qrDraft?.invoice_date_iso||'',invoice_time:e('qrInvTime')?.value?.trim()||'',cylinders:cyl}}
  function cylToPcim(cyls){let o={d14:0,d19:0,x19:0,d425:0,d5:0,nd5:0,c10:0,ftl2:0,d475sc:0,d475lot:0};(cyls||[]).forEach(c=>{let s=(c.material_code+' '+c.cylinder_type).toLowerCase(),q=+c.quantity||0;if(/14\.2|m00087|m00089|m00090/.test(s))o.d14+=q;else if(/425|m00140/.test(s))o.d425+=q;else if(/47\.5.*lot|m00069|m00071|m00072|m00690|m00692/.test(s))o.d475lot+=q;else if(/47\.5/.test(s))o.d475sc+=q;else if(/19.*xtra|nanocut|m00450|m00094|m90450/.test(s))o.x19+=q;else if(/19|m00002|m00010|m00011/.test(s))o.d19+=q;else if(/5.*ftl|pos|m00215|m00217/.test(s))o.nd5+=q;else if(/5/.test(s))o.d5+=q;else if(/10/.test(s))o.c10+=q});return o}
  function autoFillGateFromQr(){let d=collectDraft();if(!e('invDocNo'))return alert('Open Plant Cylinders Inventory Management first.');if(e('invDocNo'))invDocNo.value=d.sap_doc_no;if(e('invTruck'))invTruck.value=d.tt_number;if(e('invDistributor'))invDistributor.value=[d.distributor_code,d.distributor_name].filter(Boolean).join(' - ');if(e('invDate')&&d.invoice_date_iso)invDate.value=d.invoice_date_iso;if(e('invTime')&&d.invoice_time)invTime.value=d.invoice_time;if(e('invMove'))invMove.value='OUT';if(e('invDocType'))invDocType.value='Invoice';if(e('invLoadType'))invLoadType.value='Filled LPG Cylinders OUT';let map=cylToPcim(d.cylinders);Object.entries(map).forEach(([k,v])=>{if(e('inv_'+k))e('inv_'+k).value=v});try{updateInventoryInterlock();renderInventory()}catch(_){}qrStatus('Gate-2 entry form auto-filled. Please verify and save Gate-2 Entry separately.','qr-ok')}
  function saveInvoiceQrScan(){
    if(!canQrScan())return alert('You are not authorized to save QR scans.');
    let d=collectDraft(), dup=duplicateCheck(d);if(dup.duplicate){showConfirm(d,d.source);return}
    let row={id:'QR'+Date.now(),sap_doc_no:d.sap_doc_no,tt_number:d.tt_number,distributor_code:d.distributor_code,distributor_name:d.distributor_name,delivery_number:d.delivery_number,sales_order_number:d.sales_order_number,invoice_date:d.invoice_date,invoice_date_iso:d.invoice_date_iso,invoice_time:d.invoice_time,cylinders:d.cylinders,raw_qr_text:(user?.role==='ADMIN'?d.raw_qr_text_admin:''),scan_status:d.source==='OCR'?'OCR extracted':'Saved',duplicate_of:'',scanned_by:user?.id||'',gate_name:rolePlant(),scan_time:new Date().toLocaleString('en-IN'),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    invoiceQrScans.unshift(row);save();autoFillGateFromQr();renderInvoiceQr();recordAudit?.('INVOICE_QR_SCAN_SAVE',row.sap_doc_no+' '+row.tt_number,'PCIM QR');qrStatus('Invoice QR saved successfully and Gate-2 form auto-filled.','qr-ok');
  }
  function deleteInvoiceQr(id){if(!canQrCorrect())return alert('Only Admin can delete/unlock QR records.');if(!confirm('Delete this QR scan record?'))return;invoiceQrScans=invoiceQrScans.filter(r=>r.id!==id);save();renderInvoiceQr();recordAudit?.('INVOICE_QR_DELETE',id,'PCIM QR')}
  function renderInvoiceQr(){
    if(!e('invoiceQrCard'))return;let date=e('qrFilterDate')?.value||todayKey(),term=(e('qrFilterText')?.value||'').toLowerCase(),rows=(invoiceQrScans||[]).filter(qrPlantAllowed).filter(r=>(!date||r.invoice_date_iso===date||r.created_at?.slice(0,10)===date)).filter(r=>!term||JSON.stringify(r).toLowerCase().includes(term));
    let todayRows=(invoiceQrScans||[]).filter(qrPlantAllowed).filter(r=>(r.created_at||'').slice(0,10)===todayKey()), dup=(invoiceQrScans||[]).filter(r=>r.scan_status==='Duplicate').length, fail=(invoiceQrScans||[]).filter(r=>/Failed/i.test(r.scan_status||'')).length;
    if(e('qrToday'))qrToday.textContent=todayRows.length;if(e('qrSuccess'))qrSuccess.textContent=(invoiceQrScans||[]).filter(r=>/Saved|OCR/i.test(r.scan_status||'')).length;if(e('qrDuplicate'))qrDuplicate.textContent=dup;if(e('qrFailed'))qrFailed.textContent=fail;
    if(e('qrHistoryTable'))qrHistoryTable.innerHTML='<tr><th>Scan Time</th><th>Status</th><th>SAP Doc</th><th>Distributor</th><th>TT No</th><th>Delivery</th><th>SO</th><th>Date</th><th>Cylinders</th><th>User/Gate</th><th>Action</th></tr>'+rows.map(r=>'<tr><td>'+esc(r.scan_time)+'</td><td><span class="qr-pill '+(r.scan_status==='OCR extracted'?'ocr':r.duplicate_of?'dup':'saved')+'">'+esc(r.scan_status)+'</span></td><td><b>'+esc(r.sap_doc_no)+'</b></td><td>'+esc([r.distributor_code,r.distributor_name].filter(Boolean).join(' - '))+'</td><td>'+esc(r.tt_number)+'</td><td>'+esc(r.delivery_number)+'</td><td>'+esc(r.sales_order_number)+'</td><td>'+esc(r.invoice_date)+'</td><td>'+esc((r.cylinders||[]).map(c=>c.material_code+': '+c.quantity+' '+c.unit).join('; '))+'</td><td>'+esc(r.scanned_by+' / '+r.gate_name)+'</td><td>'+(canQrCorrect()?'<button onclick="deleteInvoiceQr(&quot;'+esc(r.id)+'&quot;)">Delete</button>':'')+'</td></tr>').join('');
  }
  async function ensureScript(src){if([...document.scripts].some(s=>s.src.includes(src)))return;await new Promise((res,rej)=>{let s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
  function canvasFromImage(img,max=1800){let r=Math.min(max/img.naturalWidth,max/img.naturalHeight,1),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*r));c.height=Math.max(1,Math.round(img.naturalHeight*r));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c}
  function cropCanvas(src,rx,ry,rw,rh,scale=2){let c=document.createElement('canvas'),w=Math.max(1,Math.round(src.width*rw)),h=Math.max(1,Math.round(src.height*rh));c.width=w*scale;c.height=h*scale;let ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(src,Math.round(src.width*rx),Math.round(src.height*ry),w,h,0,0,c.width,c.height);return c}
  function thresholdCanvas(src){let c=document.createElement('canvas');c.width=src.width;c.height=src.height;let ctx=c.getContext('2d');ctx.drawImage(src,0,0);let im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){let g=(d[i]*.299+d[i+1]*.587+d[i+2]*.114),v=g>142?255:0;d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(im,0,0);return c}
  async function canvasToImage(c){return await new Promise((res,rej)=>{let img=new Image();img.onload=()=>res(img);img.onerror=rej;img.src=c.toDataURL('image/png')})}
  async function decodeCanvasZxing(src){
    try{
      await ensureScript('static/vendor/zxing.min.js');
      let img=await canvasToImage(src), readers=[new ZXing.BrowserMultiFormatReader(),new ZXing.BrowserQRCodeReader(),new ZXing.BrowserDatamatrixCodeReader()];
      for(let rdr of readers){try{let r=await rdr.decodeFromImage(img);let t=r?.getText?r.getText():String(r||'');if(t)return t}catch(_){}}
    }catch(_){}
    return '';
  }
  async function decodeCanvasQr(src){
    try{if('BarcodeDetector'in window){let det=new BarcodeDetector({formats:['qr_code','data_matrix','pdf417','aztec']});let r=await det.detect(src);if(r&&r[0]?.rawValue)return r[0].rawValue}}catch(_){}
    try{let z=await decodeCanvasZxing(src);if(z)return z}catch(_){}
    try{await ensureScript('static/vendor/jsQR.min.js');let ctx=src.getContext('2d'),im=ctx.getImageData(0,0,src.width,src.height),r=jsQR(im.data,src.width,src.height,{inversionAttempts:'attemptBoth'});if(r?.data)return r.data}catch(_){}
    return '';
  }
  async function smartDecodeQrFromCanvas(base){
    let regions=[[0,0,1,1],[.68,0,.32,.36],[.62,0,.38,.42],[.55,0,.45,.5],[.65,.02,.33,.33],[.5,0,.5,.55],[0,0,1,.55]];
    for(let reg of regions){for(let sc of [1,2,3,4]){let c=cropCanvas(base,...reg,sc),txt=await decodeCanvasQr(c);if(txt)return txt;txt=await decodeCanvasQr(thresholdCanvas(c));if(txt)return txt}}
    return '';
  }
  async function imageFileToCanvas(f){let url=URL.createObjectURL(f);try{return await new Promise((res,rej)=>{let img=new Image();img.onload=()=>res(canvasFromImage(img));img.onerror=rej;img.src=url})}finally{setTimeout(()=>URL.revokeObjectURL(url),2000)}}
  async function ocrCanvas(c,label='invoice image'){try{qrStatus('QR not decoded. Running OCR on '+label+'... keep this screen open.','qr-warn');await ensureScript('static/vendor/tesseract/tesseract.min.js');let r=await Tesseract.recognize(c.toDataURL('image/png'),'eng',{workerPath:'static/vendor/tesseract/worker.min.js',corePath:'static/vendor/tesseract/tesseract-core-simd.wasm.js',langPath:'static/vendor/tesseract',logger:m=>{if(m.status&&e('qrStatus'))qrStatus('OCR '+m.status+' '+Math.round((m.progress||0)*100)+'%','qr-warn')}});return r?.data?.text||''}catch(err){qrStatus('OCR could not read '+label+': '+esc(err.message||err)+'. Use clearer original PDF/image or Manual Entry.','qr-bad');return''}}
  async function textAndQrFromPdf(f){
    await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    let pdf=await pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise,txt='',firstCanvas=null,qr='';
    for(let i=1;i<=pdf.numPages;i++){let page=await pdf.getPage(i),tc=await page.getTextContent();txt+=' '+tc.items.map(x=>x.str).join(' ');if(!qr){let vp=page.getViewport({scale:2.4}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;if(!firstCanvas)firstCanvas=c;qr=await smartDecodeQrFromCanvas(c)}}
    let d=invoiceQrParser(txt);if(!draftLooksUseful(d)&&firstCanvas)txt+=' '+await ocrCanvas(firstCanvas,'PDF page');
    return (qr?qr+' ':'')+txt;
  }
  async function openInvoiceQrScanner(){if(!canQrScan())return alert('Only Security Guard / Plant / S&D / Admin can scan invoice QR.');ensureInvoiceQrUi();e('invoiceQrModal')?.classList.remove('hide');if(e('qrConfirm'))qrConfirm.innerHTML=scannerHelp();qrStatus('Starting camera... allow camera permission on Android Chrome / Edge.','qr-warn');try{await ensureScript('static/vendor/html5-qrcode.min.js');qrScanner=new Html5Qrcode('qrReader');let found=false,miss=0;await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:280,height:280},aspectRatio:1.333},txt=>{found=true;stopInvoiceQrScanner();let d=invoiceQrParser(txt);if(draftLooksUseful(d)){showConfirm(d,'QR');qrStatus('Invoice QR read successfully. Verify extracted data and save.','qr-ok')}else{showConfirm({...blankDraft('QR'),raw_qr_text_admin:txt},'QR');qrStatus('Code was read, but invoice fields were not recognized. This may be GST/e-invoice QR only. Use Read Complete Invoice or correct manually.','qr-warn')}},err=>{miss++;if(miss===60&&!found)qrStatus('Still searching. Reason may be blur, low light, small QR/DataMatrix, or camera focus. Try moving phone slowly closer/farther, or use Read Complete Invoice below.','qr-warn')});setTimeout(()=>{if(!found&&e('invoiceQrModal')&&!e('invoiceQrModal').classList.contains('hide'))qrStatus('Unable to read camera QR so far. Remedy: improve light/focus and keep code inside box. If still not possible, use Read Complete Invoice / QR Image or Manual Entry below.','qr-bad')},22000);qrStatus('Camera ready. Point at IOCL Tax Invoice code. Upload/manual options are available below.','qr-ok')}catch(err){qrStatus('Camera failed or permission denied. Reason: '+esc(err.message||err)+'. Use Read Complete Invoice/PDF below or Manual Entry.','qr-bad');if(e('qrConfirm'))qrConfirm.innerHTML=scannerHelp()}}
  async function stopInvoiceQrScanner(){try{if(qrScanner)await qrScanner.stop()}catch(_){}try{qrScanner&&qrScanner.clear()}catch(_){}qrScanner=null}
  async function closeInvoiceQrScanner(){await stopInvoiceQrScanner();e('invoiceQrModal')?.classList.add('hide')}
  async function processInvoiceQrFile(f){
    if(!f)return alert('Select invoice image/PDF/text file first.');
    qrStatus('Reading complete invoice. Trying QR crop/upscale first, then OCR if needed...','qr-warn');
    try{
      let name=f.name.toLowerCase(),txt='';
      if(/\.(png|jpg|jpeg|webp)$/i.test(name)){let c=await imageFileToCanvas(f);txt=await smartDecodeQrFromCanvas(c);let d0=invoiceQrParser(txt);if(!draftLooksUseful(d0))txt+=' '+await ocrCanvas(c,'invoice image')}
      if(!txt&&/\.pdf$/i.test(name))txt=await textAndQrFromPdf(f);
      if(!txt)txt=await f.text().catch(()=> '');
      if(!txt)throw new Error('No QR/text could be read. The file may be a scanned image/PDF, blurred, or protected.');
      let d=invoiceQrParser(txt), src=/\.pdf$/i.test(name)?'Complete Invoice PDF':(/\.(png|jpg|jpeg|webp)$/i.test(name)?'Complete Invoice Image/OCR':'QR Image/Text');
      if(draftLooksUseful(d)){showConfirm(d,src);qrStatus('Invoice file read successfully. Please confirm and save.','qr-ok')}
      else{showConfirm({...blankDraft(src),raw_qr_text_admin:txt},src);qrStatus('File was read, but required invoice fields were not confidently detected. Please correct manually and save.','qr-warn')}
    }catch(err){qrStatus('Failed scan/retry: '+esc(err.message||err)+' Remedy: upload original text PDF invoice, clearer full-page image, or use Manual Entry.','qr-bad');if(e('qrConfirm'))qrConfirm.innerHTML=scannerHelp()}
  }
  async function scanInvoiceQrFile(){return processInvoiceQrFile(e('qrFile')?.files?.[0])}
  async function scanInvoiceQrModalFile(){return processInvoiceQrFile(e('qrModalFile')?.files?.[0])}
  function exportInvoiceQr(){let rows=[['Scan Time','Status','SAP Doc No','TT Number','Distributor Code','Distributor Name','Delivery Number','Sales Order Number','Invoice Date','Invoice Time','Cylinders','Scanned By','Gate'],...(invoiceQrScans||[]).filter(qrPlantAllowed).map(r=>[r.scan_time,r.scan_status,r.sap_doc_no,r.tt_number,r.distributor_code,r.distributor_name,r.delivery_number,r.sales_order_number,r.invoice_date,r.invoice_time,(r.cylinders||[]).map(c=>c.material_code+' '+c.quantity+' '+c.unit).join('; '),r.scanned_by,r.gate_name])];download('invoice-qr-scans.csv',rows.map(r=>r.map(c=>'"'+String(c??'').replaceAll('"','""')+'"').join(',')).join('\n'))}
  function prepareGateOutQrScan(){
    if(!canQrScan())return alert('Only Security Guard / Plant / S&D / Admin can scan invoice QR.');
    if(e('invMove'))invMove.value='OUT';
    if(e('invDocType'))invDocType.value='Invoice';
    if(e('invLoadType'))invLoadType.value='Filled LPG Cylinders OUT';
    try{updateInventoryInterlock()}catch(_){}
    openInvoiceQrScanner();
  }
  function ensureGateOutQrButton(){
    let card=document.querySelector('#inventory .inv-entry-card');
    if(!card||e('gateOutQrToolbar'))return;
    let anchor=card.querySelector('.inv-voicebar')||card.querySelector('.inv-help-strip')||card.querySelector('h2');
    if(!anchor)return;
    anchor.insertAdjacentHTML('afterend','<div id="gateOutQrToolbar" class="qr-gateout-panel no-print"><div><b>Gate OUT Invoice QR Entry</b><span>Scan bill QR to auto-fill invoice no., TT no., distributor, date/time and cylinder quantities.</span></div><button class="qr-gateout-btn" onclick="prepareGateOutQrScan()">Scan Invoice QR for Gate OUT</button></div>');
  }
  function ensureInvoiceQrUi(){
    ensureGateOutQrButton();
    if(!e('inventory')||e('invoiceQrCard'))return;
    let host=e('inventory')?.querySelector('.inv-board');if(!host)return;
    host.insertAdjacentHTML('beforeend','<div id="invoiceQrCard" class="card qr-card"><div class="qr-head"><h2>Invoice QR Scanner</h2><p>Scan IOCL Tax Invoice QR to extract only SAP Doc, TT, Distributor, Delivery/SO, date/time and cylinder quantities.</p></div><div class="qr-actions no-print"><button class="qr-scan-btn" onclick="openInvoiceQrScanner()">Scan Invoice QR</button><input id="qrFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"><button onclick="scanInvoiceQrFile()">Upload PDF/Image Fallback</button><input id="qrFilterDate" type="date" class="field" style="max-width:160px" onchange="renderInvoiceQr()"><input id="qrFilterText" class="field" style="max-width:240px" placeholder="Search TT / SAP / Distributor" oninput="renderInvoiceQr()"><button onclick="exportInvoiceQr()">Export QR Report</button></div><div class="qr-kpis"><div class="qr-mini green"><span>Today Scans</span><b id="qrToday">0</b></div><div class="qr-mini green"><span>Successful</span><b id="qrSuccess">0</b></div><div class="qr-mini red"><span>Duplicate Attempts</span><b id="qrDuplicate">0</b></div><div class="qr-mini orange"><span>Failed</span><b id="qrFailed">0</b></div></div><div class="scroll"><table id="qrHistoryTable" class="qr-history report"></table></div><div id="qrFileReader" style="display:none"></div></div><div id="invoiceQrModal" class="qr-modal hide"><div class="qr-modal-body"><div class="qr-modal-head"><b>Scan Invoice QR / बिल QR स्कैन करें</b><button class="qr-close" onclick="closeInvoiceQrScanner()">Close</button></div><div id="qrStatus" class="qr-status qr-warn">Ready.</div><div id="qrReader" class="qr-reader"></div><div id="qrConfirm" class="qr-confirm"></div></div></div>');
    if(e('qrFilterDate')&&!qrFilterDate.value)qrFilterDate.value=todayKey();renderInvoiceQr();
  }
  function installInvoiceQr(){
    const oldPersist=window.persistLocalState;window.persistLocalState=function(){oldPersist&&oldPersist();try{localStorage.indaneInvoiceQrScans=JSON.stringify(invoiceQrScans)}catch(_){}};
    const oldPayload=window.portalStatePayload;window.portalStatePayload=function(){let d=oldPayload?oldPayload():{};d.invoiceQrScans=invoiceQrScans;return d};
    const oldApply=window.applyPortalState;window.applyPortalState=function(d){oldApply&&oldApply(d);invoiceQrScans=d?.invoiceQrScans||invoiceQrScans;window.invoiceQrScans=invoiceQrScans;persistLocalState();renderInvoiceQr()};
    const oldRender=window.renderInventory;window.renderInventory=function(){oldRender&&oldRender();ensureInvoiceQrUi();ensureGateOutQrButton();renderInvoiceQr()};
    const oldShow=window.show;window.show=function(id){oldShow&&oldShow(id);if(id==='inventory'){ensureInvoiceQrUi();ensureGateOutQrButton();renderInvoiceQr()}};
    const oldAll=window.renderAll;window.renderAll=function(){oldAll&&oldAll();ensureInvoiceQrUi();ensureGateOutQrButton();renderInvoiceQr()};
  }
  Object.assign(window,{invoiceQrParser,invoiceQrDuplicateCheck:duplicateCheck,prepareGateOutQrScan,openInvoiceQrScanner,closeInvoiceQrScanner,stopInvoiceQrScanner,scanInvoiceQrFile,scanInvoiceQrModalFile,manualInvoiceQrEntry,saveInvoiceQrScan,autoFillGateFromQr,renderInvoiceQr,deleteInvoiceQr,exportInvoiceQr});
  installInvoiceQr();ensureInvoiceQrUi();ensureGateOutQrButton();renderInvoiceQr();
})();
