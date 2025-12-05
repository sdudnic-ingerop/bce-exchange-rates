FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

COPY . .

# Créer un dossier static pour servir les assets
RUN mkdir -p /app/static && cp -r /app/assets/* /app/static/ 2>/dev/null || true

# Make startup scripts executable
RUN chmod +x /app/start-railway.sh

EXPOSE 8501 8000

# Default: Render (single port) - just Streamlit
CMD ["streamlit", "run", "app.py", "--server.address=0.0.0.0"]
