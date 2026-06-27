(function(){
  window.digitalDacReports=JSON.parse(localStorage.indaneDigitalDacReports||'{}');
  window.digitalDacDashRange=JSON.parse(localStorage.indaneDigitalDacDashRange||'{}');

  function e(id){return document.getElementById(id)}
  function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
  function n(v){let x=parseFloat(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0}
  function normKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function keyText(s){return String(s||'').trim().toUpperCase().replace(/\s+/g,' ')}
  function localToday(){return typeof today==='string'?today:new Date().toISOString().slice(0,10)}
  function dateLabel(d){return typeof ddmmyyyy==='function'?ddmmyyyy(d,'.'):String(d||'').split('-').reverse().join('.')}
  function isoDate(v){
    if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
    let s=String(v??'').trim();if(!s)return'';
    if(/^\d{5}(\.\d+)?$/.test(s)){let base=new Date(Date.UTC(1899,11,30));base.setUTCDate(base.getUTCDate()+Math.floor(+s));return base.getUTCFullYear()+'-'+String(base.getUTCMonth()+1).padStart(2,'0')+'-'+String(base.getUTCDate()).padStart(2,'0')}
    let m=s.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);if(m)return m[1]+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[3]).padStart(2,'0');
    m=s.match(/(\d{1,2})[-./](\d{1,2})[-./](20\d{2}|\d{2})/);if(m){let y=+m[3];if(y<100)y+=2000;return y+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[1]).padStart(2,'0')}
    return'';
  }
  function col(row,names){let keys=Object.keys(row),want=names.map(normKey);let k=keys.find(x=>want.includes(normKey(x)))||keys.find(x=>want.some(w=>normKey(x).includes(w)));return k?row[k]:''}
  function uniqueHeads(heads){let seen={};return heads.map(h=>{let b=String(h||'Column').trim()||'Column';seen[b]=(seen[b]||0)+1;return seen[b]===1?b:b+' '+seen[b]})}
  function headerIndex(rows){return Math.max(0,rows.findIndex(r=>r.some(c=>/^date$/i.test(String(c||'').trim()))&&r.some(c=>/number\s*of\s*orders/i.test(String(c||'')))&&r.some(c=>/digital\s*bookings/i.test(String(c||'')))))}
  function parseObjects(matrix){let h=headerIndex(matrix),heads=uniqueHeads((matrix[h]||[]).map(x=>String(x||'').trim()));return matrix.slice(h+1).map(r=>{let o={};heads.forEach((head,i)=>o[head]=r[i]??'');return o}).filter(o=>Object.values(o).some(v=>String(v||'').trim()))}
  function normalizeIdo(area){let s=String(area||'').trim();if(!s)return'Unmapped IDO';let u=s.toLowerCase();if(u.includes('agra'))return'Agra IDO';if(u.includes('bareilly')||u.includes('barielly'))return'Bareilly IDO';if(u.includes('dehradun'))return'Dehradun IDO';if(u.includes('noida'))return'Noida IDO';return s.replace(/\s*indane\s*do.*$/i,' IDO').replace(/\s*lpg.*$/i,'').trim()}
  async function xlsxSheetRows(file){
    let entries=await unzipEntries(await file.arrayBuffer()),shared=parseSharedStrings(entries['xl/sharedStrings.xml']);
    let workbook=entries['xl/workbook.xml']||'',rels=entries['xl/_rels/workbook.xml.rels']||'';
    let sheet=([...workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m=>({name:m[1],rid:m[2]}))[0]);
    if(!sheet)throw new Error('No worksheet found in workbook');
    let re=new RegExp('<Relationship[^>]*Id="'+sheet.rid+'"[^>]*Target="([^"]+)"'),m=rels.match(re),target=m?m[1]:'worksheets/sheet1.xml';
    target=target.replace(/^\/?/,'').replace(/^xl\//,'');
    let xml=entries['xl/'+target]||entries[target]||entries['xl/worksheets/sheet1.xml'];
    if(!xml)throw new Error('Sheet1 could not be read from workbook.');
    let rows=[];
    for(let rm of xml.matchAll(/<row[^>]*>[\s\S]*?<\/row>/g)){
      let arr=[];
      for(let cm of rm[0].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)){
        let attr=cm[1],body=cm[2],idx=colIndex((attr.match(/r="([A-Z]+)\d+"/)||[])[1]),type=(attr.match(/t="([^"]+)"/)||[])[1],raw=xmlTagText(body,'v');
        arr[idx]=type==='s'?shared[+raw]||'':type==='inlineStr'?unxml(body):unxml(raw);
      }
      if(arr.some(x=>String(x||'').trim()))rows.push(arr.map(x=>x??''));
    }
    return rows;
  }
  async function digitalMatrix(file){
    let name=String(file.name||'').toLowerCase();
    if(name.endsWith('.xlsx')||name.endsWith('.xlsm'))return await xlsxSheetRows(file);
    return parseDelimitedRows(await readTextSmart(file));
  }
  function blankAgg(label,level,sort,date){return{label,level,sort,date,orders:0,digital:0,dac:0,manual:0}}
  function addAgg(a,row,fallbackDate){
    let orders=n(col(row,['Number of Orders','Orders'])),digital=keyText(col(row,['Digital Bookings','Digital Booking'])),confirm=keyText(col(row,['Order confirmation type','Order Confirmation Type','Confirmation Type']));
    a.orders+=orders;
    if(digital.includes('DIGITAL')&&!digital.includes('NON DIGITAL'))a.digital+=orders;
    if(confirm==='OTP')a.dac+=orders;else if(confirm==='SIEBEL'||confirm==='OVERRIDE'||confirm)a.manual+=orders;
  }
  function buildDigitalReport(raw,fallbackDate){
    let by={};
    raw.forEach(row=>{
      let d=isoDate(col(row,['Date']))||fallbackDate||localToday(),ido=normalizeIdo(col(row,['Area Office','Sales Office','IDO'])),lsa=String(col(row,['Sales Area','LSA','LPG Sales Area'])||'Unmapped LSA').trim()||'Unmapped LSA';
      let keys=[['IDO',ido,ido],['LSA',lsa,ido+'|'+lsa]];
      keys.forEach(([level,label,sort])=>{let k=d+'|'+level+'|'+sort+'|'+label;by[k]??=blankAgg(label,level,sort,d);addAgg(by[k],row,fallbackDate)});
    });
    return Object.values(by).map(x=>({...x,digitalPct:x.orders?x.digital/x.orders:0,dacPct:x.orders?x.dac/x.orders:0})).sort((a,b)=>a.date.localeCompare(b.date)||a.sort.localeCompare(b.sort)||a.level.localeCompare(b.level));
  }
  function normalizeDigitalReports(){let fixed={};Object.entries(digitalDacReports||{}).forEach(([d,v])=>{let day=isoDate(v?.date)||isoDate(d);if(day)fixed[day]={...(v||{}),date:day}});digitalDacReports=fixed;window.digitalDacReports=fixed;try{localStorage.indaneDigitalDacReports=JSON.stringify(fixed)}catch(_){}return fixed}
  function reportsInRange(from,to){normalizeDigitalReports();from=isoDate(from);to=isoDate(to);return Object.entries(digitalDacReports||{}).filter(([d])=>(!from||d>=from)&&(!to||d<=to)).sort(([a],[b])=>a.localeCompare(b))}
  function aggregateRows(rows){let by={};rows.forEach(r=>{let k=r.level+'|'+r.sort+'|'+r.label;by[k]??=blankAgg(r.label,r.level,r.sort,'');['orders','digital','dac','manual'].forEach(c=>by[k][c]+=+r[c]||0)});return Object.values(by).map(x=>({...x,digitalPct:x.orders?x.digital/x.orders:0,dacPct:x.orders?x.dac/x.orders:0})).sort((a,b)=>a.sort.localeCompare(b.sort)||a.level.localeCompare(b.level))}
  async function uploadDigitalDacReport(){
    if(typeof canEditReports==='function'&&!canEditReports())return alert('View-only user cannot upload Digital Booking and DAC report');
    let file=e('digitalDacUpload')?.files?.[0];if(!file)return alert('Select Verified Refill Delivery Excel/CSV first');
    let fallback=isoDate(e('digitalDacDate')?.value)||localToday();
    try{
      let matrix=await digitalMatrix(file),raw=parseObjects(matrix);
      if(!raw.length)throw new Error('No raw rows detected. Required headers: Date, Area Office, Sales Area, Order confirmation type, Number of Orders, Digital Bookings.');
      let rows=buildDigitalReport(raw,fallback),dates=[...new Set(rows.map(r=>r.date))].sort();
      if(!dates.length)throw new Error('No valid Date values found. Select posting date and retry.');
      if(dates.some(d=>digitalDacReports[d])&&!confirm('Digital Booking / DAC data already exists for one or more uploaded dates. Fresh upload will overwrite those dates. Continue?'))return;
      dates.forEach(d=>{let dayRows=rows.filter(r=>r.date===d);digitalDacReports[d]={date:d,file:file.name,uploadedAt:new Date().toLocaleString('en-IN'),rows:dayRows,rawRows:raw.filter(r=>(isoDate(col(r,['Date']))||fallback)===d).length,user:user?.id||''}});
      digitalDacDashRange={from:dates[0],to:dates.at(-1)};window.digitalDacDashRange=digitalDacDashRange;try{localStorage.indaneDigitalDacDashRange=JSON.stringify(digitalDacDashRange)}catch(_){}
      save();renderDigitalDacUploadStatus();renderDashboard();
      alert('Digital Booking and DAC Report uploaded successfully: '+file.name+'\nReport dates: '+dates.map(dateLabel).join(', ')+'\nRaw rows read: '+raw.length+'\nDashboard refreshed live.');
    }catch(err){alert('Digital Booking / DAC upload failed: '+(err.message||err))}
  }
  function pct(x){return ((+x||0)*100).toFixed(1)+'%'}
  function pctHtml(x){let cls=(+x||0)<.95?' class="dac-low-pct"':'';return '<span'+cls+'>'+pct(x)+'</span>'}
  function fmt(x){return Math.round(+x||0).toLocaleString('en-IN')}
  function perfClass(r){let m=Math.min(+r.digitalPct||0,+r.dacPct||0);return m>=.95?'dac-good':m>=.9?'dac-watch':'dac-risk'}
  function setDigitalDacDashRange(which,value){let d=isoDate(value);if(!d)return;digitalDacDashRange={...(digitalDacDashRange||{}),[which]:d};if(digitalDacDashRange.from&&digitalDacDashRange.to&&digitalDacDashRange.from>digitalDacDashRange.to){if(which==='from')digitalDacDashRange.to=digitalDacDashRange.from;else digitalDacDashRange.from=digitalDacDashRange.to}window.digitalDacDashRange=digitalDacDashRange;try{localStorage.indaneDigitalDacDashRange=JSON.stringify(digitalDacDashRange)}catch(_){}renderDashboard()}
  function rowHtml(r,total=false){let cls=total?'dac-total':(r.level==='IDO'?'dac-ido ':'dac-lsa ')+perfClass(r);return'<tr class="'+cls+'"><td>'+esc(total?'UPSO II Total':r.label)+'</td><td>'+fmt(r.orders)+'</td><td>'+fmt(r.digital)+'</td><td>'+pctHtml(r.digitalPct)+'</td><td>'+fmt(r.dac)+'</td><td>'+fmt(r.manual)+'</td><td>'+pctHtml(r.dacPct)+'</td></tr>'}
  function dailyTrendHtml(selected){
    let idos=['Agra IDO','Bareilly IDO','Dehradun IDO','Noida IDO'];
    let rows=selected.map(([d,rpt])=>{let day=aggregateRows((rpt.rows||[]).filter(r=>r.level==='IDO')),map={};day.forEach(r=>map[r.label]=r);return'<tr><td class="dac-date">'+dateLabel(d)+'</td>'+idos.map(ido=>{let r=map[ido]||blankAgg(ido,'IDO',ido,d);r.digitalPct=r.orders?r.digital/r.orders:0;r.dacPct=r.orders?r.dac/r.orders:0;return'<td class="'+perfClass(r)+'"><div class="dac-mini"><b>D '+pctHtml(r.digitalPct)+'</b><b>DAC '+pctHtml(r.dacPct)+'</b><span>'+fmt(r.orders)+' orders</span></div></td>'}).join('')+'</tr>'}).join('');
    return'<div class="dac-panel"><h3>Date-wise Digital Booking and DAC Trend</h3><div class="scroll"><table class="report dac-trend"><tr><th>Date</th>'+idos.map(x=>'<th>'+x+'</th>').join('')+'</tr>'+rows+'</table></div></div>';
  }
  function barPanel(cum){
    let top=cum.filter(r=>r.level==='IDO'),max=Math.max(1,...top.map(r=>Math.max(r.digitalPct,r.dacPct)));
    let bars='<div class="dac-bars">'+top.map(r=>'<div class="'+perfClass(r)+'"><span>'+esc(r.label)+'</span><i><b style="width:'+Math.max(3,Math.max(r.digitalPct,r.dacPct)/max*100)+'%"></b></i><strong>D '+pctHtml(r.digitalPct)+'</strong><strong>DAC '+pctHtml(r.dacPct)+'</strong></div>').join('')+'</div>';
    return'<div class="dac-panel"><h3>IDO-wise Cumulative Achievement</h3>'+bars+'<div class="dac-note">Any Digital Booking % or DAC % below 95% is highlighted for immediate follow-up.</div></div>';
  }
  function digitalDacDashboardHtml(){
    normalizeDigitalReports();
    let available=Object.keys(digitalDacReports||{}).sort(),latest=available.at(-1)||localToday();
    let from=isoDate(digitalDacDashRange?.from)||latest,to=isoDate(digitalDacDashRange?.to)||latest;if(from>to){let t=from;from=to;to=t}
    let selected=reportsInRange(from,to),flat=selected.flatMap(([,r])=>r.rows||[]),cum=aggregateRows(flat),total=cum.filter(r=>r.level==='IDO').reduce((a,r)=>{['orders','digital','dac','manual'].forEach(c=>a[c]+=+r[c]||0);return a},blankAgg('UPSO II Total','TOTAL',''));
    total.digitalPct=total.orders?total.digital/total.orders:0;total.dacPct=total.orders?total.dac/total.orders:0;
    let status=available.length?'Available report dates: '+available.map(dateLabel).join(', '):'No Digital Booking / DAC report uploaded yet.';
    let rangeStatus=selected.length?'<span class="aadh-ok">Showing '+selected.length+' uploaded report date(s): '+selected.map(([d])=>dateLabel(d)).join(', ')+'</span>':'<span class="aadh-miss">No Digital Booking / DAC upload found for '+dateLabel(from)+' to '+dateLabel(to)+'. Upload the report for this date/range or change selection.</span>';
    return'<div class="card dac-card"><div class="dac-head"><h2>Digital Booking and DAC Report</h2><p>Verified refill delivery analysis from raw upload: Digital Booking % and OTP-based DAC confirmation by IDO / LSA.</p></div><div class="toolbar no-print"><b>Date Range</b><input id="digitalDacFrom" type="date" class="field" style="max-width:160px" value="'+from+'" onchange="setDigitalDacDashRange(\'from\',this.value)"><input id="digitalDacTo" type="date" class="field" style="max-width:160px" value="'+to+'" onchange="setDigitalDacDashRange(\'to\',this.value)"><button onclick="exportTable(\'digitalDacCumulativeTable\',\'digital-booking-dac-report.csv\')">Download Digital/DAC Report</button><span class="small">'+status+'</span></div><div class="aadh-range">'+rangeStatus+'</div><div class="dac-kpis"><div><span>Total Orders</span><b>'+fmt(total.orders)+'</b><em>Selected period</em></div><div><span>Digital Booking %</span><b>'+pctHtml(total.digitalPct)+'</b><em>'+fmt(total.digital)+' digital orders</em></div><div><span>DAC %</span><b>'+pctHtml(total.dacPct)+'</b><em>'+fmt(total.dac)+' OTP confirmations</em></div><div><span>Manual Non-DAC</span><b>'+fmt(total.manual)+'</b><em>Siebel / Override</em></div></div>'+dailyTrendHtml(selected)+'<div class="dac-panels">'+barPanel(cum)+'</div><div class="dac-table-wrap"><table id="digitalDacCumulativeTable" class="report dac-table"><tr><th colspan="7">Cumulative Digital Booking and DAC Performance - '+dateLabel(from)+' to '+dateLabel(to)+'</th></tr><tr><th>IDO / LSA</th><th>Total Orders</th><th>Digital Orders</th><th>Digital Booking %</th><th>DAC OTP Orders</th><th>Manual Orders</th><th>DAC %</th></tr>'+cum.map(r=>rowHtml(r,false)).join('')+rowHtml(total,true)+'</table></div></div>';
  }
  function renderDigitalDacUploadStatus(){normalizeDigitalReports();let dates=Object.keys(digitalDacReports||{}).sort();if(e('digitalDacStatus'))digitalDacStatus.className='alert '+(dates.length?'ok':'');if(e('digitalDacStatus'))digitalDacStatus.innerHTML=dates.length?'<b>Digital Booking / DAC reports uploaded:</b> '+dates.map(dateLabel).join(', ')+'<br><b>Latest:</b> '+(digitalDacReports[dates.at(-1)]?.file||''):'No Digital Booking / DAC report uploaded.'}
  function ensureDigitalDacUploadUi(){
    let upload=e('upload');if(!upload||e('digitalDacUploadCard'))return;
    let anchor=e('aadhaarUploadCard')||e('salesSeedTable')?.closest('.card')||upload.lastElementChild;
    anchor.insertAdjacentHTML('afterend','<div id="digitalDacUploadCard" class="card"><h2>Digital Booking and DAC Report Upload</h2><p class="small">Upload Verified Refill Delivery raw report. The portal calculates Digital Booking % from Digital Bookings and DAC % from OTP confirmation type.</p><div class="toolbar"><input id="digitalDacDate" type="date" class="field" style="max-width:160px"><input id="digitalDacUpload" type="file" accept=".xlsx,.xlsm,.csv,.txt,.tsv"><button class="orange" onclick="uploadDigitalDacReport()">Upload Digital/DAC Report</button><button class="light" onclick="renderDashboard()">Refresh Digital/DAC Dashboard</button></div><div id="digitalDacStatus" class="alert">No Digital Booking / DAC report uploaded.</div></div>');
    if(e('digitalDacDate')&&!digitalDacDate.value)digitalDacDate.value=localToday();
    renderDigitalDacUploadStatus();
  }
  function installDigitalDacOverrides(){
    const oldPersist=window.persistLocalState;window.persistLocalState=function(){oldPersist&&oldPersist();try{localStorage.indaneDigitalDacReports=JSON.stringify(digitalDacReports);localStorage.indaneDigitalDacDashRange=JSON.stringify(digitalDacDashRange||{})}catch(_){}};
    const oldPayload=window.portalStatePayload;window.portalStatePayload=function(){let d=oldPayload?oldPayload():{};d.digitalDacReports=digitalDacReports;return d};
    const oldApply=window.applyPortalState;window.applyPortalState=function(d){oldApply&&oldApply(d);digitalDacReports=d?.digitalDacReports||digitalDacReports;window.digitalDacReports=digitalDacReports;normalizeDigitalReports();persistLocalState();renderDigitalDacUploadStatus()};
    const oldRenderUpload=window.renderUpload;window.renderUpload=function(){oldRenderUpload&&oldRenderUpload();ensureDigitalDacUploadUi();renderDigitalDacUploadStatus()};
    const oldShow=window.show;window.show=function(id){oldShow&&oldShow(id);if(id==='upload')ensureDigitalDacUploadUi()};
    const oldRenderStatus=window.renderStatusTables;window.renderStatusTables=function(){oldRenderStatus&&oldRenderStatus();if(window.dashBody)dashBody.insertAdjacentHTML('beforeend',digitalDacDashboardHtml())};
    const oldRenderAll=window.renderAll;window.renderAll=function(){oldRenderAll&&oldRenderAll();ensureDigitalDacUploadUi()};
  }
  function installChatHelp(){try{const old=window.portalBotAnswer;window.portalBotAnswer=function(q){let s=String(q||'').toLowerCase();if(/digital booking|dac|verified refill|otp|order confirmation/.test(s))return 'Upload Verified Refill Delivery from Daily Report Upload. Digital Booking % = Digital Booking orders / total orders. DAC % = OTP confirmation orders / total orders. Siebel and Override are treated as Manual / Non-DAC. Dashboard Table View shows date-wise and cumulative IDO/LSA performance.';return old?old(q):'Portal help is loading.'}}catch(_){}}
  function initDigitalDac(){normalizeDigitalReports();Object.assign(window,{uploadDigitalDacReport,renderDigitalDacUploadStatus,setDigitalDacDashRange});installDigitalDacOverrides();installChatHelp();ensureDigitalDacUploadUi()}
  initDigitalDac();
})();
