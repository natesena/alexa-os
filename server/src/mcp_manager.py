"""MCP Server Manager for dynamic MCP server connections."""

import logging
from typing import Optional
import httpx
from livekit.agents import mcp

from . import mcp_config

logger = logging.getLogger("alexa-os")


async def fetch_mcp_tools(url: str, headers: Optional[dict[str, str]] = None) -> list[dict]:
    """
    Fetch tools from an MCP server via JSON-RPC.

    Makes a direct HTTP call to the MCP server's tools/list method
    to get raw tool metadata before LiveKit wraps them as functions.

    Returns list of tool dicts with name, description, inputSchema.
    """
    logger.info(f"[DEBUG] fetch_mcp_tools called for URL: {url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/list",
                    "params": {}
                },
                headers=headers or {}
            )
            response.raise_for_status()
            data = response.json()
            logger.info(f"[DEBUG] MCP response keys: {list(data.keys())}")

            if "error" in data:
                logger.error(f"MCP tools/list error: {data['error']}")
                return []

            tools = data.get("result", {}).get("tools", [])
            logger.info(f"[DEBUG] Fetched {len(tools)} tools from MCP server at {url}")
            if tools:
                logger.info(f"[DEBUG] Tool names: {[t.get('name', '?') for t in tools]}")
            return tools
    except Exception as e:
        logger.error(f"Failed to fetch MCP tools from {url}: {e}")
        return []


class MCPServerManager:
    """
    Manages MCP server connections with dynamic add/remove/toggle support.

    Loads configuration from mcp_servers.json and tracks connection status.
    Also caches tool metadata fetched directly via MCP JSON-RPC.
    """

    def __init__(self, rpc_handlers):
        self._servers: dict[str, mcp.MCPServerHTTP] = {}  # name -> server instance
        self._server_urls: dict[str, str] = {}  # name -> url for matching
        self._server_headers: dict[str, dict[str, str]] = {}  # name -> headers
        self._tool_cache: dict[str, list[dict]] = {}  # name -> list of tool metadata
        self._rpc_handlers = rpc_handlers

    @property
    def servers(self) -> list:
        """Return list of active MCP server instances."""
        return list(self._servers.values())

    def get_cached_tools(self, server_name: str) -> list[dict]:
        """Get cached tool metadata for a server."""
        return self._tool_cache.get(server_name, [])

    def get_all_cached_tools(self) -> dict[str, list[dict]]:
        """Get all cached tool metadata."""
        return self._tool_cache.copy()

    async def load_from_config(self):
        """Load and connect to all enabled MCP servers from config."""
        config = mcp_config.load_config()
        enabled_servers = [s for s in config.servers if s.enabled]

        logger.info(f"Loading {len(enabled_servers)} enabled MCP server(s) from config")

        for server_cfg in enabled_servers:
            await self._connect_server(server_cfg.name, server_cfg.url, server_cfg.headers)

        # Update RPC handlers with server list and tool cache
        self._rpc_handlers.set_mcp_servers(self.servers)
        self._rpc_handlers.set_mcp_tool_cache(self._tool_cache)

        logger.info(f"MCP servers loaded: {len(self._servers)} connected")

    async def _connect_server(self, name: str, url: str, headers: dict[str, str] | None = None) -> bool:
        """
        Connect to a single MCP server and track its status.

        Returns True if connection successful.
        """
        try:
            logger.info(f"Connecting to MCP server '{name}' at {url}")

            # Fetch tools directly via MCP JSON-RPC before LiveKit wraps them
            tools = await fetch_mcp_tools(url, headers)
            self._tool_cache[name] = tools

            # Create LiveKit MCP server instance
            server = mcp.MCPServerHTTP(url=url, headers=headers)

            # Store the server
            self._servers[name] = server
            self._server_urls[name] = url
            self._server_headers[name] = headers or {}

            # Update status with tool count
            self._rpc_handlers.set_mcp_server_status(
                name, "connected", tool_count=len(tools)
            )
            logger.info(f"MCP server '{name}' connected with {len(tools)} tools")
            return True

        except Exception as e:
            logger.error(f"Failed to connect MCP server '{name}': {e}")
            self._rpc_handlers.set_mcp_server_status(name, "error", error=str(e))
            return False

    async def _disconnect_server(self, name: str):
        """Disconnect from an MCP server."""
        if name in self._servers:
            try:
                server = self._servers[name]
                if hasattr(server, "close"):
                    await server.close()
                elif hasattr(server, "disconnect"):
                    await server.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting from MCP server '{name}': {e}")

            del self._servers[name]
            del self._server_urls[name]
            self._server_headers.pop(name, None)
            self._tool_cache.pop(name, None)
            logger.info(f"Disconnected from MCP server '{name}'")

    async def reload(self):
        """
        Reload MCP servers from config.

        Handles add/remove/toggle changes by comparing current state
        with config and making necessary connections/disconnections.
        """
        config = mcp_config.load_config()

        current_servers = set(self._servers.keys())
        config_servers = {s.name: s for s in config.servers}
        enabled_servers = {s.name for s in config.servers if s.enabled}

        # Disconnect servers that were removed or disabled
        for name in current_servers:
            if name not in config_servers or name not in enabled_servers:
                await self._disconnect_server(name)

        # Connect new or re-enabled servers
        for name in enabled_servers:
            if name not in self._servers:
                server_cfg = config_servers[name]
                await self._connect_server(name, server_cfg.url, server_cfg.headers)
            elif self._server_urls.get(name) != config_servers[name].url:
                # URL changed, reconnect
                await self._disconnect_server(name)
                server_cfg = config_servers[name]
                await self._connect_server(name, server_cfg.url, server_cfg.headers)

        # Update RPC handlers
        self._rpc_handlers.set_mcp_servers(self.servers)
        self._rpc_handlers.set_mcp_tool_cache(self._tool_cache)

        logger.info(f"MCP servers reloaded: {len(self._servers)} active")

    async def add_server(self, name: str, url: str, headers: dict[str, str] | None = None) -> bool:
        """Add and connect to a new MCP server."""
        if name in self._servers:
            logger.warning(f"MCP server '{name}' already exists")
            return False

        success = await self._connect_server(name, url, headers)
        if success:
            self._rpc_handlers.set_mcp_servers(self.servers)
            self._rpc_handlers.set_mcp_tool_cache(self._tool_cache)
        return success

    async def remove_server(self, name: str) -> bool:
        """Remove and disconnect from an MCP server."""
        if name not in self._servers:
            logger.warning(f"MCP server '{name}' not found")
            return False

        await self._disconnect_server(name)
        self._rpc_handlers.set_mcp_servers(self.servers)
        self._rpc_handlers.set_mcp_tool_cache(self._tool_cache)
        return True

    def get_server_by_name(self, name: str):
        """Get an MCP server instance by name."""
        return self._servers.get(name)
