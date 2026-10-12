$hostsPath = "$env:windir\System32\drivers\etc\hosts"
(Get-Content $hostsPath) | Where-Object { $_ -notmatch "efercro\.com" } | Set-Content $hostsPath -Force
Write-Host "Einträge aus hosts entfernt!"
