@echo off
:loop
git add .
git diff-index --quiet HEAD || (
    git commit -m "Auto update file"
    git push origin main
)
timeout /t 5 /nobreak >nul
goto loop