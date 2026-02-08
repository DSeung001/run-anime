# Build run-anime for Windows.
Set-Location $PSScriptRoot\..
go build -o runanime.exe ./cmd/runanime
Write-Host "Built: .\runanime.exe"
