$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$env:WORKSPACE_ROOT = $root
$env:AGENT_BRIDGE_CODEX_HOME = Join-Path $root '.agent_codex_home'
$env:AGENT_BRIDGE_LOG = Join-Path $root 'agent_bridge\bridge.log'
$env:AGENT_BRIDGE_HOST = '0.0.0.0'

& 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'server.mjs')
