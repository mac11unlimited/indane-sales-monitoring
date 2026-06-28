-- Optional Supabase table for future normalized storage of Invoice QR scans.
-- The current static portal stores these records inside the existing portal_state
-- JSON cloud sync payload as invoiceQrScans, so this SQL is not required for
-- the present Vercel static deployment. Use this when moving QR scans to a
-- dedicated table/API.

create table if not exists public.invoice_qr_scans (
  id text primary key,
  sap_doc_no text,
  tt_number text,
  distributor_code text,
  distributor_name text,
  delivery_number text,
  sales_order_number text,
  invoice_date text,
  invoice_time text,
  cylinders jsonb not null default '[]'::jsonb,
  raw_qr_text text,
  scan_status text not null default 'Saved',
  duplicate_of text,
  scanned_by text,
  gate_name text,
  scan_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_invoice_qr_sap_doc_no
  on public.invoice_qr_scans (sap_doc_no)
  where sap_doc_no is not null and sap_doc_no <> '';

create unique index if not exists uq_invoice_qr_delivery_number
  on public.invoice_qr_scans (delivery_number)
  where delivery_number is not null and delivery_number <> '';

create unique index if not exists uq_invoice_qr_sales_order_number
  on public.invoice_qr_scans (sales_order_number)
  where sales_order_number is not null and sales_order_number <> '';

create unique index if not exists uq_invoice_qr_tt_date
  on public.invoice_qr_scans (tt_number, invoice_date)
  where tt_number is not null and tt_number <> '' and invoice_date is not null and invoice_date <> '';
