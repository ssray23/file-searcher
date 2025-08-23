@echo off
setlocal EnableDelayedExpansion

cls
echo ==================================================
echo AI Business Logic Summary Generator
echo ==================================================
echo.

:: -------- 1. SETTINGS ------------------------------------------------
set "IgnoreDirs=.git .vscode .idea __pycache__ node_modules dist build target"
set "SourceCodeExtensions=.txt .md .py .js .ts .html .css .scss .json .xml .yml .yaml .sh .bat .ps1 .cs .java .go .php .rb .c .cpp .h .hpp .rs .sql .gitignore .dockerfile"
set "IncludeDirs="

:: -------- 2. SCAN DIRECTORIES ---------------------------------------
set /a count=0
echo Scanning your project for sub-directories…
echo (Ignoring: %IgnoreDirs%)
echo.

set "tempFile=%TEMP%\dirs_%RANDOM%.txt"
if exist "%tempFile%" del "%tempFile%"

for /f "delims=" %%D in ('dir /ad /b 2^>nul') do call :CheckDirectory "%%D"
goto :ShowMenu

:CheckDirectory
set "currentDir=%~1"
set "isIgnored=false"
for %%I in (%IgnoreDirs%) do if /i "%%I"=="%currentDir%" set "isIgnored=true"
if "%isIgnored%"=="false" (
    echo %currentDir%>>"%tempFile%"
    echo Found directory: %currentDir%
    set /a count+=1
) else (
    echo Ignoring directory: %currentDir%
)
goto :eof

:: -------- 3. SHOW MENU ----------------------------------------------
:ShowMenu
echo.
echo Please choose which folders to include in the summary:
echo [0] Root Project Folder (files in the main directory)

if exist "%tempFile%" (
    set /a menuCount=0
    for /f "usebackq delims=" %%F in ("%tempFile%") do (
        set /a menuCount+=1
        echo [!menuCount!] %%F
    )
) else (
    echo -- No sub-directories found --
)
echo [*] All of the above (Root + all found folders)
echo.

if %count% EQU 0 (
    echo ============================ DEBUG INFO ============================
    echo The script did not find any sub-directories to list.
    dir /ad /b 2>nul
    echo ====================================================================
    echo.
)

:: -------- 4. GET USER SELECTION --------------------------------------
:GetInput
set "selection="
set /p "selection=Enter the numbers of folders to include (e.g., 0,2 or *): "
set "selection=%selection: =%"

if /i "%selection%"=="*" (
    set "IncludeDirs=."
    if exist "%tempFile%" (
        for /f "usebackq delims=" %%F in ("%tempFile%") do set "IncludeDirs=!IncludeDirs! %%F"
    )
) else (
    set "IncludeDirs="
    call :ParseSelection "%selection%"
)

if not defined IncludeDirs (
    echo Invalid selection. Please try again.
    echo.
    goto :GetInput
)

echo.
echo DEBUG: Final IncludeDirs value: %IncludeDirs%
goto :Confirm

:ParseSelection
set "inputStr=%~1"
if "%inputStr%"=="" goto :eof
set "inputStr=%inputStr:,= %"
for %%N in (%inputStr%) do (
    if "%%N"=="0" (
        if not defined IncludeDirs (set "IncludeDirs=.") else set "IncludeDirs=!IncludeDirs! ."
    ) else (
        if exist "%tempFile%" (
            set /a lineNum=0
            for /f "usebackq delims=" %%F in ("%tempFile%") do (
                set /a lineNum+=1
                if !lineNum! EQU %%N (
                    if not defined IncludeDirs (set "IncludeDirs=%%F") else set "IncludeDirs=!IncludeDirs! %%F"
                )
            )
        )
    )
)
goto :eof

:: -------- 5. CONFIRM -------------------------------------------------
:Confirm
for %%I in (.) do set "FolderName=%%~nxI"
set "OutputFile=summary_%FolderName%.txt"

echo --------------------------------------------------
echo Ready to generate summary with these settings:
echo Folders to Scan: %IncludeDirs%
echo Output File:     %OutputFile%
echo --------------------------------------------------
echo.

choice /c YN /m "Proceed with generation?" /n
if errorlevel 2 goto :Cancelled

:: -------- 6. GENERATE SUMMARY FILE ----------------------------------
echo.
echo ==================================================
echo Generating complete folder tree structure...

:: 6-a  header block – closed immediately -------------
(
  echo Project: %FolderName%
  echo.
  echo ==================================================
  echo FOLDER STRUCTURE
  echo ==================================================
  echo.
) > "%OutputFile%"

:: --------- dump full TREE output (no skipping) -----
tree /f /a >> "%OutputFile%"
echo.>>"%OutputFile%"                               & rem blank line before next section

:: 6-c  CORE BUSINESS header --------------------------
(
echo.
echo ==================================================
echo CORE BUSINESS LOGIC SOURCE CODE
echo ==================================================
echo.
) >> "%OutputFile%"

:: 6-d  process files ---------------------------------
echo Searching for source files and appending content...
echo --------------------------------------------------
set "processedFiles="
set /a fileCount=0

for %%D in (%IncludeDirs%) do (
    if "%%D"=="." (
        call :HandleRoot
    ) else (
        call :HandleSub "%%D"
    )
)
goto :Finish

:HandleRoot
for %%F in (*) do if exist "%%~fF" if not exist "%%~fF\\" call :ProcessFile "%%~fF"
goto :eof

:HandleSub
set "dirPath=%~1"
if not exist "%dirPath%" (
    echo Warning: Directory "%dirPath%" does not exist.
    goto :eof
)
for /r "%dirPath%" %%F in (*) do call :ProcessFile "%%~fF"
goto :eof

:ProcessFile
set "fullPath=%~1"
echo "|!processedFiles!|" | findstr /i /c:"|%fullPath%|" >nul && goto :eof
set "processedFiles=!processedFiles!|%fullPath%|"

set "ext=%~x1"
set "fileName=%~nx1"
set "include=false"
for %%E in (%SourceCodeExtensions%) do (
    if /i "%%E"=="!ext!" set "include=true"
    if /i "%%E"=="!fileName!" set "include=true"
)

if "%include%"=="true" (
    if /i not "%fullPath%"=="%~f0" if /i not "%fullPath%"=="%CD%\%OutputFile%" (
        set "rel=%fullPath%"
        set "rel=!rel:%CD%\\=!"
        echo Adding: !rel!
        set /a fileCount+=1
        (
        echo.
        echo --------------------------------------------------
        echo FILE: !rel!
        echo --------------------------------------------------
        type "%fullPath%" 2>nul || echo [Error reading file]
        echo.
        ) >> "%OutputFile%"
    )
)
goto :eof

:: -------- 7. FINISH ----------------------------------------------
:Finish
echo --------------------------------------------------
echo SUCCESS! AI summary generation complete!
echo Files processed: %fileCount%
for %%F in ("%OutputFile%") do echo Output file size: %%~zF bytes
echo.
goto :End

:Cancelled
echo.
echo Operation cancelled by user.
echo.

:End
if exist "%tempFile%" del "%tempFile%"
echo Script has finished. Press any key to exit.
pause >nul
endlocal