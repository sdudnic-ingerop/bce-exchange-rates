#!/bin/bash
# Start both Streamlit and FastAPI for Railway deployment

echo "Starting FastAPI on port 8000 in background..."
python api.py > /tmp/api.log 2>&1 &
API_PID=$!

echo "Starting Streamlit on port 8501..."
streamlit run app.py \
  --server.address=0.0.0.0 \
  --server.port=8501 \
  --server.headless=true \
  --logger.level=debug

# If Streamlit exits, kill API and exit
kill $API_PID 2>/dev/null
exit 0
