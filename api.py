"""
API REST FastAPI pour les taux de change BCE
Endpoint: GET /api/bce-exchange?currencies=EUR,USD,CHF&date=2025-12-04
"""
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import pandas as pd
import requests
import io
from datetime import date, datetime
from typing import List, Optional

app = FastAPI(title="BCE Exchange Rate API", version="1.0.0")

# Fonction pour récupérer les taux ECB
def fetch_ecb_data(start_date: date, end_date: date):
    """Récupère les données de taux de change de l'API ECB"""
    url = "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A"
    params = {
        "startPeriod": start_date.strftime("%Y-%m-%d"),
        "endPeriod": end_date.strftime("%Y-%m-%d"),
        "format": "csvdata"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        if not response.text.strip():
            return None
        
        df = pd.read_csv(io.StringIO(response.text))
        if 'TIME_PERIOD' in df.columns:
            df['TIME_PERIOD'] = pd.to_datetime(df['TIME_PERIOD'])
        return df
    except Exception as e:
        return None


@app.get("/api/bce-exchange")
def get_exchange_rates(
    currencies: str = Query(..., description="Comma-separated list of currency codes (e.g., EUR,USD,CHF)"),
    date_str: Optional[str] = Query(None, description="Date in format YYYY-MM-DD (default: today)")
):
    """
    Get exchange rates for specified currencies at a given date.
    
    Example: /api/bce-exchange?currencies=EUR,USD,CHF&date=2025-12-04
    
    Response:
    - Success: {"status": "success", "date": "2025-12-04", "rates": [{"currency": "CHF", "rate": 0.9345}, ...]}
    - No data: {"status": "error", "code": -1, "message": "No data available for the specified date"}
    - Bad params: {"status": "error", "code": -2, "message": "Invalid currencies"}
    """
    
    # Parser la date
    if date_str:
        try:
            selected_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "code": -2, "message": "Invalid date format. Use YYYY-MM-DD"}
            )
    else:
        selected_date = date.today()
    
    # Parser les devises
    currency_list = [c.strip().upper() for c in currencies.split(",") if c.strip()]
    
    if not currency_list:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "code": -2, "message": "At least one currency is required"}
        )
    
    # Valider les codes devise (3 caractères)
    if any(len(c) != 3 or not c.isalpha() for c in currency_list):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "code": -2, "message": "Invalid currency codes. Use 3-letter codes (e.g., USD, EUR)"}
        )
    
    # Récupérer les données (30 jours avant la date)
    start_date = date(selected_date.year, 1, 1)
    df = fetch_ecb_data(start_date, selected_date)
    
    if df is None or df.empty:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "code": -1, "message": "No data available from ECB API"}
        )
    
    # Filtrer par devises
    df_filtered = df[df['CURRENCY'].isin(currency_list)]
    
    # Filtrer par date exacte ou dernière date disponible avant
    available_dates = sorted(df_filtered['TIME_PERIOD'].dt.date.unique())
    
    if not available_dates:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "code": -1, "message": f"No data available for currencies: {', '.join(currency_list)}"}
        )
    
    # Chercher la date exact ou le dernier jour ouvrable antérieur
    actual_date = selected_date
    if selected_date not in available_dates:
        valid_dates = [d for d in available_dates if d <= selected_date]
        if valid_dates:
            actual_date = valid_dates[-1]
        else:
            return JSONResponse(
                status_code=404,
                content={"status": "error", "code": -1, "message": f"No data available for date {selected_date} or earlier"}
            )
    
    # Récupérer les taux pour la date
    df_day = df_filtered[df_filtered['TIME_PERIOD'].dt.date == actual_date]
    
    if df_day.empty:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "code": -1, "message": f"No data available for the specified date"}
        )
    
    # Construire la réponse
    rates = []
    for _, row in df_day.iterrows():
        rates.append({
            "currency": row['CURRENCY'],
            "rate": round(float(row['OBS_VALUE']), 4)
        })
    
    # Trier par code devise
    rates.sort(key=lambda x: x['currency'])
    
    return {
        "status": "success",
        "date": actual_date.strftime("%Y-%m-%d"),
        "date_requested": selected_date.strftime("%Y-%m-%d"),
        "rates": rates
    }


@app.get("/api/health")
def health_check():
    """Vérifie que l'API est disponible"""
    return {"status": "ok"}


@app.get("/")
def root():
    """Redirect API documentation to /api/health"""
    # Return simple API info (removed full documentation to avoid conflict with Streamlit)
    return {"message": "BCE Exchange Rate API. See /api/bce-exchange for exchange rates"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
