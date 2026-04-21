Write-Host "Building NutriLabel for desktop..." -ForegroundColor Green
Write-Host ""
Write-Host "Step 1/4: Building Next.js standalone..."
bun run build
Write-Host ""
Write-Host "Step 2/4: Copying production server entry point..."
Copy-Item -Force server.js .next\standalone\server.js
Write-Host ""
Write-Host "Step 3/4: Copying static assets..."
Copy-Item -Recurse -Force .next\static .next\standalone\.next\static
Copy-Item -Recurse -Force public .next\standalone\public
Write-Host ""
Write-Host "Step 4/4: Building Tauri app..."
Set-Location src-tauri
cargo tauri build
Write-Host ""
Write-Host "Build complete! Find your installer in src-tauri\target\release\bundle\" -ForegroundColor Green
