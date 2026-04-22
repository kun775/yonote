@echo off
node --test tests/*.test.mjs
exit /b %ERRORLEVEL%
