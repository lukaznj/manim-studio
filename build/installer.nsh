; Upgrades must retain working runtimes. Never delete userData wholesale: it contains sign-ins
; and saved settings. The helper uses exactly the same protected allowlist as Settings.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    System::Call 'Kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", w "1")'
    StrCpy $0 -1
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\resources\cleanup-cli.cjs"' $0
    System::Call 'Kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", p 0)'
    ${if} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Manim Studio could not remove all downloaded tools. Close other apps and try uninstalling again. Your projects and settings have been kept."
      SetErrorLevel 1
      Quit
    ${endIf}
  ${endIf}
!macroend
