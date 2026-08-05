; Inno Setup 6 script for LinkedIn JD Collector Agent
; Produces: dist/installer/LinkedIn_JD_Collector_Setup.exe
;
; Prerequisites:
;   1. Build the app first:  python build\build_exe.py
;   2. Install Inno Setup 6
;   3. Compile: ISCC build\installer.iss
;      or:      python build\build_exe.py --installer

#define MyAppName "LinkedIn JD Collector Agent"
#define MyAppShort "LinkedIn_JD_Collector"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LinkedIn JD Collector"
#define MyAppExeName "LinkedIn_JD_Collector.exe"
#define MyAppURL "https://github.com/mathen-stack/cursor_2"

[Setup]
AppId={{A7C3E9D1-4B28-4F6A-9C11-2D8E5F0A1B77}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppShort}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=LinkedIn_JD_Collector_Setup
SetupIconFile=..\resources\app.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
; Package the entire PyInstaller onedir output
Source: "..\dist\LinkedIn_JD_Collector\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Dirs]
; Ensure Documents\LinkedIn_JD exists for first run
Name: "{userdocs}\LinkedIn_JD"; Flags: uninsneveruninstall
