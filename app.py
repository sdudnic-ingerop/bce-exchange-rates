import streamlit as st
import pandas as pd
import requests
import json
from datetime import date, timedelta
import io

# Configuration de la page
st.set_page_config(page_title="Taux de Change BCE", page_icon="💶")

# Injection CSS et icônes Feather (local)
st.markdown("""
<style>
/* Police par défaut: Arial 10 */
html, body, [class*="css"] {
    font-family: Arial, sans-serif !important;
    font-size: 10pt !important;
}

/* Titres */
h1, h2, h3, h4, h5, h6 {
    font-family: Arial, sans-serif !important;
    font-size: 12pt !important;
}

/* Tableaux et Chiffres: Arial 10 */
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

/* Style pour le tableau HTML personnalisé */
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
    font-weight: bold;
}
td {
    padding: 8px;
    border-bottom: 1px solid #eee;
}

/* Selecteur de devises: Pas de couleur de fond, bordure fine, texte noir */
span[data-baseweb="tag"] {
    background-color: transparent !important;
    border: 1px solid #ccc !important;
    color: black !important;
}
span[data-baseweb="tag"] span {
    color: black !important;
}
</style>
""", unsafe_allow_html=True)

# Chargement de la configuration
@st.cache_data
def load_config():
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"default_currencies": ["USD", "GBP", "CHF"]}

config = load_config()

# Dictionnaire des devises avec descriptions pour la recherche
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

# Mapping Code Devise -> Code Pays (ISO 2 lettres) pour les drapeaux
CURRENCY_TO_COUNTRY = {
    "USD": "us", "JPY": "jp", "BGN": "bg", "CZK": "cz", "DKK": "dk", "GBP": "gb",
    "HUF": "hu", "PLN": "pl", "RON": "ro", "SEK": "se", "CHF": "ch", "ISK": "is",
    "NOK": "no", "TRY": "tr", "AUD": "au", "BRL": "br", "CAD": "ca", "CNY": "cn",
    "HKD": "hk", "IDR": "id", "ILS": "il", "INR": "in", "KRW": "kr", "MXN": "mx",
    "MYR": "my", "NZD": "nz", "PHP": "ph", "SGD": "sg", "THB": "th", "ZAR": "za",
    "ARS": "ar", "DZD": "dz", "MAD": "ma", "RUB": "ru", "TWD": "tw"
}

# Liste complète des devises supportées par la BCE (liste statique pour l'UI)
ALL_CURRENCIES = sorted(CURRENCY_DETAILS.keys())

# En-tête avec Logo
col_logo, col_title, col_date_display = st.columns([1, 5, 2])
with col_logo:
    # Logo officiel de la BCE
    st.image("assets/ecb_logo.svg", width=100)
with col_title:
    st.title("Taux de Change BCE")
# Placeholder pour afficher la date sélectionnée dans l'entête
date_placeholder = col_date_display.empty()

# --- Récupération des données ---
# On utilise le cache de Streamlit pour éviter de spammer l'API
@st.cache_data(ttl=3600)
def fetch_ecb_history(start_date, end_date):
    # URL Wildcard pour récupérer TOUTES les devises
    # D = Daily, . = Toutes devises, EUR = Base, SP00.A = Spot
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
        # Conversion de la colonne TIME_PERIOD en datetime
        if 'TIME_PERIOD' in df.columns:
            df['TIME_PERIOD'] = pd.to_datetime(df['TIME_PERIOD'])
        return df
    except Exception as e:
        st.error(f"Erreur lors de la récupération des données : {e}")
        return None

# --- Logique Principale ---

# 1. Sélection des devises + Date (même ligne)
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
    # 2. Récupération de l'historique (Année en cours)
    start_of_year = date(date.today().year, 1, 1)
    today = date.today()
    
    with st.spinner('Récupération de l\'historique des taux...'):
        df_history = fetch_ecb_history(start_of_year, today)
    
    if df_history is not None and not df_history.empty:
        # Filtrer sur les devises sélectionnées
        mask_curr = df_history['CURRENCY'].isin(selected_currencies)
        df_filtered = df_history[mask_curr].copy()
        
        if not df_filtered.empty:
            # 3. Déterminer les dates disponibles
            available_dates = sorted(df_filtered['TIME_PERIOD'].dt.date.unique())
            
            if available_dates:
                min_date = available_dates[0]
                max_date = available_dates[-1]
                
                # Use the top-level date selector; clamp to available range
                if input_date < min_date:
                    input_date = min_date
                if input_date > max_date:
                    input_date = max_date

                # Gestion des dates sans données (Week-ends/Fériés)
                if input_date in available_dates:
                    selected_date = input_date
                    is_exact_match = True
                else:
                    # Si la date choisie n'est pas dispo, on prend la précédente la plus proche
                    valid_dates = [d for d in available_dates if d <= input_date]
                    if valid_dates:
                        selected_date = valid_dates[-1]
                        is_exact_match = False
                    else:
                        selected_date = None
                        is_exact_match = False

                # 4. Affichage du Tableau et Graphique
                
                # Layout: Tableau (gauche) | Graphique (droite)
                c_table, c_chart = st.columns([1, 2])
                
                with c_table:
                    if selected_date:
                        if not is_exact_match:
                            st.warning(f"⚠️ Pas de données pour le {input_date}. Affichage du **{selected_date}**.")

                        df_day = df_filtered[df_filtered['TIME_PERIOD'].dt.date == selected_date].copy()
                        
                        # Création de la colonne Devise avec drapeau intégré (HTML/SVG)
                        # Utilisation de HTML brut pour intégrer le SVG redimensionné dans la même colonne
                        df_day['Devise'] = df_day['CURRENCY'].apply(
                            lambda x: f'<img src="https://flagcdn.com/{CURRENCY_TO_COUNTRY.get(x, "xx")}.svg" width="16" height="16" style="vertical-align:middle; margin-right:8px;"> {x}'
                        )

                        display_df = df_day[['Devise', 'OBS_VALUE']].rename(columns={
                            'OBS_VALUE': 'Taux'
                        }).sort_values('Devise').reset_index(drop=True)
                        
                        st.subheader(f"Taux au {selected_date}")
                        # Afficher la date sélectionnée dans l'entête
                        date_placeholder.markdown(f"**Date sélectionnée :** {selected_date}")
                        
                        # Rendu en HTML pour supporter les tags <img>
                        st.markdown(
                            display_df.to_html(escape=False, index=False, float_format="%.4f"),
                            unsafe_allow_html=True
                        )
                        
                        # CSV Export (incluant la date sélectionnée)
                        csv_df = df_day[['CURRENCY', 'OBS_VALUE']].rename(columns={
                            'CURRENCY': 'devise',
                            'OBS_VALUE': 'taux_bce'
                        }).sort_values('devise').reset_index(drop=True)
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
                                use_container_width=True,
                                help="Télécharger le CSV"
                            )

                with c_chart:
                    # 5. Graphique Historique
                    st.subheader("Historique")
                    
                    # Sélecteur de période
                    period = st.radio(
                        "Période",
                        ["Mois", "Trimestre", "Année"],
                        index=2,
                        horizontal=True,
                        label_visibility="collapsed"
                    )
                    
                    # Filtrage des données selon la période
                    df_chart = df_filtered.copy()
                    if period == "Mois":
                        start_period = today - timedelta(days=30)
                        df_chart = df_chart[df_chart['TIME_PERIOD'].dt.date >= start_period]
                    elif period == "Trimestre":
                        start_period = today - timedelta(days=90)
                        df_chart = df_chart[df_chart['TIME_PERIOD'].dt.date >= start_period]
                    # Année = tout l'historique récupéré (YTD)
                    
                    # Pivot pour avoir les devises en colonnes pour le graphique
                    chart_data = df_chart.pivot(index='TIME_PERIOD', columns='CURRENCY', values='OBS_VALUE')
                    
                    # Créer un graphique avec axes Y secondaires pour chaque devise
                    import altair as alt
                    
                    chart_data_reset = chart_data.reset_index()
                    # Renommer TIME_PERIOD en Date pour l'affichage
                    chart_data_reset = chart_data_reset.rename(columns={'TIME_PERIOD': 'Date'})
                    # Format string pour Altair si besoin, mais datetime marche bien
                    # chart_data_reset['Date'] = chart_data_reset['Date'].dt.strftime('%Y-%m-%d')
                    
                    # Créer des lignes avec des échelles distinctes (min-max auto)
                    lines = []
                    colors = ['#003da5', '#FF6B6B', '#FFA500', '#4ECDC4', '#45B7D1']
                    
                    for i, col in enumerate(chart_data.columns):
                        line = alt.Chart(chart_data_reset).mark_line(point=True).encode(
                            x=alt.X('Date:T', title=None), # Suppression du titre de l'axe X
                            y=alt.Y(f'{col}:Q', title=f'{col}', scale=alt.Scale(zero=False)),
                            color=alt.value(colors[i % len(colors)]),
                            tooltip=[alt.Tooltip('Date:T', format='%Y-%m-%d'), alt.Tooltip(f'{col}:Q', format='.4f')]
                        ).properties(width=400, height=300)
                        lines.append(line)
                    
                    # Combiner les graphiques
                    if lines:
                        combined_chart = alt.layer(*lines).resolve_scale(y='independent').interactive()
                        st.altair_chart(combined_chart, use_container_width=True)
            
        else:
            st.warning("Aucune donnée trouvée pour les devises sélectionnées sur la période.")
    else:
        st.error("Impossible de récupérer les données historiques.")
else:
    st.info("Veuillez sélectionner au moins une devise.")
# ===== API REST DOCUMENTATION =====
st.divider()
st.subheader("📡 Accès par API REST")

api_info = """
### Utilisation programmatique

Vous pouvez accéder aux taux de change via notre API REST :

**Endpoint:** `GET /api/bce-exchange`

**Paramètres:**
- `currencies` (requis): Codes de devises séparés par des virgules (ex: `EUR,USD,CHF`)
- `date` (optionnel): Date au format `YYYY-MM-DD` (par défaut: aujourd'hui)

**Exemples:**

```bash
# Localhost
curl "http://localhost:8000/api/bce-exchange?currencies=USD,CHF"

# Serveur de Dev (Réseau)
curl "http://10.99.27.11:8000/api/bce-exchange?currencies=USD,CHF"
```

**Réponse (succès):**
```json
{
  "status": "success",
  "date": "2025-12-04",
  "rates": [
    {"devise": "CHF", "taux": 0.9345},
    {"devise": "GBP", "taux": 0.8123},
    {"devise": "MXN", "taux": 21.3149}
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

### Démarrage de l'API

**Avec Docker:**
```bash
docker-compose up api
```

**Manuellement:**
```bash
pip install fastapi uvicorn
python api.py
```

L'API sera disponible sur `http://localhost:8000` (ou `http://10.99.27.11:8000` sur le réseau).
"""

st.markdown(api_info)