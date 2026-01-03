"""RPC handlers for agent control and observability."""

import json
import logging
import os
from pathlib import Path
from typing import Callable, Optional, Any
from livekit.rtc import Room, RpcInvocationData
import ollama

from . import mcp_config

# Config file for persistent agent settings (system prompt, etc.)
AGENT_CONFIG_PATH = Path(__file__).parent.parent / "agent_config.json"

DEFAULT_SYSTEM_PROMPT = """You are Jarvis, a helpful voice assistant.

Key behaviors:
- Keep responses concise and conversational - this is voice, not text
- Be friendly and natural in tone
- When you don't know something, say so directly
- For complex questions, break down the answer into digestible parts
- Use simple language, avoid jargon unless asked

You can help with:
- Answering questions on any topic
- Having casual conversations
- Providing information and explanations
- Helping with tasks and planning

Remember: You're speaking, not writing. Keep it brief and natural."""

logger = logging.getLogger("alexa-os")


class AgentRpcHandlers:
    """Manages RPC handlers for agent control."""

    def __init__(self, room: Room, ollama_host: str):
        self.room = room
        self.ollama_host = ollama_host
        self._current_model: Optional[str] = None
        self._stt_model: Optional[str] = None
        self._tts_provider: Optional[str] = None
        self._vad_settings: Optional[dict] = None
        self._on_model_change: Optional[Callable[[str], None]] = None
        self._on_interrupt: Optional[Callable[[], None]] = None
        self._mcp_servers: list = []
        self._mcp_server_status: dict[str, dict] = {}  # name -> {status, error, tool_count}
        self._mcp_tool_cache: dict[str, list[dict]] = {}  # name -> list of tool metadata
        self._on_mcp_change: Optional[Callable[[], Any]] = None
        self._on_vad_change: Optional[Callable[[dict], Any]] = None
        # System prompt
        self._system_prompt: str = self._load_system_prompt()
        self._on_system_prompt_change: Optional[Callable[[str], Any]] = None
        # Wake word state
        self._wake_word_enabled: bool = False
        self._wake_word_state: str = "disabled"  # "disabled", "listening", "active"
        self._wake_word_model: Optional[str] = None

    def set_model(self, model: str):
        """Set the current LLM model name."""
        self._current_model = model

    def set_stt_model(self, model: str):
        """Set the current STT model name."""
        self._stt_model = model

    def set_tts_provider(self, provider: str):
        """Set the current TTS provider."""
        self._tts_provider = provider

    def set_vad_settings(self, settings: dict):
        """Set the current VAD settings."""
        self._vad_settings = settings

    def set_model_change_callback(self, callback: Callable[[str], None]):
        """Set callback for model changes."""
        self._on_model_change = callback

    def set_interrupt_callback(self, callback: Callable[[], None]):
        """Set callback for interrupt requests."""
        self._on_interrupt = callback

    def set_mcp_servers(self, servers: list):
        """Set MCP servers for tool listing."""
        self._mcp_servers = servers

    def set_mcp_server_status(self, name: str, status: str, error: Optional[str] = None, tool_count: int = 0):
        """Update the status of a specific MCP server."""
        self._mcp_server_status[name] = {
            "status": status,
            "error": error,
            "tool_count": tool_count,
        }

    def set_mcp_change_callback(self, callback: Callable[[], Any]):
        """Set callback for MCP configuration changes (add/remove/toggle)."""
        self._on_mcp_change = callback

    def set_vad_change_callback(self, callback: Callable[[dict], Any]):
        """Set callback for VAD settings changes."""
        self._on_vad_change = callback

    def set_system_prompt_change_callback(self, callback: Callable[[str], Any]):
        """Set callback for system prompt changes."""
        self._on_system_prompt_change = callback

    def get_system_prompt(self) -> str:
        """Get the current system prompt."""
        return self._system_prompt

    def _load_config(self) -> dict:
        """Load the entire config from persistent file."""
        try:
            if AGENT_CONFIG_PATH.exists():
                with open(AGENT_CONFIG_PATH, "r") as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load agent config: {e}")
        return {}

    def _save_config(self, updates: dict):
        """Save updates to the persistent config file."""
        try:
            config = self._load_config()
            config.update(updates)
            with open(AGENT_CONFIG_PATH, "w") as f:
                json.dump(config, f, indent=2)
            logger.info(f"Saved config updates: {list(updates.keys())}")
        except Exception as e:
            logger.error(f"Failed to save agent config: {e}")
            raise

    def _load_system_prompt(self) -> str:
        """Load system prompt from persistent config file."""
        config = self._load_config()
        return config.get("system_prompt", DEFAULT_SYSTEM_PROMPT)

    def _load_vad_settings(self) -> Optional[dict]:
        """Load VAD settings from persistent config file."""
        config = self._load_config()
        return config.get("vad_settings")

    def _save_system_prompt(self, prompt: str):
        """Save system prompt to persistent config file."""
        self._save_config({"system_prompt": prompt})

    def _save_vad_settings(self, settings: dict):
        """Save VAD settings to persistent config file."""
        self._save_config({"vad_settings": settings})

    def set_mcp_tool_cache(self, cache: dict[str, list[dict]]):
        """Set the MCP tool metadata cache (server_name -> list of tool dicts)."""
        logger.info(f"[DEBUG] set_mcp_tool_cache called with keys: {list(cache.keys())}")
        for name, tools in cache.items():
            logger.info(f"[DEBUG] Cache '{name}': {len(tools)} tools")
            if tools:
                logger.info(f"[DEBUG] First tool in '{name}': {tools[0].get('name', 'unknown')}")
        self._mcp_tool_cache = cache

    def set_wake_word_config(self, enabled: bool, model: Optional[str] = None):
        """Set wake word configuration."""
        self._wake_word_enabled = enabled
        self._wake_word_model = model
        self._wake_word_state = "listening" if enabled else "disabled"

    def set_wake_word_state(self, state: str):
        """Update wake word state."""
        self._wake_word_state = state

    async def register_all(self):
        """Register all RPC handlers on local participant."""
        local = self.room.local_participant

        @local.register_rpc_method("list_models")
        async def handle_list_models(data: RpcInvocationData) -> str:
            return await self._list_models(data)

        @local.register_rpc_method("switch_model")
        async def handle_switch_model(data: RpcInvocationData) -> str:
            return await self._switch_model(data)

        @local.register_rpc_method("interrupt")
        async def handle_interrupt(data: RpcInvocationData) -> str:
            return await self._interrupt(data)

        @local.register_rpc_method("list_tools")
        async def handle_list_tools(data: RpcInvocationData) -> str:
            return await self._list_tools(data)

        @local.register_rpc_method("get_agent_state")
        async def handle_get_state(data: RpcInvocationData) -> str:
            return await self._get_agent_state(data)

        @local.register_rpc_method("get_wake_word_state")
        async def handle_get_wake_word_state(data: RpcInvocationData) -> str:
            return await self._get_wake_word_state(data)

        @local.register_rpc_method("set_vad_settings")
        async def handle_set_vad_settings(data: RpcInvocationData) -> str:
            return await self._set_vad_settings(data)

        # System prompt RPC methods
        @local.register_rpc_method("get_system_prompt")
        async def handle_get_system_prompt(data: RpcInvocationData) -> str:
            return await self._get_system_prompt_rpc(data)

        @local.register_rpc_method("set_system_prompt")
        async def handle_set_system_prompt(data: RpcInvocationData) -> str:
            return await self._set_system_prompt_rpc(data)

        # MCP management RPC methods
        @local.register_rpc_method("list_mcp_servers")
        async def handle_list_mcp_servers(data: RpcInvocationData) -> str:
            return await self._list_mcp_servers(data)

        @local.register_rpc_method("add_mcp_server")
        async def handle_add_mcp_server(data: RpcInvocationData) -> str:
            return await self._add_mcp_server(data)

        @local.register_rpc_method("remove_mcp_server")
        async def handle_remove_mcp_server(data: RpcInvocationData) -> str:
            return await self._remove_mcp_server(data)

        @local.register_rpc_method("toggle_mcp_server")
        async def handle_toggle_mcp_server(data: RpcInvocationData) -> str:
            return await self._toggle_mcp_server(data)

        @local.register_rpc_method("list_mcp_tools")
        async def handle_list_mcp_tools(data: RpcInvocationData) -> str:
            return await self._list_mcp_tools(data)

        @local.register_rpc_method("toggle_mcp_tool")
        async def handle_toggle_mcp_tool(data: RpcInvocationData) -> str:
            return await self._toggle_mcp_tool(data)

        logger.info(
            "Registered RPC handlers: list_models, switch_model, interrupt, list_tools, get_agent_state, "
            "get_wake_word_state, set_vad_settings, list_mcp_servers, add_mcp_server, remove_mcp_server, "
            "toggle_mcp_server, list_mcp_tools, toggle_mcp_tool"
        )

    async def _list_models(self, data: RpcInvocationData) -> str:
        """List available Ollama models."""
        try:
            client = ollama.AsyncClient(host=self.ollama_host)
            models_response = await client.list()
            models = [
                {
                    "name": m.get("name", m.get("model", "")),
                    "size": m.get("size", 0),
                    "modified_at": str(m.get("modified_at", "")),
                }
                for m in models_response.get("models", [])
            ]
            logger.info(f"Listed {len(models)} Ollama models")
            return json.dumps(
                {
                    "success": True,
                    "models": models,
                    "current_model": self._current_model,
                }
            )
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _switch_model(self, data: RpcInvocationData) -> str:
        """Switch to a different Ollama model."""
        try:
            payload = json.loads(data.payload)
            new_model = payload.get("model")
            if not new_model:
                return json.dumps({"success": False, "error": "No model specified"})

            # Validate model exists
            client = ollama.AsyncClient(host=self.ollama_host)
            models_response = await client.list()
            available = [
                m.get("name", m.get("model", ""))
                for m in models_response.get("models", [])
            ]

            if new_model not in available:
                return json.dumps(
                    {
                        "success": False,
                        "error": f"Model '{new_model}' not available. Available: {available}",
                    }
                )

            old_model = self._current_model
            self._current_model = new_model

            if self._on_model_change:
                self._on_model_change(new_model)

            logger.info(f"Switched model from {old_model} to {new_model}")
            return json.dumps(
                {
                    "success": True,
                    "old_model": old_model,
                    "new_model": new_model,
                }
            )
        except Exception as e:
            logger.error(f"Failed to switch model: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _interrupt(self, data: RpcInvocationData) -> str:
        """Interrupt current agent response."""
        try:
            if self._on_interrupt:
                self._on_interrupt()
            logger.info("Agent interrupted via RPC")
            return json.dumps({"success": True, "message": "Interrupted"})
        except Exception as e:
            logger.error(f"Failed to interrupt: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _list_tools(self, data: RpcInvocationData) -> str:
        """List all available MCP tools from cache."""
        try:
            all_tools = []
            for server_name, tools in self._mcp_tool_cache.items():
                for tool in tools:
                    all_tools.append({
                        "name": tool.get("name", "unknown"),
                        "description": tool.get("description", ""),
                        "server": server_name,
                    })

            logger.info(f"Listed {len(all_tools)} MCP tools")
            return json.dumps({
                "success": True,
                "tools": all_tools,
                "count": len(all_tools),
            })
        except Exception as e:
            logger.error(f"Failed to list tools: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _get_agent_state(self, data: RpcInvocationData) -> str:
        """Get current agent state."""
        return json.dumps(
            {
                "success": True,
                "llm_model": self._current_model,
                "stt_model": self._stt_model,
                "tts_provider": self._tts_provider,
                "vad_settings": self._vad_settings,
                "mcp_servers_count": len(self._mcp_servers),
                "wake_word_enabled": self._wake_word_enabled,
                "wake_word_state": self._wake_word_state,
                "wake_word_model": self._wake_word_model,
            }
        )

    async def _get_wake_word_state(self, data: RpcInvocationData) -> str:
        """Get current wake word detection state."""
        return json.dumps(
            {
                "success": True,
                "enabled": self._wake_word_enabled,
                "state": self._wake_word_state,
                "model": self._wake_word_model,
            }
        )

    async def _set_vad_settings(self, data: RpcInvocationData) -> str:
        """Update VAD settings."""
        try:
            payload = json.loads(data.payload) if data.payload else {}

            # Validate and extract settings
            new_settings = {}
            if "activation_threshold" in payload:
                val = float(payload["activation_threshold"])
                if 0.0 <= val <= 1.0:
                    new_settings["activation_threshold"] = val
                else:
                    return json.dumps({"success": False, "error": "activation_threshold must be between 0.0 and 1.0"})

            if "min_speech_duration" in payload:
                val = float(payload["min_speech_duration"])
                if val >= 0:
                    new_settings["min_speech_duration"] = val
                else:
                    return json.dumps({"success": False, "error": "min_speech_duration must be >= 0"})

            if "min_silence_duration" in payload:
                val = float(payload["min_silence_duration"])
                if val >= 0:
                    new_settings["min_silence_duration"] = val
                else:
                    return json.dumps({"success": False, "error": "min_silence_duration must be >= 0"})

            if not new_settings:
                return json.dumps({"success": False, "error": "No valid settings provided"})

            # Update internal state
            if self._vad_settings:
                self._vad_settings.update(new_settings)
            else:
                self._vad_settings = new_settings

            # Persist to config file
            self._save_vad_settings(self._vad_settings)

            # Call callback if set
            if self._on_vad_change:
                await self._on_vad_change(self._vad_settings)

            logger.info(f"Updated and persisted VAD settings: {new_settings}")
            return json.dumps({
                "success": True,
                "settings": self._vad_settings,
            })
        except Exception as e:
            logger.error(f"Failed to set VAD settings: {e}")
            return json.dumps({"success": False, "error": str(e)})

    # System Prompt RPC Methods

    async def _get_system_prompt_rpc(self, data: RpcInvocationData) -> str:
        """Get the current system prompt."""
        try:
            return json.dumps({
                "success": True,
                "system_prompt": self._system_prompt,
            })
        except Exception as e:
            logger.error(f"Failed to get system prompt: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _set_system_prompt_rpc(self, data: RpcInvocationData) -> str:
        """Set and persist the system prompt."""
        try:
            payload = json.loads(data.payload) if data.payload else {}
            new_prompt = payload.get("system_prompt", "").strip()

            if not new_prompt:
                return json.dumps({"success": False, "error": "System prompt cannot be empty"})

            # Update internal state
            self._system_prompt = new_prompt

            # Persist to config file
            self._save_system_prompt(new_prompt)

            # Call callback if set (to update the agent)
            if self._on_system_prompt_change:
                await self._on_system_prompt_change(new_prompt)

            logger.info(f"Updated system prompt (length: {len(new_prompt)} chars)")
            return json.dumps({
                "success": True,
                "system_prompt": new_prompt,
            })
        except Exception as e:
            logger.error(f"Failed to set system prompt: {e}")
            return json.dumps({"success": False, "error": str(e)})

    # MCP Management RPC Methods

    async def _list_mcp_servers(self, data: RpcInvocationData) -> str:
        """List all configured MCP servers with status."""
        try:
            config = mcp_config.load_config()
            servers = []

            for server_cfg in config.servers:
                # Get status from tracked status or default to unknown
                status_info = self._mcp_server_status.get(server_cfg.name, {
                    "status": "unknown",
                    "error": None,
                    "tool_count": 0,
                })

                # If disabled, override status
                if not server_cfg.enabled:
                    status_info["status"] = "disabled"

                server_info = {
                    "name": server_cfg.name,
                    "type": server_cfg.type,
                    "enabled": server_cfg.enabled,
                    "allowed_tools": server_cfg.allowed_tools,
                    "status": status_info["status"],
                    "error": status_info.get("error"),
                    "tool_count": status_info.get("tool_count", 0),
                }

                # Add type-specific fields
                if server_cfg.type == "http":
                    server_info["url"] = server_cfg.url
                    if server_cfg.headers:
                        server_info["headers"] = server_cfg.headers
                else:  # stdio
                    server_info["command"] = server_cfg.command
                    if server_cfg.args:
                        server_info["args"] = server_cfg.args
                    if server_cfg.env:
                        server_info["env"] = server_cfg.env
                    if server_cfg.cwd:
                        server_info["cwd"] = server_cfg.cwd

                servers.append(server_info)

            logger.info(f"Listed {len(servers)} MCP server(s)")
            return json.dumps({
                "success": True,
                "servers": servers,
            })
        except Exception as e:
            logger.error(f"Failed to list MCP servers: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _add_mcp_server(self, data: RpcInvocationData) -> str:
        """Add a new MCP server (HTTP or stdio)."""
        try:
            payload = json.loads(data.payload) if data.payload else {}
            name = payload.get("name")
            server_type = payload.get("type", "http")
            enabled = payload.get("enabled", True)

            if not name:
                return json.dumps({"success": False, "error": "Server name is required"})

            if server_type == "stdio":
                # Stdio server: requires command
                command = payload.get("command")
                if not command:
                    return json.dumps({"success": False, "error": "Command is required for stdio servers"})

                success, message = mcp_config.add_server(
                    name=name,
                    server_type="stdio",
                    command=command,
                    args=payload.get("args"),
                    env=payload.get("env"),
                    cwd=payload.get("cwd"),
                    enabled=enabled,
                )
            else:
                # HTTP server: requires url
                url = payload.get("url")
                if not url:
                    return json.dumps({"success": False, "error": "URL is required for HTTP servers"})

                success, message = mcp_config.add_server(
                    name=name,
                    server_type="http",
                    url=url,
                    headers=payload.get("headers"),
                    enabled=enabled,
                )

            if success and self._on_mcp_change:
                await self._on_mcp_change()

            return json.dumps({"success": success, "message": message})
        except Exception as e:
            logger.error(f"Failed to add MCP server: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _remove_mcp_server(self, data: RpcInvocationData) -> str:
        """Remove an MCP server."""
        try:
            payload = json.loads(data.payload) if data.payload else {}
            name = payload.get("name")

            if not name:
                return json.dumps({"success": False, "error": "Server name is required"})

            success, message = mcp_config.remove_server(name)

            if success:
                # Clean up status tracking
                self._mcp_server_status.pop(name, None)
                if self._on_mcp_change:
                    await self._on_mcp_change()

            return json.dumps({"success": success, "message": message})
        except Exception as e:
            logger.error(f"Failed to remove MCP server: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _toggle_mcp_server(self, data: RpcInvocationData) -> str:
        """Toggle an MCP server on/off."""
        try:
            payload = json.loads(data.payload) if data.payload else {}
            name = payload.get("name")
            enabled = payload.get("enabled")  # Optional: if not provided, toggles

            if not name:
                return json.dumps({"success": False, "error": "Server name is required"})

            success, message = mcp_config.toggle_server(name, enabled)

            if success and self._on_mcp_change:
                await self._on_mcp_change()

            return json.dumps({"success": success, "message": message})
        except Exception as e:
            logger.error(f"Failed to toggle MCP server: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _list_mcp_tools(self, data: RpcInvocationData) -> str:
        """List tools for a specific MCP server using cached metadata."""
        try:
            payload = json.loads(data.payload) if data.payload else {}
            server_name = payload.get("name")

            if not server_name:
                return json.dumps({"success": False, "error": "Server name is required"})

            # Get server config for allowed_tools check
            server_cfg = mcp_config.get_server(server_name)
            if not server_cfg:
                return json.dumps({"success": False, "error": f"Server '{server_name}' not found"})

            # Debug: Log cache state
            logger.info(f"[DEBUG] Tool cache keys: {list(self._mcp_tool_cache.keys())}")
            logger.info(f"[DEBUG] Looking for server: '{server_name}'")

            # Use cached tool metadata (fetched via MCP JSON-RPC)
            cached_tools = self._mcp_tool_cache.get(server_name, [])
            logger.info(f"[DEBUG] Cached tools for '{server_name}': {len(cached_tools)} items")
            if cached_tools:
                logger.info(f"[DEBUG] First cached tool: {cached_tools[0]}")

            tools = []

            for tool in cached_tools:
                tool_name = tool.get("name", "unknown")
                # Check if tool is allowed
                is_enabled = (
                    server_cfg.allowed_tools is None or
                    tool_name in server_cfg.allowed_tools
                )
                tools.append({
                    "name": tool_name,
                    "description": tool.get("description", ""),
                    "enabled": is_enabled,
                })

            logger.info(f"Listed {len(tools)} tools for MCP server '{server_name}'")
            return json.dumps({
                "success": True,
                "server": server_name,
                "tools": tools,
                "count": len(tools),
            })
        except Exception as e:
            logger.error(f"Failed to list MCP tools: {e}")
            return json.dumps({"success": False, "error": str(e)})

    async def _toggle_mcp_tool(self, data: RpcInvocationData) -> str:
        """Enable/disable a specific tool on an MCP server."""
        try:
            payload = json.loads(data.payload) if data.payload else {}
            server_name = payload.get("server")
            tool_name = payload.get("tool")
            enabled = payload.get("enabled")

            if not server_name:
                return json.dumps({"success": False, "error": "Server name is required"})
            if not tool_name:
                return json.dumps({"success": False, "error": "Tool name is required"})
            if enabled is None:
                return json.dumps({"success": False, "error": "Enabled state is required"})

            # Get server config
            server_cfg = mcp_config.get_server(server_name)
            if not server_cfg:
                return json.dumps({"success": False, "error": f"Server '{server_name}' not found"})

            # Calculate new allowed_tools list
            current_allowed = server_cfg.allowed_tools

            if enabled:
                # Enable tool
                if current_allowed is None:
                    # All tools already allowed, nothing to do
                    return json.dumps({"success": True, "message": f"Tool '{tool_name}' is already enabled"})
                elif tool_name not in current_allowed:
                    current_allowed.append(tool_name)
            else:
                # Disable tool
                if current_allowed is None:
                    # Get all tool names from cache and exclude this one
                    cached_tools = self._mcp_tool_cache.get(server_name, [])
                    all_tool_names = [t.get("name", "") for t in cached_tools]
                    current_allowed = [t for t in all_tool_names if t != tool_name]
                else:
                    current_allowed = [t for t in current_allowed if t != tool_name]

            success, message = mcp_config.update_allowed_tools(server_name, current_allowed)

            return json.dumps({"success": success, "message": message})
        except Exception as e:
            logger.error(f"Failed to toggle MCP tool: {e}")
            return json.dumps({"success": False, "error": str(e)})
