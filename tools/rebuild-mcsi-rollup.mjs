import fs from "node:fs";
import zlib from "node:zlib";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node tools/rebuild-mcsi-rollup.mjs <MCSI.xlsx> [more.xlsx]");
  process.exit(1);
}

const MATERIAL_PRODUCTS = {
  DOM_14_2_ALL: { kg: 14.2 },
  DOM_14_2_NONSUB: { kg: 14.2 },
  DOM_5_HOUSEHOLD: { kg: 5 },
  NDNE_ALL: { kg: 14.2 },
  NDNE_19: { kg: 19 },
  NDNE_47_5: { kg: 47.5 },
  NDNE_5: { kg: 5 },
  NDNE_425: { kg: 425 },
  XTRATEJ_ALL: { kg: 19 },
  XTRATEJ_19: { kg: 19 },
  XTRATEJ_47_5: { kg: 47.5 },
  NANOCUT_19: { kg: 19 },
  FTL_5: { kg: 5 },
  FTL_2: { kg: 2 },
  COMPOSITE_10: { kg: 10 },
  ALL_MATERIALS: { kg: 14.2 },
};

const MATERIAL_CODE_PRODUCT = {
  "89052": "DOM_14_2_NONSUB", M00087: "DOM_14_2_NONSUB", M00089: "DOM_14_2_NONSUB", M00090: "DOM_14_2_NONSUB", M00300: "DOM_14_2_NONSUB", M00302: "DOM_14_2_NONSUB", M00303: "DOM_14_2_NONSUB",
  "94053": "NDNE_19", M00002: "NDNE_19", M00010: "NDNE_19", M00011: "NDNE_19", M90092: "NDNE_19", M90061: "NDNE_19",
  "94047": "NDNE_47_5", M00065: "NDNE_47_5", M00067: "NDNE_47_5", M00068: "NDNE_47_5", M00069: "NDNE_47_5", M00071: "NDNE_47_5", M00072: "NDNE_47_5", M00965: "NDNE_47_5", M00969: "NDNE_47_5",
  "94055": "NDNE_5", M00104: "NDNE_5", M00106: "NDNE_5", M00107: "NDNE_5", M00305: "NDNE_5", M00307: "NDNE_5", M00308: "NDNE_5", M00320: "NDNE_5",
  "94056": "NDNE_425", M00140: "NDNE_425", M00142: "NDNE_425", M00143: "NDNE_425", M00150: "NDNE_425", M00152: "NDNE_425", M00153: "NDNE_425", M90140: "NDNE_425", M90150: "NDNE_425", M90160: "NDNE_425",
  "94853": "XTRATEJ_19", M00450: "XTRATEJ_19", M00452: "XTRATEJ_19", M00453: "XTRATEJ_19", M90450: "XTRATEJ_19", M90550: "XTRATEJ_19",
  "94247": "XTRATEJ_47_5", "94245": "XTRATEJ_47_5", M00250: "XTRATEJ_47_5", M00252: "XTRATEJ_47_5", M00253: "XTRATEJ_47_5", M00690: "XTRATEJ_47_5", M00692: "XTRATEJ_47_5", M00693: "XTRATEJ_47_5", M90164: "XTRATEJ_47_5",
  "94753": "NANOCUT_19", "94700": "NANOCUT_19", M00094: "NANOCUT_19", M00095: "NANOCUT_19", M00096: "NANOCUT_19", M90094: "NANOCUT_19",
  "94002": "FTL_5", M00215: "FTL_5", M00216: "FTL_5", M00217: "FTL_5", M00218: "FTL_5", M00219: "FTL_5", M00333: "FTL_5", M90215: "FTL_5", M90216: "FTL_5", M90217: "FTL_5", M90218: "FTL_5",
  M90417: "FTL_2", M90418: "FTL_2", M90419: "FTL_2", M00415: "FTL_2", M00416: "FTL_2", M00417: "FTL_2", M00418: "FTL_2", M00419: "FTL_2",
  M00710: "COMPOSITE_10", M00711: "COMPOSITE_10", M00712: "COMPOSITE_10", M00713: "COMPOSITE_10",
};

const out = {
  meta: {
    version: "mcsi-static-20260614-sap-net-v3",
    source: "MCSI static rollup with SAP net-weight reconciliation",
  },
  month_mt: {},
  day_mt: {},
  plant_day_mt: {},
  ido_day_mt: {},
  plant_ido_day_mt: {},
  product_day_mt: {},
  product_plant_day_mt: {},
  product_ido_day_mt: {},
  product_plant_ido_day_mt: {},
  rows: 0,
  detectedRows: 0,
  ignoredRows: 0,
  negativeRows: 0,
  returnRows: 0,
};

function unzipEntries(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const entries = {};
  for (let i = 0; i < buffer.length - 4; i++) {
    if (dv.getUint32(i, true) !== 0x04034b50) continue;
    const method = dv.getUint16(i + 8, true);
    const comp = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const name = buffer.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    const data = buffer.subarray(start, start + comp);
    entries[name] = method === 8 ? zlib.inflateRawSync(data).toString("utf8") : data.toString("utf8");
    i = start + comp - 1;
  }
  return entries;
}

function unxml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map((m) =>
    unxml(m[0].replace(/<t[^>]*>/g, "").replace(/<\/t>/g, "")),
  );
}

function colIndex(ref) {
  const match = String(ref || "").match(/[A-Z]+/i);
  const letters = match ? match[0].toUpperCase() : "A";
  let n = 0;
  for (const char of letters) n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}

function readXlsxRows(file) {
  const entries = unzipEntries(fs.readFileSync(file));
  const shared = parseSharedStrings(entries["xl/sharedStrings.xml"]);
  const workbook = entries["xl/workbook.xml"] || "";
  const rels = entries["xl/_rels/workbook.xml.rels"] || "";
  const firstSheetId = (workbook.match(/<sheet[^>]*r:id="([^"]+)"/) || [])[1];
  let target = "worksheets/sheet1.xml";
  if (firstSheetId) {
    const match = rels.match(new RegExp(`<Relationship[^>]*Id="${firstSheetId}"[^>]*Target="([^"]+)"`));
    if (match) target = match[1].replace(/^\//, "").replace(/^xl\//, "");
  }
  const xml = entries[`xl/${target}`] || entries[target] || entries["xl/worksheets/sheet1.xml"];
  if (!xml) throw new Error(`No worksheet XML found in ${file}`);
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>[\s\S]*?<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attr = cellMatch[1];
      const body = cellMatch[2];
      const idx = colIndex((attr.match(/r="([A-Z]+)\d+"/) || [])[1]);
      const type = (attr.match(/t="([^"]+)"/) || [])[1];
      const raw = (body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1] || "";
      row[idx] = type === "s" ? shared[Number(raw)] || "" : unxml(raw);
    }
    if (row.some((x) => String(x || "").trim())) rows.push(row.map((x) => x ?? ""));
  }
  return rows;
}

function normKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function uniqueHeaders(heads) {
  const seen = {};
  return heads.map((h) => {
    const base = String(h || "Column").trim() || "Column";
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base} ${seen[base]}`;
  });
}

function pickCol(row, names) {
  const keys = Object.keys(row);
  const want = names.map(normKey);
  const key = keys.find((x) => want.includes(normKey(x))) || keys.find((x) => want.some((w) => normKey(x).includes(w)));
  return key ? row[key] : "";
}

function num(value) {
  let s = String(value ?? "").trim().replace(/,/g, "").replace(/\u2212/g, "-");
  if (!s) return 0;
  let neg = false;
  if (/-$/.test(s)) {
    neg = true;
    s = s.replace(/-$/, "");
  }
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

function normalizeDate(value) {
  const s = String(value || "").trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  const serial = Number(s);
  if (serial > 30000) {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return "";
}

function normMatCode(value) {
  let s = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d+$/.test(s)) s = s.replace(/^0+/, "");
  return s;
}

function productRollupKeys(product) {
  const keys = [];
  if (!product) return keys;
  keys.push(product, "ALL_MATERIALS");
  if (product === "DOM_14_2_NONSUB") keys.push("DOM_14_2_ALL");
  if (product === "XTRATEJ_19" || product === "NANOCUT_19") keys.push("NDNE_19");
  if (product === "XTRATEJ_47_5") keys.push("NDNE_47_5");
  if (product.startsWith("NDNE_") || product.startsWith("XTRATEJ_") || product.startsWith("NANOCUT_") || product === "FTL_5" || product === "FTL_2" || product === "COMPOSITE_10") keys.push("NDNE_ALL");
  if (product.startsWith("XTRATEJ_")) keys.push("XTRATEJ_ALL");
  return [...new Set(keys)];
}

function isReturnMaterialText(text) {
  return /\b(RETRN|RETN|RETR|RET|RTRN|RETURN|DEFECT|DEFECTIVE|SUBQUNT|SUBSEQUENT)\b/i.test(String(text || ""));
}

function classifyMaterial(code, desc) {
  const c = normMatCode(code);
  const joined = `${c} ${String(desc || "").toUpperCase()}`;
  let product = MATERIAL_CODE_PRODUCT[c] || "";
  if (!product) {
    if (/PROPANE\s+NON\s+DOMESTIC/.test(joined)) product = "";
    else if (/14[., ]?2/.test(joined) || /DOM.*HH/.test(joined)) product = "DOM_14_2_NONSUB";
    else if (/XTRA.*TEJ.*47|47\.5.*XTRA/.test(joined)) product = "XTRATEJ_47_5";
    else if (/XTRA.*TEJ|XTRATEJ/.test(joined)) product = "XTRATEJ_19";
    else if (/NANOCUT/.test(joined)) product = "NANOCUT_19";
    else if (/47\.5/.test(joined)) product = "NDNE_47_5";
    else if (/425/.test(joined)) product = "NDNE_425";
    else if (/10.*COMPOSITE|XTRALITE/.test(joined)) product = "COMPOSITE_10";
    else if (/\b2\b.*(FTL|POINT OF SALE|POS)|\b2\s*KG/.test(joined)) product = "FTL_2";
    else if (/\b5\b.*(FTL|POINT OF SALE|POS)|5\.0.*(FTL|POINT OF SALE|POS)/.test(joined)) product = "FTL_5";
    else if (/\b5(?:\.0)?\s*KG.*(DOM|HOUSEHOLD|H\/H|N\/SUB)/.test(joined)) product = "DOM_5_HOUSEHOLD";
    else if (/\b19\b/.test(joined)) product = "NDNE_19";
  }
  return { product, keys: productRollupKeys(product), returnFlag: isReturnMaterialText(joined) };
}

function deleteDates(dates) {
  for (const date of dates) {
    const month = date.slice(0, 7);
    delete out.day_mt[date];
    delete out.plant_day_mt[date];
    delete out.ido_day_mt[date];
    delete out.plant_ido_day_mt[date];
    for (const group of [out.product_day_mt, out.product_plant_day_mt, out.product_ido_day_mt, out.product_plant_ido_day_mt]) {
      for (const store of Object.values(group || {})) delete store[date];
    }
    out.month_mt[month] = 0;
  }
}

function recomputeMonths(dates) {
  const months = [...new Set([...dates].map((d) => d.slice(0, 7)))];
  for (const month of months) {
    let total = 0;
    for (const [date, mt] of Object.entries(out.day_mt)) if (date.startsWith(`${month}-`)) total += Number(mt) || 0;
    if (total) out.month_mt[month] = total;
    else delete out.month_mt[month];
  }
}

function cleanPlantName(p) {
  return String(p || "Unknown Plant").replace(/\s+/g, " ").replace(/LPG BP\s*-\s*/i, "LPG BP -").trim();
}

function salesOfficeToIdo(value, region) {
  const s = String(value || "").trim();
  const r = String(region || "").toUpperCase();
  if (s === "1512") return "Bareilly IDO";
  if (s === "1514") return "Agra IDO";
  if (s === "1515") return "Noida IDO";
  if (s === "1516") return "Dehradun IDO";
  if (r === "UTK") return "Dehradun IDO";
  if (r === "UP") return "Noida IDO";
  return "";
}

function addNested(store, date, key1, key2, mt) {
  if (!date || !mt) return;
  if (!key1) {
    store[date] = (store[date] || 0) + mt;
    return;
  }
  store[date] ??= {};
  if (!key2) {
    store[date][key1] = (store[date][key1] || 0) + mt;
    return;
  }
  store[date][key1] ??= {};
  store[date][key1][key2] = (store[date][key1][key2] || 0) + mt;
}

function addProductMetric(group, product, date, key1, key2, mt) {
  group[product] ??= {};
  addNested(group[product], date, key1, key2, mt);
}

function processWorkbook(file) {
  const rows = readXlsxRows(file);
  const hidx = Math.max(0, rows.findIndex((r) => r.some((c) => /date/i.test(String(c || ""))) && r.some((c) => /net|kg|mt|cylinder|qty|quantity/i.test(String(c || "")))));
  const heads = uniqueHeaders((rows[hidx] || []).map((h) => String(h || "").trim()));
  const parsedRows = [];
  const fileDates = new Set();
  for (const vals of rows.slice(hidx + 1)) {
    out.rows++;
    const row = {};
    heads.forEach((h, i) => (row[h] = vals[i] ?? ""));
    const matText = pickCol(row, ["Material", "Material Code", "Material No", "Material Number"]) || vals[4] || "";
    const matDesc = pickCol(row, ["Material Description", "Description", "Product", "Product Description"]) || vals[4] || "";
    const date = normalizeDate(pickCol(row, ["Date", "Billing Date", "Invoice Date", "Posting Date", "Created On"]) || vals[9] || "");
    const month = date ? date.slice(0, 7) : "";
    const plant = cleanPlantName(pickCol(row, ["Plant", "Plant Name", "Supplying Plant", "Supply Plant"]) || vals[5] || "");
    const unit = pickCol(row, ["Unit", "UOM", "Net 2", "Net Unit"]) || vals[11] || "KG";
    const salesOffice = pickCol(row, ["Sales Off.", "Sales Off", "Sales Office"]) || vals[15] || "";
    const region = pickCol(row, ["Region"]) || vals[16] || "";
    const cls = classifyMaterial(matText, matDesc);
    if (!cls.keys.length) {
      out.ignoredRows++;
      continue;
    }
    let mt = num(pickCol(row, ["MT", "Metric Ton", "Metric Tons", "Quantity in MT", "Qty in MT", "Sales in MT", "Domestic Sale MT", "Weight MT"]));
    if (!mt) {
      const q = pickCol(row, ["Net", "Quantity in KG", "Qty in KG", "Sales in KG", "Weight KG", "Net Value", "Quantity", "Qty", "Cylinder", "Cylinders", "No. of Cylinders"]) || vals[10];
      const u = String(unit || "KG").toUpperCase();
      const n = num(q);
      mt = u.includes("MT") || u.includes("TON") ? n : u.includes("CYL") ? n * 0.0142 : n / 1000;
    }
    if (!date || !month || !mt) continue;
    if (mt < 0) out.negativeRows++;
    if (cls.returnFlag) out.returnRows++;
    if (cls.returnFlag && mt > 0) mt = -Math.abs(mt);
    const ido = salesOfficeToIdo(salesOffice, region);
    parsedRows.push({ date, month, mt, plant, ido, cls });
    fileDates.add(date);
  }
  deleteDates(fileDates);
  for (const { date, month, mt, plant, ido, cls } of parsedRows) {
    for (const key of cls.keys) {
      addProductMetric(out.product_day_mt, key, date, "", "", mt);
      if (plant) addProductMetric(out.product_plant_day_mt, key, date, plant, "", mt);
      if (ido) addProductMetric(out.product_ido_day_mt, key, date, ido, "", mt);
      if (plant && ido) addProductMetric(out.product_plant_ido_day_mt, key, date, ido, plant, mt);
    }
    if (cls.keys.includes("DOM_14_2_ALL")) {
      out.month_mt[month] = (out.month_mt[month] || 0) + mt;
      addNested(out.day_mt, date, "", "", mt);
      if (plant) addNested(out.plant_day_mt, date, plant, "", mt);
      if (ido) addNested(out.ido_day_mt, date, ido, "", mt);
      if (plant && ido) addNested(out.plant_ido_day_mt, date, ido, plant, mt);
    }
    out.detectedRows++;
  }
  recomputeMonths(fileDates);
}

for (const file of files) processWorkbook(file);

const round = (value) => (typeof value === "number" ? Math.round(value * 1000000) / 1000000 : value);
function deepRound(obj) {
  if (Array.isArray(obj)) return obj.map(deepRound);
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) obj[key] = deepRound(value);
    return obj;
  }
  return round(obj);
}

process.stdout.write(JSON.stringify(deepRound(out)));
