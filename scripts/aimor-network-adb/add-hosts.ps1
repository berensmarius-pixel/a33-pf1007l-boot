$hostsPath = "$env:windir\System32\drivers\etc\hosts"
$entry1 = "192.168.137.1 imsconnect.efercro.com"
$entry2 = "192.168.137.1 iwsconnect.efercro.com"
$content = Get-Content $hostsPath -Raw
if ($content -notmatch "imsconnect\.efercro\.com") {
    Add-Content -Path $hostsPath -Value "`r`n$entry1`r`n$entry2" -Force
    Write-Host "Einträge zu hosts hinzugefügt!"
} else {
    Write-Host "Einträge existieren bereits in hosts."
}
