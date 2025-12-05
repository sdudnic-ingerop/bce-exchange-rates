"""
API endpoint for BCE exchange rates
Access via: /api/bce-exchange?currencies=USD,CHF&date=2025-12-04
"""
import streamlit as st
import pandas as pd
import requests
import json
import io
from datetime import date, datetime

# Hide the Streamlit UI for API responses
st.set_page_config(layout="wide", initial_sidebar_state="collapsed")
hide_streamlit_style = """
<style>
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
.stDecorator {visibility: hidden;}
</style>
"""
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

# Load config
@st.cache_data
def load_config():
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"default_currencies": ["USD", "GBP", "CHF"]}

# Fetch ECB data
@st.cache_data(ttl=3600)
def fetch_ecb_history(start_date, end_date, config=None):
    if config is None:
        config = load_config()
    url = config.get("api_url", "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A")
    
    params = {
        "startPeriod": start_date.strftime("%Y-%m-%d"),
        "endPeriod": end_date.strftime("%Y-%m-%d"),
        "format": "csvdata"
    }
    
    try:
        response = requests.get(url, params=params)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        
        if not response.text.strip():
            return None
            
        df = pd.read_csv(io.StringIO(response.text))
        if 'TIME_PERIOD' in df.columns:
            df['TIME_PERIOD'] = pd.to_datetime(df['TIME_PERIOD'])
        return df
    except Exception:
        return None

# Get query parameters
query_params = st.query_params
currencies_param = query_params.get("currencies", "")
date_param = query_params.get("date")

# Validate currencies
if not currencies_param:
    st.json({"status": "error", "code": -2, "message": "currencies parameter is required"})
    st.stop()

# Parse currencies
currency_list = [c.strip().upper() for c in currencies_param.split(",") if c.strip()]

if not currency_list:
    st.json({"status": "error", "code": -2, "message": "At least one currency is required"})
    st.stop()

# Validate currency format
if any(len(c) != 3 or not c.isalpha() for c in currency_list):
    st.json({"status": "error", "code": -2, "message": "Invalid currency codes. Use 3-letter codes (e.g., USD, EUR)"})
    st.stop()

# Parse date
if date_param:
    try:
        selected_date = datetime.strptime(date_param, "%Y-%m-%d").date()
    except ValueError:
        st.json({"status": "error", "code": -2, "message": "Invalid date format. Use YYYY-MM-DD"})
        st.stop()
else:
    selected_date = date.today()

# Fetch data
config = load_config()
start_date = date(selected_date.year, 1, 1)
df = fetch_ecb_history(start_date, selected_date, config)

if df is None or df.empty:
    st.json({"status": "error", "code": -1, "message": "No data available from ECB API"})
    st.stop()

# Filter currencies
df_filtered = df[df['CURRENCY'].isin(currency_list)]

if df_filtered.empty:
    st.json({"status": "error", "code": -1, "message": f"No data for currencies: {', '.join(currency_list)}"})
    st.stop()

# Find date
available_dates = sorted(df_filtered['TIME_PERIOD'].dt.date.unique())
actual_date = selected_date

if selected_date not in available_dates:
    valid_dates = [d for d in available_dates if d <= selected_date]
    if valid_dates:
        actual_date = valid_dates[-1]
    else:
        st.json({"status": "error", "code": -1, "message": f"No data available for date {selected_date} or earlier"})
        st.stop()

# Get rates
df_day = df_filtered[df_filtered['TIME_PERIOD'].dt.date == actual_date]

if df_day.empty:
    st.json({"status": "error", "code": -1, "message": "No data available for the specified date"})
    st.stop()

# Build response
rates = []
for _, row in df_day.iterrows():
    rates.append({
        "devise": row['CURRENCY'],
        "taux": round(float(row['OBS_VALUE']), 4)
    })

rates.sort(key=lambda x: x['devise'])

st.json({
    "status": "success",
    "date": actual_date.strftime("%Y-%m-%d"),
    "date_requested": selected_date.strftime("%Y-%m-%d"),
    "rates": rates
})
