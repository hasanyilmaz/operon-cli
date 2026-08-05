@ECHO OFF
IF "%~1"=="" EXIT /B 64
IF "%~2"=="" EXIT /B 64
IF NOT "%~3"=="" EXIT /B 64
CALL npm run validate:windows:pair -- "%~1" "%~2"
EXIT /B %ERRORLEVEL%
