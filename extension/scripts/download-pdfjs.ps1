# Download pdf.js and its worker into the extension's lib/ folder
# Run this from PowerShell in the extension workspace root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\download-pdfjs.ps1

$libDir = Join-Path $PSScriptRoot "..\lib"
if (-Not (Test-Path $libDir)) {
  New-Item -ItemType Directory -Path $libDir -Force | Out-Null
}

$files = @(
  @{ url = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js'; out = 'pdf.min.js' },
  @{ url = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; out = 'pdf.worker.min.js' }
)

foreach ($f in $files) {
  $outPath = Join-Path $libDir $f.out
  Write-Host "Downloading $($f.url) -> $outPath"
  try {
    Invoke-WebRequest -Uri $f.url -OutFile $outPath -UseBasicParsing -ErrorAction Stop
    Write-Host "Saved: $outPath"
  } catch {
    Write-Error "Failed to download $($f.url): $_"
  }
}

Write-Host "Done. Now reload the unpacked extension in your browser and re-open the popup to use bundled pdf.js."
