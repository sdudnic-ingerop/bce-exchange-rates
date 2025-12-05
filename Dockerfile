FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Créer un dossier static pour servir les assets
RUN mkdir -p /app/static && cp -r /app/assets/* /app/static/ 2>/dev/null || true

EXPOSE 8501

CMD ["streamlit", "run", "app.py", "--server.address=0.0.0.0"]
