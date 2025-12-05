#!/bin/bash
# For Railway: Run Streamlit on the exposed port (from PORT env var, defaults to 8501)
# The FastAPI service runs on port 8000 in the background for internal use if needed

PORT=${PORT:-8501}

echo "Starting Streamlit on port $PORT..."
streamlit run app.py \
  --server.address=0.0.0.0 \
  --server.port=$PORT \
  --server.headless=true
