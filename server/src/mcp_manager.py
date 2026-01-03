"""MCP Server Manager for dynamic MCP server connections."""

import logging
from typing import Optional, Union
import httpx
from livekit.agents.llm import mcp as lk_mcp

from . import mcp_config
from .mcp_config import MCPServerConfig

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
        # MCP JSON-RPC requires proper content-type headers
        # OpenMemory MCP requires Accept to include both json and event-stream
        request_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        # Merge with any custom headers (e.g., Authorization)
        if headers:
            request_headers.update(headers)

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/list",
                    "params": {}
                },
                headers=request_headers
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

    Supports both HTTP and Stdio transport types.
    """

    def __init__(self, rpc_handlers):
        # Server instances (can be MCPServerHTTP or MCPServerStdio)
        self._servers: dict[str, Union[lk_mcp.MCPServerHTTP, lk_mcp.MCPServerStdio]] = {}
        self._server_configs: dict[str, MCPServerConfig] = {}  # name -> config
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
            await self._connect_server(server_cfg)

        # Update RPC handlers with server list and tool cache
        self._rpc_handlers.set_mcp_servers(self.servers)
        self._rpc_handlers.set_mcp_tool_cache(self._tool_cache)

        logger.info(f"MCP servers loaded: {len(self._servers)} connected")

    async def _connect_server(self, config: MCPServerConfig) -> bool:
        """
        Connect to a single MCP server and track its status.

        Supports both HTTP and Stdio transport types.
        Returns True if connection successful.
        """
        name = config.name
        server_type = config.type

        try:
            if server_type == "stdio":
                logger.info(f"Connecting to Stdio MCP server '{name}' ({config.command})")
                server = lk_mcp.MCPServerStdio(
                    command=config.command,
                    args=config.args or [],
                    env=config.env,
                    cwd=config.cwd,
                )
            else:  # http
                logger.info(f"Connecting to HTTP MCP server '{name}' at {config.url}")
                server = lk_mcp.MCPServerHTTP(url=config.url, headers=config.headers)

            # Initialize the server (required for stdio servers to spawn process)
            await server.initialize()

            # Fetch tools from the connected server
            tools = await self._fetch_tools_from_server(name, server, config)
            self._tool_cache[name] = tools

            # Store the server and config
            self._servers[name] = server
            self._server_configs[name] = config

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

    async def _fetch_tools_from_server(
        self,
        name: str,
        server: Union[lk_mcp.MCPServerHTTP, lk_mcp.MCPServerStdio],
        config: MCPServerConfig
    ) -> list[dict]:
        """
        Fetch tools from a connected MCP server.

        For HTTP servers, uses the direct JSON-RPC call.
        For Stdio servers, uses the initialized client session.
        """
        try:
            if config.type == "http":
                # Use direct HTTP call for HTTP servers
                return await fetch_mcp_tools(config.url, config.headers)
            else:
                # Use the client session for stdio servers
                if hasattr(server, '_client') and server._client:
                    result = await server._client.list_tools()
                    return [
                        {
                            "name": tool.name,
                            "description": tool.description or "",
                            "inputSchema": tool.inputSchema if hasattr(tool, 'inputSchema') else {},
                        }
                        for tool in result.tools
                    ]
                else:
                    logger.warning(f"Server '{name}' has no client session")
                    return []
        except Exception as e:
            logger.error(f"Failed to fetch tools from '{name}': {e}")
            return []

    async def _disconnect_server(self, name: str):
        """Disconnect from an MCP server."""
        if name in self._servers:
            try:
                server = self._servers[name]
                # LiveKit MCP servers have aclose() for async cleanup
                if hasattr(server, "aclose"):
                    await server.aclose()
                elif hasattr(server, "close"):
                    await server.close()
                elif hasattr(server, "disconnect"):
                    await server.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting from MCP server '{name}': {e}")

            del self._servers[name]
            self._server_configs.pop(name, None)
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

        # Connect new or re-enabled servers, or reconnect if config changed
        for name in enabled_servers:
            new_cfg = config_servers[name]
            if name not in self._servers:
                # New server
                await self._connect_server(new_cfg)
            else:
                # Check if config changed (URL for HTTP, command for stdio)
                old_cfg = self._server_configs.get(name)
                if old_cfg and self._config_changed(old_cfg, new_cfg):
                    await self._disconnect_server(name)
                    await self._connect_server(new_cfg)

        # Update RPC handlers
        self._rpc_handlers.set_mcp_servers(self.servers)
        self._rpc_handlers.set_mcp_tool_cache(self._tool_cache)

        logger.info(f"MCP servers reloaded: {len(self._servers)} active")

    def _config_changed(self, old: MCPServerConfig, new: MCPServerConfig) -> bool:
        """Check if server config has changed in a way that requires reconnection."""
        if old.type != new.type:
            return True
        if old.type == "http":
            return old.url != new.url or old.headers != new.headers
        else:  # stdio
            return (
                old.command != new.command or
                old.args != new.args or
                old.env != new.env or
                old.cwd != new.cwd
            )

    async def add_server(self, config: MCPServerConfig) -> bool:
        """Add and connect to a new MCP server."""
        if config.name in self._servers:
            logger.warning(f"MCP server '{config.name}' already exists")
            return False

        success = await self._connect_server(config)
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

    def get_server_config(self, name: str) -> Optional[MCPServerConfig]:
        """Get the config for a server by name."""
        return self._server_configs.get(name)
