# HP ScanJet Pro 2000 s2 Gate OCR Integration

This portal can integrate with an HP ScanJet Pro 2000 s2 through a local Windows scanner bridge.

## Why A Bridge Is Required

A public web portal cannot directly control a USB scanner from the browser. The reliable setup is:

1. Scanner is connected to one Gate-2 Windows PC.
2. HP Scan / HP Smart saves each scanned Invoice or ERV as PDF/JPG into a fixed folder.
3. `start-hp-scanjet-agent.cmd` watches that folder.
4. The agent submits every new scan to the portal OCR API.
5. Extracted JSON is saved for audit and can be used for Gate IN / Gate OUT posting.

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
6. Output appears in:

```text
%USERPROFILE%\Documents\Indane-Scanner-Output
```

Each scan creates:

```text
<scan-file-name>.ocr.json
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
