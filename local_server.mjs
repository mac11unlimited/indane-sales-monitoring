import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(__dirname, "static");
const dataDir = path.join(__dirname, "data");
const port = Number(process.argv[2] || 8095);
const host = process.argv[3] || "127.0.0.1";
const logFile = path.join(__dirname, "local-server.log");

function log(message) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

process.on("uncaughtException", (error) => {
  log(`uncaughtException: ${error.stack || error.message}`);
});

process.on("unhandledRejection", (error) => {
  log(`unhandledRejection: ${error?.stack || error}`);
});

const seedPath = path.join(dataDir, "seed-distributors.json");
const seededDistributors = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, "utf8")) : [];
const distributors = seededDistributors.length
  ? seededDistributors
  : [
      { sap_code: "175271", name: "AARYAMAN INDANE GAS AGENCY", lsa_name: "Baghpat LPG SA", district: "BAGHPAT", supply_plant: "Loni BP", final_planning: 1 },
      { sap_code: "156162", name: "AMAR INDANE GAS AGENCY", lsa_name: "Baghpat LPG SA", district: "BAGHPAT", supply_plant: "Loni BP", final_planning: 2 },
      { sap_code: "103860", name: "Bhawan Indane Gas Service", lsa_name: "Baghpat LPG SA", district: "SHAMLI", supply_plant: "Karnal BP", final_planning: 2 },
    ];

for (const row of [
  { sap_code: "204118", name: "DEHRADUN INDANE SERVICE", lsa_name: "Dehradun LSA", district: "DEHRADUN", supply_plant: "Haridwar BP", final_planning: 1 },
  { sap_code: "309441", name: "KASHIPUR INDANE GRAMIN", lsa_name: "Kashipur LSA", district: "UDHAM SINGH NAGAR", supply_plant: "Kashipur BP", final_planning: 1 },
  { sap_code: "221510", name: "ALIGARH INDANE AGENCY", lsa_name: "Aligarh LSA", district: "ALIGARH", supply_plant: "Aligarh BP", final_planning: 2 },
]) {
  if (!distributors.some((d) => d.sap_code === row.sap_code)) distributors.push(row);
}

const users = {
  admin: { password: "Indane@12345", role: "ADMIN", email: "admin@indianoil.in", phone_number: "", work_profile: "System administrator" },
  upso2: { password: "Indane@12345", role: "UPSO_II", email: "upso2@indianoil.in", phone_number: "", work_profile: "UPSO II State Office target control" },
  ido_noida: { password: "Indane@12345", role: "IDO_NOIDA", email: "ido.noida@indianoil.in", phone_number: "", work_profile: "Noida Indane DO SPD approval" },
  ido_dehradun: { password: "Indane@12345", role: "IDO_DEHRADUN", email: "ido.dehradun@indianoil.in", phone_number: "", work_profile: "Dehradun Indane DO SPD approval" },
  plant_loni: { password: "Indane@12345", role: "PLANT_LONI", email: "loni.bp@indianoil.in", phone_number: "", work_profile: "Loni BP plant execution" },
  plant_aligarh: { password: "Indane@12345", role: "PLANT_ALIGARH", email: "aligarh.bp@indianoil.in", phone_number: "", work_profile: "Aligarh BP plant execution" },
  plant_haridwar: { password: "Indane@12345", role: "PLANT_HARIDWAR", email: "haridwar.bp@indianoil.in", phone_number: "", work_profile: "Haridwar BP plant execution" },
  plant_kashipur: { password: "Indane@12345", role: "PLANT_KASHIPUR", email: "kashipur.bp@indianoil.in", phone_number: "", work_profile: "Kashipur BP plant execution" },
  plant_karnal: { password: "Indane@12345", role: "PLANT_KARNAL", email: "karnal.bp@indianoil.in", phone_number: "", work_profile: "Karnal BP plant execution" },
};

[...new Set(distributors.map((d) => d.lsa_name).filter(Boolean))].forEach((lsa, index) => {
  const username = `lsa_${String(index + 1).padStart(2, "0")}`;
  users[username] = {
    password: "Indane@12345",
    role: "LSA_USER",
    lsa_name: lsa,
    email: `${username}@indianoil.in`,
    phone_number: "",
    work_profile: `${lsa} daily SPD coordination`,
  };
});

const today = new Date().toISOString().slice(0, 10);
const spd = new Map(
  distributors.filter((d) => Number(d.final_planning || 0) > 0).map((d, index) => [
    `${today}:${d.sap_code}`,
    {
      planning_date: today,
      sap_code: d.sap_code,
      target_cylinders: Number(d.final_planning || 1) * 360,
      target_loads: Number(d.final_planning || 1),
      priority_level: index % 9 === 0 ? "High" : "Normal",
      backlog_qty: index % 9 === 0 ? 240 : 0,
      indent_no: "",
      approved_by: "seed",
    },
  ]),
);
const execution = new Map();
const alerts = [];

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function userFromToken(req) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const username = Buffer.from(token || "", "base64url").toString("utf8").split(":")[0];
  return users[username] ? { username, ...users[username] } : null;
}

function tokenFor(username) {
  return Buffer.from(`${username}:${Date.now()}`).toString("base64url");
}

function plantForRole(role) {
  return {
    PLANT_LONI: "Loni BP",
    PLANT_ALIGARH: "Aligarh BP",
    PLANT_HARIDWAR: "Haridwar BP",
    PLANT_KASHIPUR: "Kashipur BP",
    PLANT_KARNAL: "Karnal BP",
  }[role];
}

function canPlan(user) {
  return ["ADMIN", "UPSO_II", "IDO_NOIDA", "IDO_DEHRADUN", "LSA_USER"].includes(user.role);
}

function userCanSeeDistributor(user, distributor) {
  const plant = plantForRole(user.role);
  if (plant) return distributor.supply_plant === plant;
  if (user.role === "LSA_USER") return distributor.lsa_name === user.lsa_name;
  if (user.role === "IDO_DEHRADUN") return /Dehradun|Haridwar|Kashipur/i.test(`${distributor.lsa_name} ${distributor.district} ${distributor.supply_plant}`);
  if (user.role === "IDO_NOIDA") return !/Dehradun|Haridwar|Kashipur/i.test(`${distributor.lsa_name} ${distributor.district} ${distributor.supply_plant}`);
  return true;
}

function spdRows(date, user) {
  const plant = plantForRole(user.role);
  return [...spd.values()]
    .filter((row) => row.planning_date === date)
    .map((row) => ({ ...row, distributor: distributors.find((d) => d.sap_code === row.sap_code) }))
    .filter((row) => row.distributor && (!plant || row.distributor.supply_plant === plant) && userCanSeeDistributor(user, row.distributor))
    .sort((a, b) => (b.backlog_qty || 0) - (a.backlog_qty || 0))
    .map((row) => {
      const ex = execution.get(`${date}:${row.sap_code}`) || {};
      return {
        sap_code: row.sap_code,
        name: row.distributor.name,
        lsa_name: row.distributor.lsa_name,
        supply_plant: row.distributor.supply_plant,
        target_loads: row.target_loads,
        target_cylinders: row.target_cylinders,
        priority_level: row.priority_level,
        backlog_qty: row.backlog_qty,
        indent_no: ex.indent_no || row.indent_no || "",
        loads_invoiced: ex.loads_invoiced || 0,
        sap_indent_available: ex.sap_indent_available ?? true,
        fund_shortage_block: ex.fund_shortage_block ?? false,
        other_issue_flag: ex.other_issue_flag || "",
      };
    });
}

function dashboard() {
  const byPlant = new Map();
  for (const row of spdRows(today, { role: "ADMIN" })) {
    const current = byPlant.get(row.supply_plant) || { plant: row.supply_plant, planned: 0, invoiced: 0 };
    current.planned += row.target_loads;
    current.invoiced += Number(row.loads_invoiced || 0);
    byPlant.set(row.supply_plant, current);
  }
  const exceptionCounts = [...execution.values()].reduce(
    (acc, row) => {
      if (row.sap_indent_available === false) acc.missing_indent += 1;
      if (row.fund_shortage_block === true) acc.fund_blocks += 1;
      if (row.other_issue_flag) acc.logistics += 1;
      return acc;
    },
    { missing_indent: 0, fund_blocks: 0, logistics: 0 },
  );
  return {
    daily_by_plant: [...byPlant.values()],
    exceptions: exceptionCounts,
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
    alerts: alerts.slice(-10).reverse(),
  };
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function dayReportCsv(date, user) {
  const header = ["Date", "SAP Code", "Distributor", "LSA", "Plant", "SPD Loads", "SPD Cylinders", "Indent No", "Invoiced Loads", "Indent Available", "Fund Short", "Other Issue"];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of spdRows(date, user)) {
    lines.push(
      [
        date,
        row.sap_code,
        row.name,
        row.lsa_name,
        row.supply_plant,
        row.target_loads,
        row.target_cylinders,
        row.indent_no,
        row.loads_invoiced,
        row.sap_indent_available ? "Yes" : "No",
        row.fund_shortage_block ? "Yes" : "No",
        row.other_issue_flag,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/static\//, "");
  const filePath = path.normalize(path.join(staticDir, relative));
  if (!filePath.startsWith(staticDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, {});
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const params = new URLSearchParams((await readBody(req)).toString("utf8"));
      const username = params.get("username") || "";
      const password = params.get("password") || "";
      if (!users[username] || users[username].password !== password) return sendJson(res, 401, { detail: "Invalid username or password" });
      return sendJson(res, 200, { access_token: tokenFor(username), token_type: "bearer", role: users[username].role });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
      const payload = JSON.parse((await readBody(req)).toString("utf8"));
      const found = Object.entries(users).find(([, info]) => info.email === payload.email);
      return sendJson(res, 200, { status: "reset-link-generated", message: found ? "Password reset email queued." : "If the email exists, reset instructions will be sent." });
    }
    if (url.pathname.startsWith("/api/")) {
      const user = userFromToken(req);
      if (!user) return sendJson(res, 401, { detail: "Please login again" });
      if (req.method === "GET" && url.pathname === "/api/me") {
        return sendJson(res, 200, {
          username: user.username,
          role: user.role,
          lsa_name: user.lsa_name || "",
          email: user.email,
          phone_number: user.phone_number || "",
          work_profile: user.work_profile || user.role,
        });
      }
      if (req.method === "PUT" && url.pathname === "/api/me") {
        const payload = JSON.parse((await readBody(req)).toString("utf8"));
        Object.assign(users[user.username], {
          email: payload.email || users[user.username].email,
          phone_number: payload.phone_number || "",
          work_profile: payload.work_profile || "",
        });
        return sendJson(res, 200, { status: "profile-updated" });
      }
      if (req.method === "GET" && url.pathname === "/api/dashboard") return sendJson(res, 200, dashboard());
      if (req.method === "GET" && url.pathname === "/api/users") {
        return sendJson(
          res,
          200,
          Object.entries(users).map(([username, info]) => ({
            username,
            role: info.role,
            lsa_name: info.lsa_name || "",
            email: info.email,
            work_profile: info.work_profile,
          })),
        );
      }
      if (req.method === "GET" && url.pathname === "/api/distributors") {
        return sendJson(res, 200, distributors.filter((d) => userCanSeeDistributor(user, d)).sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (req.method === "POST" && url.pathname === "/api/distributors") {
        if (!canPlan(user)) return sendJson(res, 403, { detail: "Only Admin, UPSO-II, IDO and LSA users can maintain distributors" });
        const payload = JSON.parse((await readBody(req)).toString("utf8"));
        const existing = distributors.find((d) => d.sap_code === payload.sap_code);
        if (existing) Object.assign(existing, payload);
        else distributors.push({ ...payload, final_planning: 0 });
        return sendJson(res, 200, { status: "distributor-saved", count: distributors.length });
      }
      const spdMatch = url.pathname.match(/^\/api\/spd\/(\d{4}-\d{2}-\d{2})$/);
      if (req.method === "GET" && spdMatch) return sendJson(res, 200, spdRows(spdMatch[1], user));
      if (req.method === "POST" && url.pathname === "/api/spd") {
        if (!canPlan(user)) return sendJson(res, 403, { detail: "Only UPSO-II, IDO, LSA or Admin users can approve SPD" });
        const payload = JSON.parse((await readBody(req)).toString("utf8"));
        const distributor = distributors.find((d) => d.sap_code === payload.sap_code);
        if (!distributor || !userCanSeeDistributor(user, distributor)) return sendJson(res, 403, { detail: "Distributor is outside this user workspace" });
        const targetLoads = Math.max(0, Number(payload.target_loads || Math.ceil(Number(payload.target_cylinders || 0) / 360)));
        const key = `${payload.planning_date}:${payload.sap_code}`;
        spd.set(key, {
          planning_date: payload.planning_date,
          sap_code: payload.sap_code,
          target_cylinders: targetLoads * 360,
          target_loads: targetLoads,
          priority_level: payload.priority_level || "Normal",
          backlog_qty: Number(payload.backlog_qty || 0),
          indent_no: payload.indent_no || "",
          override_reason: payload.override_reason || "",
          approved_by: user.username,
        });
        return sendJson(res, 200, { status: "spd-approved", target_loads: targetLoads });
      }
      if (req.method === "POST" && url.pathname === "/api/execution") {
        const payload = JSON.parse((await readBody(req)).toString("utf8"));
        const plant = plantForRole(user.role);
        const distributor = distributors.find((d) => d.sap_code === payload.sap_code);
        if (!plant || !distributor || distributor.supply_plant !== plant) return sendJson(res, 403, { detail: "Distributor is outside this plant workspace" });
        if (!spd.has(`${payload.execution_date}:${payload.sap_code}`)) return sendJson(res, 409, { detail: "Execution blocked: approved SPD allocation is required for this operating day" });
        execution.set(`${payload.execution_date}:${payload.sap_code}`, { ...payload, entered_by: user.username });
        if (payload.sap_indent_available === false) {
          alerts.push({ id: Date.now(), alert_type: "SAP_INDENT_MISSING", sap_code: payload.sap_code, message: `${distributor.name} has approved SPD but SAP indent is missing.` });
        }
        return sendJson(res, 200, { status: "logged" });
      }
      if (req.method === "GET" && url.pathname === "/api/reports/day.csv") {
        const reportDate = url.searchParams.get("date") || today;
        res.writeHead(200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="indane-spd-dispatch-${reportDate}.csv"`,
        });
        res.end(dayReportCsv(reportDate, user));
        return;
      }
      if (req.method === "POST" && (url.pathname === "/api/upload/mcsi-sales" || url.pathname === "/api/upload/indent-planning")) {
        await readBody(req);
        return sendJson(res, 200, { status: "accepted-local-demo", rows_imported: 0, note: "Full Excel parsing is active in the FastAPI deployment build." });
      }
      if (req.method === "POST" && (url.pathname === "/api/upload/backlog" || url.pathname === "/api/upload/distributors")) {
        await readBody(req);
        return sendJson(res, 200, { status: "accepted-local-demo", note: "Upload endpoint is ready; production FastAPI build persists parsed rows to PostgreSQL." });
      }
      return sendJson(res, 404, { detail: "API route not found" });
    }
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { detail: error.message });
  }
});

server.listen(port, host, () => {
  log(`INDANE SALES MONITORING local portal running at http://${host}:${port}`);
});
