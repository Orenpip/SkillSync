How to add pdf.js to this extension (so PDF text extraction works reliably)

Why: Chrome extension popups often block loading scripts from CDNs due to Content Security Policy (CSP). To ensure `pdf.js` works, we bundle `pdf.min.js` and `pdf.worker.min.js` into `lib/` and the popup loads them with `chrome.runtime.getURL(...)`.

1) From the project root, run the bundled downloader (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\download-pdfjs.ps1
```

This will create a `lib/` folder and download:
- `lib/pdf.min.js`
- `lib/pdf.worker.min.js`

2) Reload the unpacked extension in Chrome/Edge (Extensions -> Developer mode -> Reload) and re-open the popup.

3) Test: Upload a text-based PDF as Resume or Transcript, click "Upload Documents", then "Export to CSV". The CSV should contain extracted text (or at least a large text snippet) in the Resume/Transcript columns.

Notes:
- If your environment blocks direct downloads, you can manually download the two files from a trusted CDN (e.g., cdnjs) and place them into `lib/` with those exact filenames.
- If extraction still doesn't return text (e.g., for scanned PDFs), OCR would be required (not included).
