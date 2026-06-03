function indaneApp() {
  return {
    token: localStorage.getItem("indane_token") || "",
    role: localStorage.getItem("indane_role") || "",
    username: "",
    password: "",
    activeScreen: "strategic",
    gridWidth: 132,
    filter: "",
    sortKey: "priority_level",
    sortAsc: true,
    rows: [],
    dashboard: null,
    lpgDashboard: null,
    materials: [],
    movements: [],
    mismatches: [],
    selectedMovementId: null,
    gateMessage: "",
    manualErvMessage: "",
    stockMessage: "",
    ym89Message: "",
    extractionResult: {},
    gate: {
      flow_type: "FILLED_DISPATCH",
      truck_number: "",
      driver_name: "",
      driver_mobile: "",
      transporter_name: "",
      rfid_id: "",
      distributor_name: "",
      distributor_sap_code: "",
      load_slip_no: "",
      route: "",
      destination: "",
      expected_quantity: 0,
      physical_quantity: 0,
    },
    gateAdvance: { gate_no: "GATE1" },
    manualErv: {
      truck_number: "",
      distributor_name: "",
      distributor_sap_code: "",
      document_type: "Manual ERV",
      document_number: "",
      remarks: "",
      lines: [{ material_code: "M00087", cylinder_type: "14.2 Kg", empty_quantity: 0, safety_cap_quantity: 0, damaged_quantity: 0 }],
    },
    stock: {
      transfer_number: "",
      truck_number: "",
      transfer_type: "Hot Repair",
      vendor_name: "",
      vendor_code: "",
      transfer_date: new Date().toISOString().slice(0, 10),
      expected_return_date: new Date().toISOString().slice(0, 10),
      material_code: "M00087",
      cylinder_type: "14.2 Kg",
      quantity: 0,
      condition: "Good",
    },
    alerts: [],
    users: [],
    distributors: [],
    profile: { email: "", phone_number: "", work_profile: "" },
    newSpd: { planning_date: "", sap_code: "", target_loads: 1, priority_level: "Normal", backlog_qty: 0, indent_no: "", override_reason: "" },
    distributorForm: { sap_code: "", name: "", lsa_name: "", district: "", urban_rural: "", supply_plant: "", email: "", phone_number: "", address: "" },
    forgotEmail: "",
    notice: "",
    charts: {},
    loginError: "",
    today: new Date().toISOString().slice(0, 10),

    async init() {
      if (this.token) {
        await this.loadMe();
        await this.refreshAll();
      }
    },

    headers() {
      return { Authorization: `Bearer ${this.token}` };
    },

    async api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: { ...(options.headers || {}), ...(this.token ? this.headers() : {}) },
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(detail.detail || "Request failed");
      }
      return response.json();
    },

    async login() {
      this.loginError = "";
      const body = new URLSearchParams({ username: this.username, password: this.password });
      try {
        const data = await this.api("/api/auth/login", { method: "POST", body });
        this.token = data.access_token;
        this.role = data.role;
        localStorage.setItem("indane_token", this.token);
        localStorage.setItem("indane_role", this.role);
        await this.loadMe();
        await this.refreshAll();
      } catch (error) {
        this.loginError = error.message;
      }
    },

    async forgotPassword() {
      this.notice = "";
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.forgotEmail }),
      });
      const data = await response.json();
      this.notice = data.message || "Reset request accepted.";
    },

    logout() {
      localStorage.removeItem("indane_token");
      localStorage.removeItem("indane_role");
      this.token = "";
      this.role = "";
      this.rows = [];
      this.dashboard = null;
    },

    async loadMe() {
      const me = await this.api("/api/me");
      this.username = me.username;
      this.role = me.role;
      this.profile = { email: me.email || "", phone_number: me.phone_number || "", work_profile: me.work_profile || "" };
    },

    async refreshAll() {
      await Promise.all([this.loadDashboard(), this.loadSpd(), this.loadUsers(), this.loadDistributors()]);
      this.$nextTick(() => this.drawCharts());
    },

    async loadDashboard() {
      this.dashboard = await this.api("/api/dashboard");
      this.alerts = this.dashboard.alerts || [];
    },

    async loadSpd() {
      this.rows = await this.api(`/api/spd/${this.today}`);
    },

    async loadUsers() {
      this.users = await this.api("/api/users");
    },

    async loadDistributors() {
      this.distributors = await this.api("/api/distributors");
      if (!this.newSpd.sap_code && this.distributors.length) this.newSpd.sap_code = this.distributors[0].sap_code;
    },

    canPlan() {
      return ["ADMIN", "UPSO_II", "IDO_NOIDA", "IDO_DEHRADUN", "LSA_USER"].includes(this.role);
    },

    async saveProfile() {
      await this.api("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.profile),
      });
      this.notice = "Profile updated.";
    },

    async saveDistributor() {
      await this.api("/api/distributors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.distributorForm),
      });
      this.notice = "Distributor profile saved.";
      await this.loadDistributors();
    },

    async approveSpd() {
      const payload = { ...this.newSpd, planning_date: this.newSpd.planning_date || this.today };
      await this.api("/api/spd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      this.notice = "SPD approved for plant execution.";
      await this.loadSpd();
      await this.loadDashboard();
      this.$nextTick(() => this.drawCharts());
    },

    downloadReport() {
      window.open(`/api/reports/day.csv?date=${this.today}`, "_blank");
    },

    async loadLpg() {
      const [dash, materials, movements, mismatches] = await Promise.all([
        this.api("/api/lpg/dashboard"),
        this.api("/api/lpg/materials"),
        this.api("/api/lpg/movements"),
        this.api("/api/lpg/mismatches"),
      ]);
      this.lpgDashboard = dash;
      this.materials = materials;
      this.movements = movements;
      this.mismatches = mismatches;
      if (materials.length && !this.manualErv.lines[0].material_code) {
        this.manualErv.lines[0].material_code = materials[0].material_code;
        this.manualErv.lines[0].cylinder_type = materials[0].cylinder_type;
        this.stock.material_code = materials[0].material_code;
        this.stock.cylinder_type = materials[0].cylinder_type;
      }
    },

    filteredRows() {
      const term = this.filter.toLowerCase();
      return this.rows
        .filter((row) => !term || Object.values(row).some((value) => String(value).toLowerCase().includes(term)))
        .sort((a, b) => {
          const left = a[this.sortKey];
          const right = b[this.sortKey];
          const result = Number.isFinite(+left) && Number.isFinite(+right) ? +left - +right : String(left).localeCompare(String(right));
          return this.sortAsc ? result : -result;
        });
    },

    sortBy(key) {
      if (this.sortKey === key) this.sortAsc = !this.sortAsc;
      this.sortKey = key;
    },

    async saveExecution(row) {
      await this.api("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execution_date: this.today,
          sap_code: row.sap_code,
          indent_no: row.indent_no || "",
          loads_invoiced: Number(row.loads_invoiced || 0),
          sap_indent_available: !!row.sap_indent_available,
          fund_shortage_block: !!row.fund_shortage_block,
          other_issue_flag: row.other_issue_flag || "",
        }),
      });
      await this.loadDashboard();
      this.$nextTick(() => this.drawCharts());
    },

    selectedMaterial(code) {
      return this.materials.find((item) => item.material_code === code);
    },

    syncCylinderTypes() {
      const manualMaterial = this.selectedMaterial(this.manualErv.lines[0].material_code);
      if (manualMaterial) this.manualErv.lines[0].cylinder_type = manualMaterial.cylinder_type;
      const stockMaterial = this.selectedMaterial(this.stock.material_code);
      if (stockMaterial) this.stock.cylinder_type = stockMaterial.cylinder_type;
    },

    async createGateEntry() {
      const payload = { ...this.gate, expected_quantity: Number(this.gate.expected_quantity || 0), physical_quantity: Number(this.gate.physical_quantity || 0) };
      const result = await this.api("/api/lpg/gate-entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      this.selectedMovementId = result.movement_id;
      this.gateMessage = `${result.status}: movement ${result.movement_id} created at ${result.current_stage}`;
      await this.loadLpg();
    },

    async advanceSelectedGate() {
      if (!this.selectedMovementId) {
        this.gateMessage = "Select a truck movement first.";
        return;
      }
      const result = await this.api("/api/lpg/gate-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movement_id: this.selectedMovementId,
          gate_no: this.gateAdvance.gate_no,
          event_type: this.gateAdvance.gate_no === "GATE2" ? "EXIT_VALIDATION" : "STAGE_ADVANCE",
          physical_quantity: Number(this.gate.physical_quantity || 0),
        }),
      });
      this.gateMessage = `${result.status}: ${result.allow_exit ? "exit allowed" : "hold for reconciliation"}`;
      await this.loadLpg();
    },

    async extractDocument() {
      const input = document.getElementById("docExtractUpload");
      if (!input.files.length) return;
      const form = new FormData();
      form.append("file", input.files[0]);
      this.extractionResult = await this.api("/api/lpg/ocr/extract", { method: "POST", body: form });
      input.value = "";
    },

    async createManualErv() {
      this.syncCylinderTypes();
      const payload = JSON.parse(JSON.stringify(this.manualErv));
      payload.lines = payload.lines.map((line) => ({
        ...line,
        empty_quantity: Number(line.empty_quantity || 0),
        safety_cap_quantity: Number(line.safety_cap_quantity || 0),
        damaged_quantity: Number(line.damaged_quantity || 0),
      }));
      const result = await this.api("/api/lpg/manual-erv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      this.manualErvMessage = `${result.manual_erv_number} created with ${result.total_quantity} cylinders`;
      await this.loadLpg();
    },

    async createStockTransfer() {
      this.syncCylinderTypes();
      const payload = { ...this.stock, quantity: Number(this.stock.quantity || 0) };
      const result = await this.api("/api/lpg/stock-transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      this.stockMessage = `${result.transfer_number} is ${result.status}`;
      await this.loadLpg();
    },

    async returnStockTransfer() {
      const result = await this.api("/api/lpg/stock-transfer/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_number: this.stock.transfer_number,
          return_date: new Date().toISOString().slice(0, 10),
          returned_quantity: Number(this.stock.quantity || 0),
          rejected_quantity: 0,
          scrap_quantity: 0,
          repair_quantity: 0,
        }),
      });
      this.stockMessage = `Return posted: ${result.status}`;
      await this.loadLpg();
    },

    async reconcileYm89() {
      const issue = document.getElementById("ym89IssueUpload");
      const receipt = document.getElementById("ym89ReceiptUpload");
      if (!issue.files.length || !receipt.files.length) {
        this.ym89Message = "Select both YM89 issue and receipt files.";
        return;
      }
      const form = new FormData();
      form.append("issue_file", issue.files[0]);
      form.append("receipt_file", receipt.files[0]);
      const result = await this.api("/api/lpg/ym89/reconcile", { method: "POST", body: form });
      this.ym89Message = `${result.rows_imported} rows imported in ${result.batch}`;
      issue.value = "";
      receipt.value = "";
      await this.loadLpg();
    },

    moveCell(event, rowIndex, colIndex) {
      const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Tab"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      let nextRow = rowIndex;
      let nextCol = colIndex;
      if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) nextCol += 1;
      if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) nextCol -= 1;
      if (event.key === "ArrowDown") nextRow += 1;
      if (event.key === "ArrowUp") nextRow -= 1;
      const target = document.querySelector(`[data-cell='${nextRow}:${nextCol}']`);
      if (target) target.focus();
    },

    async upload(endpoint, inputId, extra = {}) {
      const input = document.getElementById(inputId);
      if (!input.files.length) return;
      const form = new FormData();
      form.append("file", input.files[0]);
      Object.entries(extra).forEach(([key, value]) => form.append(key, value));
      await this.api(endpoint, { method: "POST", body: form });
      input.value = "";
      await this.refreshAll();
    },

    drawCharts() {
      if (!this.dashboard || !window.Chart) return;
      Object.values(this.charts).forEach((chart) => chart.destroy());
      const strategic = this.dashboard.strategic;
      this.charts.trend = new Chart(document.getElementById("trendChart"), {
        data: {
          labels: strategic.months,
          datasets: [
            { type: "bar", label: "LY Volume MT", data: strategic.last_year_mt, backgroundColor: "#8fb3ff" },
            { type: "bar", label: "CY Target MT", data: strategic.target_mt, backgroundColor: "#ffb071" },
            { type: "line", label: "YTD Actual MT", data: strategic.actual_mt, borderColor: "#003399", tension: 0.25, borderWidth: 3 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
      });
      const daily = this.dashboard.daily_by_plant || [];
      this.charts.daily = new Chart(document.getElementById("dailyChart"), {
        type: "bar",
        data: {
          labels: daily.map((x) => x.plant),
          datasets: [
            { label: "Planned Loads", data: daily.map((x) => x.planned), backgroundColor: "#ff6600" },
            { label: "Invoiced Loads", data: daily.map((x) => x.invoiced), backgroundColor: "#003399" },
          ],
        },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
      });
      const exceptions = this.dashboard.exceptions || {};
      this.charts.exceptions = new Chart(document.getElementById("exceptionChart"), {
        type: "doughnut",
        data: {
          labels: ["SAP indent missing", "Fund shortage", "Plant backlog"],
          datasets: [{ data: [exceptions.missing_indent, exceptions.fund_blocks, exceptions.logistics], backgroundColor: ["#ef4444", "#f59e0b", "#64748b"] }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
      });
      this.charts.hourly = new Chart(document.getElementById("hourlyChart"), {
        type: "line",
        data: {
          labels: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"],
          datasets: [{ label: "Loads invoiced", data: [2, 8, 17, 28, 39, 45], borderColor: "#ff6600", backgroundColor: "rgba(255,102,0,.12)", fill: true, tension: 0.3 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      });
    },
  };
}
