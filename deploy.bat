@echo off
color 0b
echo ===================================================
echo     AUTODEPLOY GITHUB ^& GITHUB PAGES (.MY.ID)
echo ===================================================
echo.

:: 1. Siapkan semua file terbaru
git add .

:: 2. Meminta pesan komit (Jika dikosongkan, pakai pesan bawaan)
set /p pesan="Tulis pesan update (Lalu tekan Enter): "
if "%pesan%"=="" set pesan="Update fitur dan tampilan terbaru"

:: 3. Melakukan komit dan push ke main
echo.
echo [1/2] Menyimpan dan mengirim source code ke GitHub Utama...
git commit -m "%pesan%"
git push origin main

:: 4. Melakukan deploy ke gh-pages
echo.
echo [2/2] Mempublikasikan perubahan ke server Domain MY.ID...
call npx gh-pages -d .

echo.
echo ===================================================
echo  Beres Bos! Website akan live dalam 1-2 menit.
echo  Domain: https://countdownadzan.my.id
echo ===================================================
pause
