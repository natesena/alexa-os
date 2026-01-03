"""MCP server configuration store for dynamic management."""

import json
import logging
import os
from pathlib import Path
from typing import Literal, Optional
from pydantic import BaseModel, model_validator

logger = logging.getLogger("alexa-os")

# Default config file location (next to server source)
DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "mcp_servers.json"


class MCPServerConfig(BaseModel):
    """Configuration for a single MCP server.

    Supports two transport types:
    - "http": HTTP-based MCP servers (requires url)
    - "stdio": Command-based MCP servers (requires command)
    """
    name: str
    type: Literal["http", "stdio"] = "http"  # Default to HTTP for backward compatibility

    # HTTP-specific fields
    url: Optional[str] = None
    headers: Optional[dict[str, str]] = None  # Optional headers (e.g., Authorization)

    # Stdio-specific fields
    command: Optional[str] = None
    args: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None
    cwd: Optional[str] = None

    # Common fields
    enabled: bool = True
    allowed_tools: Optional[list[str]] = None  # None means all tools allowed

    @model_validator(mode='after')
    def validate_type_fields(self):
        """Validate that required fields are present based on server type."""
        if self.type == "http" and not self.url:
            raise ValueError("HTTP servers require 'url' field")
        if self.type == "stdio" and not self.command:
            raise ValueError("Stdio servers require 'command' field")
        return self


class MCPConfig(BaseModel):
    """Root configuration containing all MCP servers."""
    servers: list[MCPServerConfig] = []


def get_config_path() -> Path:
    """Get the path to the MCP config file."""
    # Allow override via environment variable
    env_path = os.environ.get("MCP_CONFIG_PATH")
    if env_path:
        return Path(env_path)
    return DEFAULT_CONFIG_PATH


def load_config() -> MCPConfig:
    """
    Load MCP configuration from JSON file.

    Returns an empty config if file doesn't exist.
    """
    config_path = get_config_path()

    if not config_path.exists():
        logger.info(f"MCP config file not found at {config_path}, using empty config")
        return MCPConfig(servers=[])

    try:
        with open(config_path, "r") as f:
            data = json.load(f)
        config = MCPConfig.model_validate(data)
        logger.info(f"Loaded MCP config with {len(config.servers)} server(s)")
        return config
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse MCP config file: {e}")
        return MCPConfig(servers=[])
    except Exception as e:
        logger.error(f"Failed to load MCP config: {e}")
        return MCPConfig(servers=[])


def save_config(config: MCPConfig) -> bool:
    """
    Save MCP configuration to JSON file.

    Returns True on success, False on failure.
    """
    config_path = get_config_path()

    try:
        # Ensure parent directory exists
        config_path.parent.mkdir(parents=True, exist_ok=True)

        with open(config_path, "w") as f:
            json.dump(config.model_dump(), f, indent=2)

        logger.info(f"Saved MCP config with {len(config.servers)} server(s)")
        return True
    except Exception as e:
        logger.error(f"Failed to save MCP config: {e}")
        return False


def add_server(
    name: str,
    server_type: Literal["http", "stdio"] = "http",
    # HTTP fields
    url: Optional[str] = None,
    headers: Optional[dict[str, str]] = None,
    # Stdio fields
    command: Optional[str] = None,
    args: Optional[list[str]] = None,
    env: Optional[dict[str, str]] = None,
    cwd: Optional[str] = None,
    # Common fields
    enabled: bool = True,
    allowed_tools: Optional[list[str]] = None,
) -> tuple[bool, str]:
    """
    Add a new MCP server to the configuration.

    For HTTP servers, url is required.
    For Stdio servers, command is required.

    Returns (success, message) tuple.
    """
    config = load_config()

    # Check for duplicate names
    if any(s.name == name for s in config.servers):
        return False, f"Server with name '{name}' already exists"

    # Check for duplicate URLs (HTTP only)
    if server_type == "http" and url:
        if any(s.url == url for s in config.servers):
            return False, f"Server with URL '{url}' already exists"

    try:
        new_server = MCPServerConfig(
            name=name,
            type=server_type,
            url=url,
            headers=headers,
            command=command,
            args=args,
            env=env,
            cwd=cwd,
            enabled=enabled,
            allowed_tools=allowed_tools,
        )
    except ValueError as e:
        return False, str(e)

    config.servers.append(new_server)

    if save_config(config):
        if server_type == "http":
            logger.info(f"Added HTTP MCP server: {name} ({url})")
        else:
            logger.info(f"Added Stdio MCP server: {name} ({command})")
        return True, f"Added server '{name}'"
    else:
        return False, "Failed to save configuration"


def remove_server(name: str) -> tuple[bool, str]:
    """
    Remove an MCP server from the configuration.

    Returns (success, message) tuple.
    """
    config = load_config()

    original_count = len(config.servers)
    config.servers = [s for s in config.servers if s.name != name]

    if len(config.servers) == original_count:
        return False, f"Server '{name}' not found"

    if save_config(config):
        logger.info(f"Removed MCP server: {name}")
        return True, f"Removed server '{name}'"
    else:
        return False, "Failed to save configuration"


def toggle_server(name: str, enabled: Optional[bool] = None) -> tuple[bool, str]:
    """
    Toggle or set the enabled state of an MCP server.

    If enabled is None, toggles the current state.
    If enabled is a bool, sets to that value.

    Returns (success, message) tuple.
    """
    config = load_config()

    for server in config.servers:
        if server.name == name:
            if enabled is None:
                server.enabled = not server.enabled
            else:
                server.enabled = enabled

            if save_config(config):
                state = "enabled" if server.enabled else "disabled"
                logger.info(f"Toggled MCP server {name} to {state}")
                return True, f"Server '{name}' is now {state}"
            else:
                return False, "Failed to save configuration"

    return False, f"Server '{name}' not found"


def update_allowed_tools(name: str, allowed_tools: Optional[list[str]]) -> tuple[bool, str]:
    """
    Update the allowed tools for an MCP server.

    Set to None to allow all tools.
    Set to an empty list to disable all tools.
    Set to a list of tool names to allow only those tools.

    Returns (success, message) tuple.
    """
    config = load_config()

    for server in config.servers:
        if server.name == name:
            server.allowed_tools = allowed_tools

            if save_config(config):
                if allowed_tools is None:
                    msg = f"Server '{name}' now allows all tools"
                elif len(allowed_tools) == 0:
                    msg = f"Server '{name}' now has all tools disabled"
                else:
                    msg = f"Server '{name}' now allows {len(allowed_tools)} tool(s)"

                logger.info(msg)
                return True, msg
            else:
                return False, "Failed to save configuration"

    return False, f"Server '{name}' not found"


def get_server(name: str) -> Optional[MCPServerConfig]:
    """
    Get a specific MCP server configuration by name.

    Returns None if not found.
    """
    config = load_config()
    for server in config.servers:
        if server.name == name:
            return server
    return None


def get_enabled_servers() -> list[MCPServerConfig]:
    """
    Get all enabled MCP servers.
    """
    config = load_config()
    return [s for s in config.servers if s.enabled]
