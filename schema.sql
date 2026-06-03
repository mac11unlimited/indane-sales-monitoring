CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(15),
    work_profile TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributors (
    sap_code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    lsa_name VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    urban_rural VARCHAR(20),
    supply_plant VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    phone_number VARCHAR(15),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS daily_spd (
    id SERIAL PRIMARY KEY,
    planning_date DATE NOT NULL,
    sap_code VARCHAR(20) REFERENCES distributors(sap_code),
    target_cylinders INT NOT NULL,
    target_loads INT NOT NULL,
    priority_level VARCHAR(20) DEFAULT 'Normal',
    backlog_qty INT DEFAULT 0,
    is_overridden BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    approved_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(planning_date, sap_code)
);

CREATE TABLE IF NOT EXISTS plant_execution (
    id SERIAL PRIMARY KEY,
    execution_date DATE NOT NULL,
    sap_code VARCHAR(20) REFERENCES distributors(sap_code),
    loads_invoiced INT DEFAULT 0,
    sap_indent_available BOOLEAN DEFAULT TRUE,
    fund_shortage_block BOOLEAN DEFAULT FALSE,
    other_issue_flag TEXT,
    entered_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(execution_date, sap_code)
);

CREATE TABLE IF NOT EXISTS monthly_baselines (
    id SERIAL PRIMARY KEY,
    fiscal_year VARCHAR(9) NOT NULL,
    month INT NOT NULL,
    sap_code VARCHAR(20) REFERENCES distributors(sap_code),
    last_year_volume_mt NUMERIC(12,3) NOT NULL,
    growth_target_pct NUMERIC(6,2) DEFAULT 0,
    UNIQUE(fiscal_year, month, sap_code)
);

CREATE TABLE IF NOT EXISTS holidays (
    holiday_date DATE PRIMARY KEY,
    label VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS mcsi_sales (
    id SERIAL PRIMARY KEY,
    sale_date DATE NOT NULL,
    ship_to_party VARCHAR(150) NOT NULL,
    sales_office VARCHAR(100),
    lsa_name VARCHAR(100),
    plant VARCHAR(50),
    material VARCHAR(150),
    billing_document VARCHAR(30),
    quantity_kg NUMERIC(14,3) DEFAULT 0,
    quantity_cylinders INT DEFAULT 0,
    quantity_loads INT DEFAULT 0,
    source_file VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS alert_logs (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    sap_code VARCHAR(20),
    message TEXT NOT NULL,
    sent_to VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_distributors_plant ON distributors(supply_plant);
CREATE INDEX IF NOT EXISTS ix_distributors_lsa ON distributors(lsa_name);
CREATE INDEX IF NOT EXISTS ix_daily_spd_date ON daily_spd(planning_date);
CREATE INDEX IF NOT EXISTS ix_execution_date ON plant_execution(execution_date);
CREATE INDEX IF NOT EXISTS ix_mcsi_date ON mcsi_sales(sale_date);
