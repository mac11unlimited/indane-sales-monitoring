# HP ScanJet Pro 2000 s2 Gate OCR Integration

This portal can integrate with an HP ScanJet Pro 2000 s2 through a local Windows scanner bridge.

## Why A Bridge Is Required

A public web portal cannot directly control a USB scanner from the browser. The reliable setup is:

1. Scanner is connected to one Gate-2 Windows PC.
2. HP Scan / HP Smart saves each scanned Invoice or ERV as PDF/JPG into a fixed folder.
3. `start-hp-scanjet-agent.cmd` watches that folder.
4. The agent submits every new scan to the portal OCR API.
5. The portal polls the local scanner bridge and shows a popup to the security guard.
6. Security guard accepts or rejects the scan.
7. Accepted scan fills the Gate IN / Gate OUT entry form for final verification and save.

## One-Time Setup

1. Install HP ScanJet Pro 2000 s2 full driver / HP Scan software.
2. Create this folder:

```text
%USERPROFILE%\Documents\Indane-Scanner-Inbox
```

3. In HP Scan, set output format as PDF or JPG.
4. Set HP Scan save folder as:

```text
%USERPROFILE%\Documents\Indane-Scanner-Inbox
```

5. Start the portal backend and ensure `/api/lpg/ocr/extract` is working.
6. Double-click:

```text
start-hp-scanjet-agent.cmd
```

Keep this window open.

The agent also starts a local popup bridge:

```text
http://127.0.0.1:8765
```

When the security guard is logged in to the portal on the same scanner PC, the portal checks this bridge every few seconds and shows a popup when a new scan is ready.

## Online Portal Setup

If using the online backend, set these Windows environment variables before starting the agent:

```bat
set PORTAL_BASE_URL=https://your-backend-domain.example.com
set PORTAL_USERNAME=security_loni_1
set PORTAL_PASSWORD=your_password
start-hp-scanjet-agent.cmd
```

For local backend:

```bat
set PORTAL_BASE_URL=http://127.0.0.1:8000
```

## Daily Gate Workflow

1. Driver gives Tax Invoice or ERV.
2. Security puts document into HP ScanJet feeder.
3. Security presses Scan in HP Scan software.
4. Agent detects new PDF/JPG automatically.
5. Agent calls OCR backend.
6. Portal popup appears: **New document scanned from HP ScanJet**.
7. Security checks extracted Invoice / ERV details.
8. Security clicks **Accept Scan & Fill Gate Entry** or **Reject / Rescan**.
9. If accepted, Gate-2 form is filled.
10. Security verifies fields and clicks **Save Gate-2 Entry**.

Output also appears in:

```text
%USERPROFILE%\Documents\Indane-Scanner-Output
```

Each scan creates:

```text
<scan-file-name>.ocr.json
```

Pending popup queue is stored in:

```text
scan-queue.json
```

or, if there is an error:

```text
<scan-file-name>.error.json
```

## Optional Direct WIA Scan

Some HP drivers expose Windows WIA. If available:

```bat
python tools\hp_scanjet_agent.py --scan-once --once
```

If WIA is unavailable, use the recommended folder-watch method.

## Notes

- OCR quality is best when HP Scan output is 200 DPI or 300 DPI.
- PDF is preferred over phone photo.
- If the PDF has real text, backend uses `pdfplumber`.
- If the PDF is image-only, backend renders with `pdf2image` and sends the image to vision extraction.
- If Poppler is missing, install Poppler or set `POPPLER_PATH`.
