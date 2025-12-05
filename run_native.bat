@echo off
echo ==========================================
echo      Demarrage Mode Natif (Sans Docker)
echo ==========================================
echo.
echo 1. Verification de Python...
python --version
if %errorlevel% neq 0 (
    echo Erreur: Python n'est pas installe ou n'est pas dans le PATH.
    pause
    exit /b
)

echo.
echo 2. Installation des dependances...
pip install -r requirements.txt

echo.
echo 3. Demarrage des services...
echo.
echo Lancement de l'API (Port 8000) dans une nouvelle fenetre...
start "BCE API" uvicorn api:app --host 0.0.0.0 --port 8000

echo Lancement de Streamlit (Port 8501) dans une nouvelle fenetre...
start "BCE Streamlit" streamlit run app.py --server.port 8501 --server.address 0.0.0.0

echo.
echo ==========================================
echo      Application demarree !
echo ==========================================
echo.
echo Les fenetres doivent rester ouvertes.
echo.
pause
