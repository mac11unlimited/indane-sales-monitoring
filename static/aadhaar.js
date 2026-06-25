(function(){
  const PMUY_TYPES=new Set(['EMPUY','EPMUY','EPMUY-2.0','PMUY','UJJWALA2']);
  const NPMUY_TYPES=new Set(['NON-PMUY','NON PMUY','NPMUY']);
  const SUBSIDY_OK=new Set(['BTC','CTC']);
  const BIO_AUTH=new Set(['BIOMETRIC','BIOMETRIC-FACE','BIOMETRIC-FINGER','BIOMETRIC-FINGERPRINT','BIOMETRIC-IRIS']);
  window.aadhaarReports=JSON.parse(localStorage.indaneAadhaarReports||'{}');

  function e(id){return document.getElementById(id)}
  function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
  function n(v){let x=parseFloat(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0}
  function keyText(s){return String(s||'').trim().toUpperCase().replace(/\s+/g,' ')}
  function normKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function localToday(){return typeof today==='string'?today:new Date().toISOString().slice(0,10)}
  function addDays(d,days){let p=String(d).split('-').map(Number),x=new Date(p[0],p[1]-1,p[2]);x.setDate(x.getDate()+days);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
  function dateLabel(d){return typeof ddmmyyyy==='function'?ddmmyyyy(d,'.'):String(d||'').split('-').reverse().join('.')}
  function isoDate(v){let s=String(v??'').trim();if(!s)return'';let m=s.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);if(m)return m[1]+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[3]).padStart(2,'0');m=s.match(/(\d{1,2})[-./](\d{1,2})[-./](20\d{2}|\d{2})/);if(m){let y=+m[3];if(y<100)y+=2000;return y+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[1]).padStart(2,'0')}return''}
  function reportDateFromFile(file){return isoDate(file?.name)||localToday()}
  function headerIndex(rows){return Math.max(0,rows.findIndex(r=>r.some(c=>/customer\s*strength/i.test(String(c||'')))&&r.some(c=>/auth[_\s-]*method/i.test(String(c||'')))&&r.some(c=>/customer\s*type/i.test(String(c||'')))))}
  function uniqueHeads(heads){let seen={};return heads.map(h=>{let b=String(h||'Column').trim()||'Column';seen[b]=(seen[b]||0)+1;return seen[b]===1?b:b+' '+seen[b]})}
  function col(row,names){let keys=Object.keys(row),want=names.map(normKey);let k=keys.find(x=>want.includes(normKey(x)))||keys.find(x=>want.some(w=>normKey(x).includes(w)));return k?row[k]:''}
  function normalizeIdo(area){let s=String(area||'').trim();if(!s)return'Unmapped IDO';let u=s.toLowerCase();if(u.includes('agra'))return'Agra IDO';if(u.includes('bareilly')||u.includes('barielly'))return'Bareilly IDO';if(u.includes('dehradun'))return'Dehradun IDO';if(u.includes('noida'))return'Noida IDO';return s.replace(/\s*indane\s*do.*$/i,' IDO').replace(/\s*lpg.*$/i,'').trim()}
  function parseObjects(matrix){let h=headerIndex(matrix),heads=uniqueHeads((matrix[h]||[]).map(x=>String(x||'').trim()));return matrix.slice(h+1).map(r=>{let o={};heads.forEach((head,i)=>o[head]=r[i]??'');return o}).filter(o=>Object.values(o).some(v=>String(v||'').trim()))}
  async function xlsxSheetRows(file,sheetName){
    let entries=await unzipEntries(await file.arrayBuffer()),shared=parseSharedStrings(entries['xl/sharedStrings.xml']);
    let workbook=entries['xl/workbook.xml']||'',rels=entries['xl/_rels/workbook.xml.rels']||'';
    let sheets=[...workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m=>({name:m[1],rid:m[2]}));
    let picked=sheets.find(s=>s.name.toLowerCase()===sheetName.toLowerCase())||sheets.find(s=>/sheet1/i.test(s.name))||sheets[0];
    if(!picked)throw new Error('No worksheet found in XLSX file');
    let re=new RegExp('<Relationship[^>]*Id="'+picked.rid+'"[^>]*Target="([^"]+)"'),m=rels.match(re),target=m?m[1]:'worksheets/sheet1.xml';
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
  async function aadhaarMatrix(file){
    let name=String(file.name||'').toLowerCase();
    if(name.endsWith('.xlsx')||name.endsWith('.xlsm'))return await xlsxSheetRows(file,'Sheet1');
    return parseDelimitedRows(await readTextSmart(file));
  }
  function blankAgg(label,level,sort){return{label,level,sort,A:0,B:0,D:0,E:0}}
  function addAgg(agg,row){
    let qty=n(col(row,['Customer Strength','Strength','Sum of Customer Strength'])),auth=keyText(col(row,['AUTH_METHOD','AUTH METHOD','Authentication Method'])),ct=keyText(col(row,['Customer Type'])),sub=keyText(col(row,['Subsidy Trans Flag','Subsidy Trabs Flag','Subsidy Flag']));
    let pmuy=PMUY_TYPES.has(ct),npmuy=NPMUY_TYPES.has(ct)||ct==='NON-PMUY',subOk=SUBSIDY_OK.has(sub),bio=BIO_AUTH.has(auth);
    if(pmuy&&subOk)agg.A+=qty;
    if(npmuy&&subOk)agg.B+=qty;
    if(pmuy&&bio)agg.D+=qty;
    if(npmuy&&bio)agg.E+=qty;
  }
  function buildAadhaarReport(rows){
    let idos={},lsas={};
    rows.forEach(row=>{
      let ido=normalizeIdo(col(row,['Area Office','Sales Office','IDO'])),lsa=String(col(row,['Sales Area','LSA','LPG Sales Area'])||'Unmapped LSA').trim()||'Unmapped LSA';
      idos[ido]??=blankAgg(ido,'IDO',ido);lsas[ido+'|'+lsa]??=blankAgg(lsa,'LSA',ido+'|'+lsa);
      addAgg(idos[ido],row);addAgg(lsas[ido+'|'+lsa],row);
    });
    let out=[];
    Object.keys(idos).sort().forEach(ido=>{out.push(idos[ido]);Object.values(lsas).filter(x=>x.sort.startsWith(ido+'|')).sort((a,b)=>a.label.localeCompare(b.label)).forEach(x=>out.push(x))});
    return out.map(r=>{let C=r.A+r.B,F=r.D+r.E;return{...r,C,F,G:r.A?r.D/r.A:0,H:r.B?r.E/r.B:0,I:C?F/C:0}});
  }
  function reportsInRange(from,to){return Object.entries(aadhaarReports||{}).filter(([d])=>(!from||d>=from)&&(!to||d<=to)).sort(([a],[b])=>a.localeCompare(b))}
  function aggregateReports(from,to){
    let rows=reportsInRange(from,to).flatMap(([,r])=>r.rows||[]),by={};
    rows.forEach(r=>{let k=r.level+'|'+r.sort+'|'+r.label;by[k]??=blankAgg(r.label,r.level,r.sort);['A','B','D','E'].forEach(c=>by[k][c]+=+r[c]||0)});
    let out=Object.values(by).sort((a,b)=>a.sort.localeCompare(b.sort)||a.level.localeCompare(b.level));
    return out.map(r=>{let C=r.A+r.B,F=r.D+r.E;return{...r,C,F,G:r.A?r.D/r.A:0,H:r.B?r.E/r.B:0,I:C?F/C:0}});
  }
  async function uploadAadhaarReport(){
    if(typeof canEditReports==='function'&&!canEditReports())return alert('View-only user cannot upload Aadhaar Authentication report');
    let file=e('aadhaarUpload')?.files?.[0];if(!file)return alert('Select Aadhaar Authentication Excel/CSV first');
    let selected=e('aadhaarDate')?.value||reportDateFromFile(file),date=selected||localToday();
    try{
      let matrix=await aadhaarMatrix(file),raw=parseObjects(matrix);
      if(!raw.length)throw new Error('No Sheet1 raw rows detected. Required headers: Customer Strength, AUTH_METHOD, Area Office, Sales Area, Customer Type, Subsidy Trans Flag.');
      if(aadhaarReports[date]&&!confirm('Aadhaar Authentication data already exists for '+dateLabel(date)+'. Fresh upload will overwrite that date. Continue?'))return;
      let rows=buildAadhaarReport(raw);
      aadhaarReports[date]={date,file:file.name,uploadedAt:new Date().toLocaleString('en-IN'),rows,rawRows:raw.length,user:user?.id||''};
      save();renderAadhaarUploadStatus();renderDashboard();
      alert('Aadhaar Authentication Report uploaded successfully: '+file.name+'\nPosting date: '+dateLabel(date)+'\nRaw rows read: '+raw.length+'\nReport rows generated: '+rows.length+'\nDashboard refreshed live.');
    }catch(err){alert('Aadhaar Authentication upload failed: '+(err.message||err))}
  }
  function pct(x){return ((+x||0)*100).toFixed(1)+'%'}
  function fmt(x){return Math.round(+x||0).toLocaleString('en-IN')}
  function aadhaarRowHtml(r,total=false){return'<tr class="'+(total?'aadh-total':r.level==='IDO'?'aadh-ido':'aadh-lsa')+'"><td>'+esc(total?'UPSO II Total':r.label)+'</td><td>'+fmt(r.A)+'</td><td>'+fmt(r.B)+'</td><td>'+fmt(r.C)+'</td><td>'+fmt(r.D)+'</td><td>'+fmt(r.E)+'</td><td>'+fmt(r.F)+'</td><td>'+pct(r.G)+'</td><td>'+pct(r.H)+'</td><td>'+pct(r.I)+'</td></tr>'}
  function aadhaarDashboardHtml(){
    let defTo=e('dashTo')?.value||localToday(),defFrom=e('dashFrom')?.value||defTo;
    let from=e('aadhaarDashFrom')?.value||defFrom,to=e('aadhaarDashTo')?.value||defTo;if(from>to){let t=from;from=to;to=t}
    let rows=aggregateReports(from,to),total=rows.filter(r=>r.level==='IDO').reduce((a,r)=>{['A','B','D','E'].forEach(c=>a[c]+=+r[c]||0);return a},blankAgg('UPSO II Total','TOTAL',''));
    total.C=total.A+total.B;total.F=total.D+total.E;total.G=total.A?total.D/total.A:0;total.H=total.B?total.E/total.B:0;total.I=total.C?total.F/total.C:0;
    let available=Object.keys(aadhaarReports||{}).sort(),status=available.length?'Available report dates: '+available.map(dateLabel).join(', '):'No Aadhaar Authentication report uploaded yet.';
    let top=rows.filter(r=>r.level==='IDO'),max=Math.max(1,...top.map(r=>r.I));
    let bars='<div class="aadh-bars">'+top.map(r=>'<div><span>'+esc(r.label)+'</span><i><b style="width:'+Math.max(3,r.I/max*100)+'%"></b></i><strong>'+pct(r.I)+'</strong></div>').join('')+'</div>';
    return '<div class="card aadh-card"><div class="aadh-head"><h2>Aadhaar Authentication Report</h2><p>PMUY / Non-PMUY customer strength and eKYC completion, generated automatically from uploaded Sheet1 raw data.</p></div><div class="toolbar no-print"><b>Date Range</b><input id="aadhaarDashFrom" type="date" class="field" style="max-width:160px" value="'+from+'" onchange="renderDashboard()"><input id="aadhaarDashTo" type="date" class="field" style="max-width:160px" value="'+to+'" onchange="renderDashboard()"><button onclick="exportTable(\'aadhaarReportTable\',\'aadhaar-authentication-report.csv\')">Download Aadhaar Report</button><span class="small">'+status+'</span></div><div class="aadh-kpis"><div><span>Total Customer Strength</span><b>'+fmt(total.C)+'</b></div><div><span>eKYC Completed</span><b>'+fmt(total.F)+'</b></div><div><span>Total Completion</span><b>'+pct(total.I)+'</b></div><div><span>PMUY Completion</span><b>'+pct(total.G)+'</b></div></div><div class="aadh-grid"><div class="scroll"><table id="aadhaarReportTable" class="report aadh-table"><tr><th rowspan="2">IDO / LSA</th><th colspan="3">Customer Strength</th><th colspan="3">eKYC Completed</th><th colspan="3">Achievement %</th></tr><tr><th>PMUY</th><th>nPMUY</th><th>Total</th><th>PMUY</th><th>nPMUY</th><th>Total</th><th>PMUY %</th><th>nPMUY %</th><th>Total %</th></tr>'+rows.map(r=>aadhaarRowHtml(r,false)).join('')+aadhaarRowHtml(total,true)+'</table></div><div class="aadh-panel"><h3>IDO-wise eKYC Completion</h3>'+bars+'<p class="small">Filters applied: Customer Type PMUY group / Non-PMUY, Subsidy BTC/CTC for strength, biometric methods for eKYC completed.</p></div></div></div>';
  }
  function renderAadhaarUploadStatus(){
    let dates=Object.keys(aadhaarReports||{}).sort();
    if(e('aadhaarStatus'))aadhaarStatus.className='alert '+(dates.length?'ok':'');
    if(e('aadhaarStatus'))aadhaarStatus.innerHTML=dates.length?'<b>Aadhaar reports uploaded:</b> '+dates.map(dateLabel).join(', ')+'<br><b>Latest:</b> '+(aadhaarReports[dates.at(-1)]?.file||'')+' | Rows: '+(aadhaarReports[dates.at(-1)]?.rawRows||0):'No Aadhaar Authentication report uploaded.';
  }
  function ensureAadhaarUploadUi(){
    let upload=e('upload');if(!upload||e('aadhaarUploadCard'))return;
    let anchor=e('salesSeedTable')?.closest('.card')||upload.lastElementChild;
    anchor.insertAdjacentHTML('beforebegin','<div id="aadhaarUploadCard" class="card"><h2>Aadhaar Authentication Report Upload</h2><p class="small">Upload raw Sheet1 from Aadhaar Authentication Report. The portal applies PMUY/nPMUY, Subsidy Flag and biometric filters automatically and displays the output on Dashboard Table View.</p><div class="toolbar"><input id="aadhaarDate" type="date" class="field" style="max-width:160px"><input id="aadhaarUpload" type="file" accept=".xlsx,.xlsm,.csv,.txt,.tsv"><button class="orange" onclick="uploadAadhaarReport()">Upload Aadhaar Report</button><button class="light" onclick="renderDashboard()">Refresh Aadhaar Dashboard</button></div><div id="aadhaarStatus" class="alert">No Aadhaar Authentication report uploaded.</div></div>');
    if(e('aadhaarDate')&&!aadhaarDate.value)aadhaarDate.value=localToday();
    renderAadhaarUploadStatus();
  }
  function installAadhaarOverrides(){
    const oldPersist=window.persistLocalState;window.persistLocalState=function(){oldPersist&&oldPersist();try{localStorage.indaneAadhaarReports=JSON.stringify(aadhaarReports)}catch(_){}};
    const oldPayload=window.portalStatePayload;window.portalStatePayload=function(){let d=oldPayload?oldPayload():{};d.aadhaarReports=aadhaarReports;return d};
    const oldApply=window.applyPortalState;window.applyPortalState=function(d){oldApply&&oldApply(d);aadhaarReports=d?.aadhaarReports||aadhaarReports;window.aadhaarReports=aadhaarReports;persistLocalState();renderAadhaarUploadStatus()};
    const oldRenderUpload=window.renderUpload;window.renderUpload=function(){oldRenderUpload&&oldRenderUpload();ensureAadhaarUploadUi();renderAadhaarUploadStatus()};
    const oldShow=window.show;window.show=function(id){oldShow&&oldShow(id);if(id==='upload')ensureAadhaarUploadUi()};
    const oldRenderStatus=window.renderStatusTables;window.renderStatusTables=function(){oldRenderStatus&&oldRenderStatus();if(window.dashBody)dashBody.insertAdjacentHTML('beforeend',aadhaarDashboardHtml())};
    const oldRenderAll=window.renderAll;window.renderAll=function(){oldRenderAll&&oldRenderAll();ensureAadhaarUploadUi()};
  }
  function installChatHelp(){try{const old=window.portalBotAnswer;window.portalBotAnswer=function(q){let s=String(q||'').toLowerCase();if(/aadhaar|aadhar|authentication|ekyc|kyc/.test(s))return 'Upload Aadhaar Authentication Report from Daily Report Upload. The portal reads Sheet1 raw rows and applies the same filters as your manual pivot: PMUY/nPMUY strength with BTC/CTC subsidy flags and biometric eKYC completion. Dashboard Table View shows the Aadhaar Authentication Report with date range filter.';return old?old(q):'Portal help is loading.'}}catch(_){}}
  function initAadhaar(){Object.assign(window,{uploadAadhaarReport,renderAadhaarUploadStatus});installAadhaarOverrides();installChatHelp();ensureAadhaarUploadUi()}
  initAadhaar();
})();
