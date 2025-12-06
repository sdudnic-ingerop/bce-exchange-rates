import streamlit as st
import pandas as pd
import requests
import json
from datetime import date, timedelta
import io

# Page configuration
st.set_page_config(page_title="Taux de Change BCE", page_icon="💶")

# CSS injection and Feather icons (local)
st.markdown("""
<style>
/* Default font: Arial 10 */
html, body, [class*="css"] {
    font-family: Arial, sans-serif !important;
    font-size: 10pt !important;
}

/* Headings - Small */
h1, h2, h3, h4, h5, h6 {
    font-family: Arial, sans-serif !important;
    font-size: 10pt !important;
}

/* Tables and Numbers: Arial 10 */
[data-testid="stDataFrame"], table {
    font-family: Arial, sans-serif !important;
    font-size: 10pt !important;
}
[data-testid="stDataFrame"] div {
    font-family: Arial, sans-serif !important;
    font-size: 10pt !important;
}
.stCode {
    font-family: Arial, sans-serif !important;
    font-size: 10pt !important;
}

/* Custom HTML table styling */
table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
}
th {
    text-align: left;
    padding: 8px;
    background-color: transparent;
    border-bottom: 1px solid #ccc;
    font-weight: normal;
}

/* Harmonized flag images */
img[src*="flagcdn"] {
    height: 16px;
    width: auto;
    vertical-align: middle;
}
td {
    padding: 8px;
    border-bottom: 1px solid #eee;
}

/* Currency selector: no background, thin border, black text */
span[data-baseweb="tag"] {
    background-color: transparent !important;
    border: 1px solid #ccc !important;
    color: black !important;
}
span[data-baseweb="tag"] span {
    color: black !important;
}

/* Compact Download button */
button[kind="secondary"] {
    padding: 0.25rem 0.5rem !important;
    font-size: 9pt !important;
    height: auto !important;
    min-height: auto !important;
}
</style>
""", unsafe_allow_html=True)

# Load configuration
@st.cache_data
def load_config():
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"default_currencies": ["USD", "GBP", "CHF"]}

config = load_config()

# Currency dictionary with descriptions for search
CURRENCY_DETAILS = {
    "USD": "🇺🇸 USD - Dollar américain",
    "JPY": "🇯🇵 JPY - Yen",
    "BGN": "🇧🇬 BGN - Lev",
    "CZK": "🇨🇿 CZK - Couronne",
    "DKK": "🇩🇰 DKK - Couronne",
    "GBP": "🇬🇧 GBP - Livre Sterling",
    "HUF": "🇭🇺 HUF - Forint",
    "PLN": "🇵🇱 PLN - Zloty",
    "RON": "🇷🇴 RON - Leu",
    "SEK": "🇸🇪 SEK - Couronne",
    "CHF": "🇨🇭 CHF - Franc",
    "ISK": "🇮🇸 ISK - Couronne",
    "NOK": "🇳🇴 NOK - Couronne",
    "TRY": "🇹🇷 TRY - Lire",
    "AUD": "🇦🇺 AUD - Dollar",
    "BRL": "🇧🇷 BRL - Real",
    "CAD": "🇨🇦 CAD - Dollar",
    "CNY": "🇨🇳 CNY - Yuan",
    "HKD": "🇭🇰 HKD - Dollar",
    "IDR": "🇮🇩 IDR - Rupiah",
    "ILS": "🇮🇱 ILS - Shekel",
    "INR": "🇮🇳 INR - Roupie",
    "KRW": "🇰🇷 KRW - Won",
    "MXN": "🇲🇽 MXN - Peso",
    "MYR": "🇲🇾 MYR - Ringgit",
    "NZD": "🇳🇿 NZD - Dollar",
    "PHP": "🇵🇭 PHP - Peso",
    "SGD": "🇸🇬 SGD - Dollar",
    "THB": "🇹🇭 THB - Baht",
    "ZAR": "🇿🇦 ZAR - Rand",
    "ARS": "🇦🇷 ARS - Peso",
    "DZD": "🇩🇿 DZD - Dinar",
    "MAD": "🇲🇦 MAD - Dirham",
    "RUB": "🇷🇺 RUB - Rouble",
    "TWD": "🇹🇼 TWD - Dollar"
}

# Mapping Currency Code -> Country Code (ISO 2 letters) for flags
CURRENCY_TO_COUNTRY = {
    "USD": "us", "JPY": "jp", "BGN": "bg", "CZK": "cz", "DKK": "dk", "GBP": "gb",
    "HUF": "hu", "PLN": "pl", "RON": "ro", "SEK": "se", "CHF": "ch", "ISK": "is",
    "NOK": "no", "TRY": "tr", "AUD": "au", "BRL": "br", "CAD": "ca", "CNY": "cn",
    "HKD": "hk", "IDR": "id", "ILS": "il", "INR": "in", "KRW": "kr", "MXN": "mx",
    "MYR": "my", "NZD": "nz", "PHP": "ph", "SGD": "sg", "THB": "th", "ZAR": "za",
    "ARS": "ar", "DZD": "dz", "MAD": "ma", "RUB": "ru", "TWD": "tw"
}

# Complete list of currencies supported by ECB (static list for UI)
ALL_CURRENCIES = sorted(CURRENCY_DETAILS.keys())

# Header with Logo
col_logo, col_title = st.columns([1, 5])
with col_logo:
    # Official ECB logo
    st.image("assets/ecb_logo.svg", width=100)
with col_title:
    st.title("Taux de Change BCE")

# --- Data retrieval ---
# Use Streamlit cache to avoid spamming the API
@st.cache_data(ttl=3600)
def fetch_ecb_history(start_date, end_date):
    # Wildcard URL to fetch ALL currencies
    # D = Daily, . = All currencies, EUR = Base, SP00.A = Spot
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
        # Convert TIME_PERIOD column to datetime
        if 'TIME_PERIOD' in df.columns:
            df['TIME_PERIOD'] = pd.to_datetime(df['TIME_PERIOD'])
        return df
    except Exception as e:
        st.error(f"Erreur lors de la récupération des données : {e}")
        return None

# --- Main Logic ---

# 1. Select currencies + Date (same row)
col_select, col_date = st.columns([3,1])
with col_select:
    selected_currencies = st.multiselect(
        "Devises",
        options=ALL_CURRENCIES,
        default=config.get("default_currencies", []),
        format_func=lambda x: CURRENCY_DETAILS.get(x, x),
        help="Sélectionnez une ou plusieurs devises"
    )
with col_date:
    input_date = st.date_input("Date", value=date.today(), help="Date souhaitée")

if selected_currencies:
    # 2. Fetch history (Current year)
    start_of_year = date(date.today().year, 1, 1)
    today = date.today()
    
    with st.spinner('Récupération de l\'historique des taux...'):
        df_history = fetch_ecb_history(start_of_year, today)
    
    if df_history is not None and not df_history.empty:
        # Filter on selected currencies
        mask_curr = df_history['CURRENCY'].isin(selected_currencies)
        df_filtered = df_history[mask_curr].copy()
        
        if not df_filtered.empty:
            # 3. Determine available dates
            available_dates = sorted(df_filtered['TIME_PERIOD'].dt.date.unique())
            
            if available_dates:
                min_date = available_dates[0]
                max_date = available_dates[-1]
                
                # Clamp date to available range
                if input_date < min_date:
                    input_date = min_date
                if input_date > max_date:
                    input_date = max_date

                # Handle dates without data (weekends/holidays)
                if input_date in available_dates:
                    selected_date = input_date
                    is_exact_match = True
                else:
                    # If selected date is unavailable, use closest previous date
                    valid_dates = [d for d in available_dates if d <= input_date]
                    if valid_dates:
                        selected_date = valid_dates[-1]
                        is_exact_match = False
                    else:
                        selected_date = None
                        is_exact_match = False

                # 4. Display Table and Chart
                
                # Layout: Table (left) | Chart (right)
                c_table, c_chart = st.columns([1, 2])
                
                with c_table:
                    if selected_date:
                        if not is_exact_match:
                            st.warning(f"⚠️ Pas de données pour le {input_date}. Affichage du **{selected_date}**.")

                        df_day = df_filtered[df_filtered['TIME_PERIOD'].dt.date == selected_date].copy()
                        
                        # Create currency column with integrated flag (HTML/SVG)
                        # Use raw HTML to embed resized SVG in same column
                        df_day['currency_display'] = df_day['CURRENCY'].apply(
                            lambda x: f'<img src="https://flagcdn.com/{CURRENCY_TO_COUNTRY.get(x, "xx")}.svg" height="16px" style="vertical-align:middle; margin-right:8px;"> {x}'
                        )

                        display_df = df_day[['currency_display', 'OBS_VALUE']].rename(columns={
                            'currency_display': 'Devise',
                            'OBS_VALUE': 'Taux'
                        }).sort_values('Devise').reset_index(drop=True)
                        
                        st.subheader(f"Taux au {selected_date}")
                        
                        # Render as HTML to support <img> tags and add tooltips to headers
                        html_table = display_df.to_html(escape=False, index=False, float_format="%.4f")
                        # Replace headers with tooltips
                        html_table = html_table.replace('<th>Devise</th>', '<th title="Code et drapeau de la devise">Devise <span style="cursor: help; color: #0066cc;">?</span></th>')
                        html_table = html_table.replace('<th>Taux</th>', '<th title="Taux de change par rapport à l\'EUR">Taux <span style="cursor: help; color: #0066cc;">?</span></th>')
                        st.markdown(html_table, unsafe_allow_html=True)
                        
                        # CSV export (including selected date)
                        csv_df = df_day[['CURRENCY', 'OBS_VALUE']].rename(columns={
                            'CURRENCY': 'currency',
                            'OBS_VALUE': 'rate'
                        }).sort_values('currency').reset_index(drop=True)
                        csv_df['date'] = selected_date
                        
                        csv_text = csv_df.to_csv(index=False, sep=';')
                        
                        col_csv_title, col_csv_btn = st.columns([3,1])
                        with col_csv_title:
                            st.subheader("CSV")
                            st.code(csv_text, language="csv")
                        with col_csv_btn:
                            st.download_button(
                                label="↓",
                                data=csv_text,
                                file_name=f"taux_bce_{selected_date}.csv",
                                mime="text/csv",
                                use_container_width=False,
                                help="Télécharger le CSV"
                            )

                with c_chart:
                    # 5. History Chart
                    st.subheader("Historique")
                    
                    # Sélecteur de période
                    period = st.radio(
                        "Période",
                        ["Mois", "Trimestre", "Année"],
                        index=2,
                        horizontal=True,
                        label_visibility="collapsed"
                    )
                    
                    # Filter data by period
                    df_chart = df_filtered.copy()
                    if period == "Mois":
                        start_period = today - timedelta(days=30)
                        df_chart = df_chart[df_chart['TIME_PERIOD'].dt.date >= start_period]
                    elif period == "Trimestre":
                        start_period = today - timedelta(days=90)
                        df_chart = df_chart[df_chart['TIME_PERIOD'].dt.date >= start_period]
                    # Year = all retrieved history (YTD)
                    
                    # Pivot to get currencies in columns for chart
                    chart_data = df_chart.pivot(index='TIME_PERIOD', columns='CURRENCY', values='OBS_VALUE')
                    
                    # Create chart with secondary Y axes for each currency
                    import altair as alt
                    
                    chart_data_reset = chart_data.reset_index()
                    # Rename TIME_PERIOD to Date for display
                    chart_data_reset = chart_data_reset.rename(columns={'TIME_PERIOD': 'Date'})
                    # Format string for Altair if needed, but datetime works well
                    # chart_data_reset['Date'] = chart_data_reset['Date'].dt.strftime('%Y-%m-%d')
                    
                    # Create lines with distinct scales (auto min-max)
                    lines = []
                    colors = ['#003da5', '#FF6B6B', '#FFA500', '#4ECDC4', '#45B7D1']
                    
                    for i, col in enumerate(chart_data.columns):
                        line = alt.Chart(chart_data_reset).mark_line(point=True, size=2).encode(
                            x=alt.X('Date:T', title=None), # Remove X-axis title
                            y=alt.Y(f'{col}:Q', title=f'{col}', scale=alt.Scale(zero=False), axis=alt.Axis(labelExpr='datum.label')),
                            color=alt.value(colors[i % len(colors)]),
                            tooltip=[alt.Tooltip('Date:T', format='%Y-%m-%d'), alt.Tooltip(f'{col}:Q', format='.4f')]
                        ).properties(width=500, height=300)
                        lines.append(line)
                    
                    # Combine charts
                    if lines:
                        combined_chart = alt.layer(*lines).resolve_scale(y='independent').interactive()
                        st.altair_chart(combined_chart, use_container_width=True)
            
        else:
            st.warning("Aucune donnée trouvée pour les devises sélectionnées sur la période.")
    else:
        st.error("Impossible de récupérer les données historiques.")
else:
    st.info("Veuillez sélectionner au moins une devise.")
# ===== REST API DOCUMENTATION =====
st.divider()
st.subheader("📡 Accès par API REST")

api_info = """
### Utilisation programmatique

Vous pouvez accéder aux taux de change via notre API REST :

**Endpoint:** `GET /api/bce-exchange`

**Paramètres:**
- `currencies` (requis): Codes de devises séparés par des virgules
- `date` (optionnel): Date au format `YYYY-MM-DD` (par défaut: aujourd'hui)

**Exemples:**

```bash
# API (Railway TCP Proxy)
curl "http://maglev.proxy.rlwy.net:49876/api/bce-exchange?currencies=USD,CHF"

# Avec dates spécifiques
curl "http://maglev.proxy.rlwy.net:49876/api/bce-exchange?currencies=EUR,MXN,GBP&date=2025-12-04"

# Health check
curl "http://maglev.proxy.rlwy.net:49876/api/health"
```

**Réponse (succès):**
```json
{
  "status": "success",
  "date": "2025-12-05",
  "date_requested": "2025-12-05",
  "rates": [
    {"currency": "CHF", "rate": 0.9365},
    {"currency": "USD", "rate": 1.1645},
    {"currency": "GBP", "rate": 0.8312}
  ]
}
```

**Réponse (erreur):**
```json
{
  "status": "error",
  "code": -1,
  "message": "No data available for the specified date"
}
```

### Déploiement

**Docker Compose (local):**
```bash
docker-compose up  # Lance Streamlit (8501) + API FastAPI (8000)
```

**Railway:**

**Web UI (Streamlit):**
- URL: https://bce-exchange-rates-production.up.railway.app/
- Port: 8501 (Metal Edge)

**REST API (FastAPI):**
- URL: http://maglev.proxy.rlwy.net:49876/
- Port: 49876 (TCP Proxy vers port 8000)
- Endpoint: `/api/bce-exchange?currencies=USD,CHF&date=2025-12-05`
"""

st.markdown(api_info)