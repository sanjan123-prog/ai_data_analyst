"""
Dedicated, robust runner script for the AI-Powered Data Analyst backend.
Binds cleanly to port 8001 to prevent conflicts with other services on port 8000.
"""
import os
import sys

# Ensure project directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import uvicorn
from main_api import app

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    print(f"Starting AI Data Analyst Backend on port {port}...")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
