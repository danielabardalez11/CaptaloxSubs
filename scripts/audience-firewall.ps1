#Requires -RunAsAdministrator
param([int]$Port = 3001, [string]$InterfaceAlias = 'Wi-Fi', [switch]$Remove)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Usar un puerto entre 1024 y 65535.' }
$ruleName = "NerdearlaAudienceDemo-$Port"
if ($Remove) {
    Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Output "Regla $ruleName eliminada."
    exit
}
$address = Get-NetIPAddress -InterfaceAlias $InterfaceAlias -AddressFamily IPv4 | Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
if (-not $address) { throw "No se encontro IPv4 en $InterfaceAlias. Usar -InterfaceAlias con la red correcta." }
# Only this application's named audience rule is updated. The operator port stays closed.
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) { $existing | Remove-NetFirewallRule }
New-NetFirewallRule -Name $ruleName -DisplayName "Nerdearla audiencia demo $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $address.IPAddress -RemoteAddress LocalSubnet -InterfaceAlias $InterfaceAlias -Profile Any | Out-Null
Write-Output "Audiencia permitida en http://$($address.IPAddress):$Port/viewer desde la subred local por $InterfaceAlias."
Write-Output 'No se cambio el perfil de red ni se desactivo el firewall. El puerto de control 3000 sigue local.'
