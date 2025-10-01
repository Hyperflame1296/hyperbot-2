# Run the script
Clear-Host
$ver = '1.0.0-beta'
Write-Host "HyperBot 2 ($ver)" -ForegroundColor DarkGray

if (!(Test-Path './package.json')) {
    Set-Content -Path $file -Value '{ "type": "module" }'
}
if (!(Test-Path 'dist/index.js')) {
    Write-Host "File 'dist/index.js' is missing! Creating..." -ForegroundColor Red
    npm run build
} else {
    Write-Host "This is required if you don't already have the packages installed!" -ForegroundColor White -BackgroundColor Red
    $updatePackages = Read-Host 'Do you want to update all of the packages too? (y/n)'
    if ($updatePackages -eq 'y') {
        npm i -g typescript
        npm i @types/node @types/cli-color @types/ws ws node-json-db dotenv node-fetch cli-color @julusian/midi
        Write-Host 'Finished downloading the packages, executing script...' -ForegroundColor Green
    } else {
        Write-Host 'Executing script...' -ForegroundColor Green
    }
    npm start
}