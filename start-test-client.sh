#!/bin/bash
cd "$(dirname "$0")/test-client"
uv sync
uv run python main.py
