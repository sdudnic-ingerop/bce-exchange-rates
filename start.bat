@echo off
echo ==========================================
echo      Demarrage de l'application BCE
echo ==========================================
echo.
echo Construction et demarrage des conteneurs Docker...
echo.

docker-compose up -d --build

echo.
echo ==========================================
echo      Application demarree !
echo ==========================================
echo.
echo Streamlit UI : http://localhost:8501
echo API REST     : http://localhost:8000
echo.
echo Pour acceder depuis le reseau :
echo Streamlit UI : http://10.99.27.11:8501
echo API REST     : http://10.99.27.11:8000
echo.
pause
