#!/bin/bash
# Start both Streamlit and FastAPI for Railway deployment

echo "Starting Streamlit on port 8501..."
streamlit run app.py --server.address=0.0.0.0 --server.port=8501 &

echo "Starting FastAPI on port 8000..."
python api.py &

# Wait for both processes
wait
