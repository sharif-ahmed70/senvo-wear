@echo off
title SENVO Stop
echo.
echo  SENVO bondho hocche...
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\xampp\htdocs\SENVO Wear\scripts\start-local.ps1" -Stop
echo  Database bondho hocche...
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\SENVO\senvo-db.ps1" -Action stop
echo.
echo  SENVO bondho hoyeche. Ekhon laptop bondho korte paren.
echo  Ei window 10 second pore nije bondho hobe.
timeout /t 10
