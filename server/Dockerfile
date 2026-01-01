# Alexa-OS Voice Agent Server
# Multi-stage build for smaller image
#
# Components:
# - Local Whisper STT (faster-whisper with CTranslate2)
# - Kokoro TTS client (connects to Kokoro-FastAPI)
# - Ollama LLM client
# - LiveKit Agents framework

FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies for faster-whisper (CTranslate2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY src/ ./src/

# Install dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Final image
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
# - ffmpeg: Audio processing
# - libsndfile1: Audio file handling
# - libgomp1: OpenMP for faster-whisper
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy source code
COPY src/ ./src/

# Create models directory
RUN mkdir -p /app/models

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV MODEL_CACHE_DIR=/app/models

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import src.config; print('OK')" || exit 1

# Run the agent
CMD ["python", "-m", "src.main"]
