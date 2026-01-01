#!/usr/bin/env python3
"""Alexa-OS Voice Assistant Server - Entry Point."""

import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from project root
project_root = Path(__file__).parent.parent.parent
load_dotenv(project_root / ".env")

from .agent import run_agent
from .config import settings


def setup_logging():
    """Configure logging for the application."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )

    # Set specific loggers
    logging.getLogger("alexa-os").setLevel(logging.DEBUG)
    logging.getLogger("livekit").setLevel(logging.INFO)


def main():
    """Main entry point."""
    setup_logging()
    logger = logging.getLogger("alexa-os")

    logger.info("=" * 60)
    logger.info("Alexa-OS Voice Assistant Server")
    logger.info("=" * 60)
    logger.info(f"LiveKit URL: {settings.livekit_url}")
    logger.info(f"LLM Provider: {settings.llm_provider}")
    logger.info(f"STT Provider: {settings.stt_provider}")
    logger.info(f"TTS Provider: {settings.tts_provider}")
    logger.info("=" * 60)

    # Run the agent
    run_agent()


if __name__ == "__main__":
    main()
