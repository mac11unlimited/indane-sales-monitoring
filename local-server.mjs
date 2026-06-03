import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(root, "static");
const dbPath = path.join(root, "local-data.json");
const port = Number(process.argv[2] || 8095);
const host = process.argv[3] || "127.0.0.1";

const users = {
  admin: "ADMIN",
  "Security Guard01": "SECURITY_GUARD",
  "Security Guard02": "SECURITY_GUARD",
  "Security Guard03": "SECURITY_GUARD",
  "Security Guard04": "SECURITY_GUARD",
  "S&D Officer01": "S&D_OFFICER",
  "S&D Officer02": "S&D_OFFICER",
  "Plant 2nd Incharge": "PLANT_2ND_INCHARGE",
  "Plant Incharge": "PLANT_INCHARGE",
  "Audit User": "AUDIT_USER",
};

const defaultData = {
  materials: [
    { material_code: "M00087", cylinder_type: "14.2 Kg", capacity_kg: 14.2, tare_weight_kg: 15.3, is_active: true },
    { material_code: "M00002", cylinder_type: "19 Kg", capacity_kg: 19, tare_weight_kg: 18, is_active: true },
    { material_code: "M00065", cylinder_type: "47.5 Kg", capacity_kg: 47.5, tare_weight_kg: 35, is_active: true },
  ],
  movements: [],
  mismatches: [],
  manualErv: [],
  stockTransfers: [],
  inventory: [],
  notifications: [],
};

let data = await loadData();

async function loadData() {
  try {
    return { ...defaultData, ...JSON.parse(await fs.readFile(dbPath, "utf8")) };
  } catch {
    return structuredClone(defaultData);
  }
}

async function saveData() {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(payload));
}

function parseToken(req) {
  const auth = req.headers.authorization || "";
  const raw = auth.replace(/^Bearer\s+/i, "");
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return { username: "local", role: "ADMIN" };
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) return JSON.parse(buffer.toString("utf8") || "{}");
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(buffer.toString("utf8")));
  return { rawSize: buffer.length, contentType: type };
}

function status(expected, actual) {
  if (!expected && !actual) return "PENDING";
  return Number(expected) === Number(actual) ? "GREEN" : "RED";
}

function dashboard() {
  const inside = data.movements.filter((x) => !x.exited_at).length;
  return {
    truck_kpis: {
      entered: data.movements.length,
      exited: data.movements.filter((x) => x.exited_at).length,
      inside,
      pending: data.movements.filter((x) => x.match_status === "PENDING").length,
      average_turnaround_minutes: 0,
    },
    sap_kpis: {
      matched: data.movements.filter((x) => x.match_status === "GREEN").length,
      mismatch_cases: data.mismatches.filter((x) => x.status === "OPEN").length,
      pending_reconciliation: data.movements.filter((x) => x.match_status !== "GREEN").length,
      aging_24h: 0,
      aging_48h: 0,
    },
    manual_erv: {
      pending: data.manualErv.filter((x) => x.status !== "CLOSED").length,
      resolved_today: data.manualErv.filter((x) => x.status === "CLOSED").length,
      aging_24h: 0,
      aging_48h: 0,
      aging_72h: 0,
    },
    inventory: data.inventory,
    notifications: data.notifications.slice(-10).reverse(),
  };
}

function legacyDashboard() {
  return {
    daily_by_plant: [
      { plant: "Loni BP", planned: 24, invoiced: 18 },
      { plant: "Karnal BP", planned: 18, invoiced: 15 },
      { plant: "Haridwar BP", planned: 22, invoiced: 21 },
    ],
    exceptions: { missing_indent: 1, fund_blocks: 0, logistics: data.mismatches.length },
    strategic: {
      months: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      last_year_mt: [77187, 68260, 70400, 72100, 73800, 74250],
      target_mt: [81046, 71673, 73920, 75705, 77490, 77962],
      actual_mt: [68260, 51220, 0, 0, 0, 0],
    },
    heatmap: [
      { name: "Baghpat LPG SA", plant: "Loni BP", performance: 104 },
      { name: "Muzaffarnagar LSA", plant: "Karnal BP", performance: 98 },
      { name: "Dehradun LSA", plant: "Haridwar BP", performance: 113 },
      { name: "Kashipur LSA", plant: "Kashipur BP", performance: 91 },
    ],
    alerts: [],
  };
}

function postInventory(materialCode, cylinderType, delta) {
  if (!materialCode || !delta) return;
  const row = data.inventory.find((x) => x.material_code === materialCode && x.cylinder_type === cylinderType);
  if (row) row.current_inventory += delta;
  else data.inventory.push({ material_code: materialCode, cylinder_type: cylinderType, current_inventory: delta });
}

async function api(req, res, url) {
  if (req.method === "OPTIONS") return sendJson(res, {});
  const body = req.method === "GET" ? {} : await readBody(req);
  const user = parseToken(req);

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const username = body.username || "admin";
    if (body.password && body.password !== "Indane@12345") return sendJson(res, { detail: "Invalid username or password" }, 401);
    const role = users[username] || "ADMIN";
    const token = Buffer.from(JSON.stringify({ username, role })).toString("base64url");
    return sendJson(res, { access_token: token, token_type: "bearer", role });
  }
  if (url.pathname === "/api/me") return sendJson(res, { username: user.username, role: user.role, email: "local@example.com" });
  if (url.pathname === "/api/dashboard") return sendJson(res, legacyDashboard());
  if (url.pathname.startsWith("/api/spd/")) return sendJson(res, []);
  if (url.pathname === "/api/lpg/dashboard") return sendJson(res, dashboard());
  if (url.pathname === "/api/lpg/materials") return sendJson(res, data.materials);
  if (url.pathname === "/api/lpg/movements") return sendJson(res, data.movements.slice().reverse());
  if (url.pathname === "/api/lpg/mismatches") return sendJson(res, data.mismatches.slice().reverse());
  if (url.pathname === "/api/lpg/inventory") return sendJson(res, data.inventory);

  if (url.pathname === "/api/lpg/gate-entry" && req.method === "POST") {
    const movement = {
      id: data.movements.length + 1,
      ...body,
      expected_quantity: Number(body.expected_quantity || 0),
      physical_quantity: Number(body.physical_quantity || 0),
      current_stage: "GATE0",
      match_status: status(body.expected_quantity, body.physical_quantity),
      created_at: new Date().toISOString(),
    };
    data.movements.push(movement);
    if (movement.match_status === "RED") {
      data.mismatches.push({
        id: data.mismatches.length + 1,
        mismatch_type: "TRUCK_QUANTITY",
        severity: "RED",
        truck_number: movement.truck_number,
        expected_quantity: movement.expected_quantity,
        actual_quantity: movement.physical_quantity,
        status: "OPEN",
      });
    }
    await saveData();
    return sendJson(res, { status: movement.match_status, movement_id: movement.id, current_stage: movement.current_stage });
  }

  if (url.pathname === "/api/lpg/gate-event" && req.method === "POST") {
    const movement = data.movements.find((x) => x.id === Number(body.movement_id));
    if (!movement) return sendJson(res, { detail: "Truck movement not found" }, 404);
    movement.current_stage = body.gate_no;
    if (body.physical_quantity !== undefined) movement.physical_quantity = Number(body.physical_quantity || 0);
    movement.match_status = status(movement.expected_quantity, movement.physical_quantity);
    if (body.gate_no === "GATE2" && movement.match_status === "GREEN") movement.exited_at = new Date().toISOString();
    await saveData();
    return sendJson(res, { status: movement.match_status, allow_exit: movement.match_status === "GREEN", current_stage: movement.current_stage });
  }

  if (url.pathname === "/api/lpg/ocr/extract" && req.method === "POST") {
    return sendJson(res, { engine: "local-demo-extractor", status: "NEEDS_REVIEW", quantity: 0, truck_number: null, material_code: null, rawSize: body.rawSize });
  }

  if (url.pathname === "/api/lpg/manual-erv" && req.method === "POST") {
    const number = `MERV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(data.manualErv.length + 1).padStart(4, "0")}`;
    const total = (body.lines || []).reduce((sum, line) => sum + Number(line.empty_quantity || 0), 0);
    data.manualErv.push({ id: data.manualErv.length + 1, manual_erv_number: number, ...body, total_quantity: total, status: "PENDING_ONLINE_ERV", created_at: new Date().toISOString() });
    for (const line of body.lines || []) postInventory(line.material_code, line.cylinder_type, Number(line.empty_quantity || 0));
    data.notifications.push({ id: data.notifications.length + 1, subject: "Manual ERV pending", message: `${number} needs online ERV linking`, status: "QUEUED" });
    await saveData();
    return sendJson(res, { status: "PENDING_ONLINE_ERV", manual_erv_number: number, total_quantity: total });
  }

  if (url.pathname === "/api/lpg/stock-transfer" && req.method === "POST") {
    data.stockTransfers.push({ id: data.stockTransfers.length + 1, ...body, status: "OPEN", created_at: new Date().toISOString() });
    postInventory(body.material_code, body.cylinder_type, -Number(body.quantity || 0));
    await saveData();
    return sendJson(res, { status: "OPEN", transfer_number: body.transfer_number });
  }

  if (url.pathname === "/api/lpg/stock-transfer/return" && req.method === "POST") {
    const transfer = data.stockTransfers.find((x) => x.transfer_number === body.transfer_number);
    if (!transfer) return sendJson(res, { detail: "Transfer not found" }, 404);
    Object.assign(transfer, body, { status: "CLOSED" });
    postInventory(transfer.material_code, transfer.cylinder_type, Number(body.returned_quantity || 0));
    await saveData();
    return sendJson(res, { status: transfer.status });
  }

  if (url.pathname === "/api/lpg/ym89/reconcile" && req.method === "POST") {
    const batch = `YM89-${Date.now()}`;
    await saveData();
    return sendJson(res, { batch, rows_imported: 0, report: "Local demo accepted the files; production parser runs in FastAPI." });
  }

  return sendJson(res, { detail: "Not found" }, 404);
}

async function serveStatic(req, res, url) {
  const safePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/static\//, "");
  const filePath = path.normalize(path.join(staticDir, safePath));
  if (!filePath.startsWith(staticDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, { detail: error.message }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`INDANE LPG local portal running at http://${host}:${port}/`);
});
