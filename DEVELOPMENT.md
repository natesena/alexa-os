# Alexa-OS Development Guide

## Prerequisites

- **Python 3.10+** (recommended: 3.13 via Homebrew)
- **Node.js 18+**
- **Docker** (for LiveKit server and production deployment)

---

## Quick Start (Local Development)

### 1. Start LiveKit Server (Docker)

```bash
cd alexa-os
docker-compose up livekit -d
```

### 2. Start the Agent (Terminal 1)

```bash
cd alexa-os/server
source .venv/bin/activate
python -m src.main dev
```

### 3. Start the Playground (Terminal 2)

```bash
cd alexa-os/playground
npm run dev
```

### 4. Open the Playground

Go to http://localhost:3000 (or 3001 if 3000 is in use)

---

## Local Development Setup (First Time)

### Agent Server (Python)

```bash
cd alexa-os/server

# Create venv with Python 3.10+ (use Homebrew Python 3.13)
/opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv

# Activate venv
source .venv/bin/activate

# Install dependencies (editable mode for development)
pip install -e ".[dev]"
```

### Playground (Next.js)

```bash
cd alexa-os/playground
npm install
```

---

## Running for Development

### Option A: Local Agent (Fast Iteration)

Best for: Making changes to the agent code, testing new features

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  LiveKit Server │     │  Agent (Local)  │     │    Playground   │
│    (Docker)     │◄───►│   Python venv   │◄───►│    (Next.js)    │
│   port: 7880    │     │   hot reload    │     │   port: 3000    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Terminal 1 - LiveKit:**
```bash
docker-compose up livekit -d
```

**Terminal 2 - Agent:**
```bash
cd server
source .venv/bin/activate
python -m src.main dev
```

**Terminal 3 - Playground:**
```bash
cd playground
npm run dev
```

### Option B: Full Docker (Production-like)

Best for: Testing production deployment, CI/CD

```bash
docker-compose up -d
```

This starts:
- LiveKit server (port 7880)
- Voice agent (Docker container)
- Playground (port 3000)

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# LiveKit (local Docker)
LIVEKIT_API_KEY=APIKey9dQC8CcgDzlg
LIVEKIT_API_SECRET=NTl2UJtY9GcB5WQ9U1WbewC7TXoZ5zdIWwJgab5Q

# Ollama LLM (your Mac over Tailscale)
OLLAMA_HOST=http://100.89.168.110:11434
OLLAMA_MODEL=gpt-oss:20b

# Providers
LLM_PROVIDER=ollama
STT_PROVIDER=whisper
WHISPER_MODEL=base.en
TTS_PROVIDER=kokoro
KOKORO_VOICE=af_bella
```

---

## Common Commands

### Agent

```bash
# Start in dev mode (auto-restarts on changes)
python -m src.main dev

# Run tests
pytest

# Format code
black src/
ruff check src/ --fix
```

### Playground

```bash
# Development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

### Docker

```bash
# Start all services
docker-compose up -d

# Start only LiveKit
docker-compose up livekit -d

# Rebuild agent after code changes
docker-compose build voice-agent --no-cache
docker-compose up voice-agent -d

# View logs
docker-compose logs -f voice-agent

# Stop all
docker-compose down
```

---

## Architecture

```
alexa-os/
├── server/              # Python voice agent
│   ├── src/
│   │   ├── agent.py     # Main agent logic
│   │   ├── config.py    # Settings from .env
│   │   ├── rpc_handlers.py  # RPC for UI control
│   │   ├── telemetry.py     # Event streaming
│   │   └── stt_whisper.py   # Local Whisper STT
│   └── pyproject.toml
│
├── playground/          # Next.js UI
│   ├── src/
│   │   ├── components/playground/  # UI components
│   │   ├── hooks/       # React hooks for RPC/telemetry
│   │   └── pages/       # Next.js pages
│   └── package.json
│
├── docker-compose.yml   # Docker orchestration
└── .env                 # Environment config
```

---

## Troubleshooting

### "Waiting for agent..."
- Make sure the agent is running (`python -m src.main dev`)
- Check agent logs for errors
- Verify LiveKit is running (`docker ps | grep livekit`)

### Model not showing
- Agent must be connected for model selector to work
- Check if Ollama is reachable at `OLLAMA_HOST`

### Python version error
- LiveKit Agents requires Python 3.10+
- Use: `/opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv`

### Port already in use
- Playground: Will auto-use 3001 if 3000 is taken
- LiveKit: Stop other services on 7880 or change port in docker-compose
