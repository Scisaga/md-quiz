from __future__ import annotations

import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_admin_router_registers_mcp_route() -> None:
    source = (ROOT / "static" / "admin" / "modules" / "router.js").read_text(encoding="utf-8")
    nav_source = (ROOT / "static" / "admin" / "modules" / "state.js").read_text(encoding="utf-8")
    status_source = (ROOT / "static" / "admin" / "modules" / "pages" / "status.js").read_text(encoding="utf-8")

    assert 'mcp: { fragment: "/static/admin/pages/mcp.html"' in source
    assert '/admin/mcp' in nav_source
    assert 'label: "MCP"' in nav_source
    assert 'copyMcpUrl' in status_source
    assert 'copyMcpToken' in status_source
    assert 'mcpClientConfigs' in status_source
    assert "Hermes" in status_source
    assert "OpenClaw" not in status_source
    assert "VS Code" in status_source
    assert "Codex" in status_source
    assert 'const iconUrl = (path) => this.absoluteUrl(`${path}?v=20260707-hermes-logo-crop`);' in status_source
    assert 'key:"hermes"' in status_source
    assert 'icon: iconUrl("/static/assets/img/brands/hermes.png")' in status_source
    assert 'icon: iconUrl("/static/assets/img/brands/vscode.png")' in status_source
    assert 'icon: iconUrl("/static/assets/img/brands/codex.png")' in status_source
    hermes_icon = ROOT / "static" / "assets" / "img" / "brands" / "hermes.png"
    assert hermes_icon.exists()
    hermes_icon_data = hermes_icon.read_bytes()
    assert hermes_icon_data.startswith(b"\x89PNG\r\n\x1a\n")
    width, height = struct.unpack(">II", hermes_icon_data[16:24])
    assert width < 512
    assert height < 512


def test_admin_mcp_page_fragment_contains_actions() -> None:
    source = (ROOT / "static" / "admin" / "pages" / "mcp.html").read_text(encoding="utf-8")

    assert "复制 MCP 地址" in source
    assert "打开 MCP 文档" in source
    assert "Bearer Token" in source
    assert 'client.icon' in source
    assert "backgroundImage" in source
    assert 'class="flex min-w-0 items-center gap-3"' in source
    assert 'class="block h-11 w-11 shrink-0 bg-contain bg-center bg-no-repeat"' in source
    assert 'class="mt-0.5 block h-8 w-8 shrink-0 bg-contain bg-center bg-no-repeat"' not in source
    assert 'h-9 w-9 shrink-0 bg-contain' not in source
