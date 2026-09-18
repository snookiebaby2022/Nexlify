# Install VS Code/Cursor extensions recommended for nexlify-panel (Open VSX via Cursor marketplace).
$ErrorActionPreference = "Stop"
$ids = @(
  "bmewburn.vscode-intelephense-client",
  "xdebug.php-debug",
  "ikappas.composer",
  "dbaeumer.vscode-eslint",
  "esbenp.prettier-vscode",
  "prisma.prisma",
  "bradlc.vscode-tailwindcss",
  "mtxr.sqltools",
  "mtxr.sqltools-driver-pg",
  "ms-azuretools.vscode-docker",
  "anysphere.remote-ssh",
  "hangxingliu.vscode-nginx-conf-hint",
  "lch.nginx-beautifier",
  "mikestead.dotenv",
  "redhat.vscode-yaml",
  "foxundermoon.shell-format",
  "timonwong.shellcheck",
  "rangav.vscode-thunder-client",
  "eamodio.gitlens",
  "mhutchie.git-graph",
  "usernamehw.errorlens",
  "gruntfuggly.todo-tree",
  "christian-kohler.path-intellisense"
)
foreach ($id in $ids) {
  Write-Host "Installing $id ..."
  & cursor --install-extension $id
}
Write-Host "Done. Copy .cursor/mcp.json.example to .cursor/mcp.json and set TEST_DATABASE_URL for postgres MCP."
