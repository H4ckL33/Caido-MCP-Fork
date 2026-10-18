[CmdletBinding()]
param(
    [ValidateSet("Ensure", "Remove", "Status")]
    [string]$Action = "Ensure",

    [ValidateRange(1, 65535)]
    [int]$ProxyPort = 8080,

    [ValidateNotNullOrEmpty()]
    [string]$Distribution = "kali-linux"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$firewallName = "Agent Safe Caido proxy from WSL"
$hyperVRuleName = "AgentSafeCaidoProxyFromWSL"
$wslVmCreatorId = "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated PowerShell session."
    }
}

function Get-OwnedPortProxyEntries {
    $rows = @(netsh interface portproxy show v4tov4)
    foreach ($row in $rows) {
        if ($row -notmatch '^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+(\d+)\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d+)\s*$') {
            continue
        }

        $listenAddress = $Matches[1]
        $listenPort = [int]$Matches[2]
        $connectAddress = $Matches[3]
        $connectPort = [int]$Matches[4]
        if (
            $listenPort -eq $ProxyPort -and
            $connectAddress -eq "127.0.0.1" -and
            $connectPort -eq $ProxyPort
        ) {
            [pscustomobject]@{
                ListenAddress = $listenAddress
                ListenPort = $listenPort
            }
        }
    }
}

function Remove-OwnedBridge {
    foreach ($entry in @(Get-OwnedPortProxyEntries)) {
        netsh interface portproxy delete v4tov4 `
            listenaddress=$($entry.ListenAddress) `
            listenport=$($entry.ListenPort) | Out-Null
    }

    Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule

    if (Get-Command Get-NetFirewallHyperVRule -ErrorAction SilentlyContinue) {
        Get-NetFirewallHyperVRule `
            -PolicyStore ActiveStore `
            -Name $hyperVRuleName `
            -ErrorAction SilentlyContinue |
            Remove-NetFirewallHyperVRule
    }
}

function Get-NatGateway {
    $route = @(& wsl.exe -d $Distribution -- ip -4 route show default 2>$null) -join " "
    if ($LASTEXITCODE -ne 0 -or $route -notmatch 'default via (\d{1,3}(?:\.\d{1,3}){3})') {
        throw "Could not resolve the NAT gateway for WSL distribution '$Distribution'."
    }
    return $Matches[1]
}

function Get-WslAdapter([string]$Gateway) {
    $address = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Gateway -ErrorAction Stop |
        Select-Object -First 1
    $adapter = Get-NetAdapter -IncludeHidden -InterfaceIndex $address.InterfaceIndex -ErrorAction Stop
    if ($adapter.Name -notmatch 'WSL') {
        throw "The resolved gateway is not owned by a WSL adapter."
    }
    return $adapter
}

function Test-Bridge([string]$Gateway) {
    $url = "http://${Gateway}:$ProxyPort/"
    $result = @(
        & wsl.exe -d $Distribution -- curl `
            --silent `
            --show-error `
            --output /dev/null `
            --write-out '__STATUS__%{http_code}' `
            --max-time 5 `
            $url 2>$null
    ) -join " "
    return $LASTEXITCODE -eq 0 -and $result -match '__STATUS__(200|307)'
}

Assert-Administrator

if ($Action -eq "Remove") {
    Remove-OwnedBridge
    [pscustomobject]@{
        Action = "Remove"
        Distribution = $Distribution
        ProxyPort = $ProxyPort
        Operational = $false
    }
    exit 0
}

$gateway = Get-NatGateway
$adapter = Get-WslAdapter -Gateway $gateway

if ($Action -eq "Status") {
    [pscustomobject]@{
        Action = "Status"
        Distribution = $Distribution
        ProxyPort = $ProxyPort
        Interface = $adapter.Name
        Operational = Test-Bridge -Gateway $gateway
    }
    exit 0
}

foreach ($command in @(
    "Get-NetFirewallHyperVRule",
    "New-NetFirewallHyperVRule",
    "Remove-NetFirewallHyperVRule"
)) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required Hyper-V firewall command '$command' is unavailable."
    }
}

Remove-OwnedBridge
Start-Service -Name iphlpsvc

netsh interface portproxy add v4tov4 `
    listenaddress=$gateway `
    listenport=$ProxyPort `
    connectaddress=127.0.0.1 `
    connectport=$ProxyPort | Out-Null

New-NetFirewallRule `
    -DisplayName $firewallName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $ProxyPort `
    -InterfaceAlias $adapter.Name `
    -Profile Any | Out-Null

New-NetFirewallHyperVRule `
    -PolicyStore ActiveStore `
    -Name $hyperVRuleName `
    -DisplayName $firewallName `
    -Direction Inbound `
    -VMCreatorId $wslVmCreatorId `
    -Protocol TCP `
    -LocalPorts $ProxyPort `
    -Action Allow `
    -Enabled True | Out-Null

if (-not (Test-Bridge -Gateway $gateway)) {
    Remove-OwnedBridge
    throw "The WSL-to-Caido bridge failed its connectivity check and was removed."
}

[pscustomobject]@{
    Action = "Ensure"
    Distribution = $Distribution
    ProxyPort = $ProxyPort
    Interface = $adapter.Name
    Operational = $true
}
