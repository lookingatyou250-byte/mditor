; Keep the legacy Markdown ProgIDs for existing Windows defaults.
!macro MDITOR_ASSOCIATE EXT CLASS
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}" "" "Markdown 文档"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}\DefaultIcon" "" '"$INSTDIR\resources\app\build\doc.ico",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}\shell\open\command" "" '"$INSTDIR\mditor.exe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "${CLASS}"
!macroend

!macro MDITOR_UNASSOCIATE EXT CLASS
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\${CLASS}\shell\open\command" ""
  ${if} $R0 == '"$INSTDIR\mditor.exe" "%1"'
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${CLASS}"
    ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
    ${if} $R0 == "${CLASS}"
      DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" ""
    ${endif}
  ${endif}
!macroend

!macro customInstall
  !insertmacro MDITOR_ASSOCIATE "md" "mditor.md"
  !insertmacro MDITOR_ASSOCIATE "markdown" "mditor.markdown"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md\ShellNew" "NullFile" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md\ShellNew" "ItemName" "Markdown 文档"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md\ShellNew" "IconPath" "$INSTDIR\resources\app\build\doc.ico"
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro MDITOR_UNASSOCIATE "md" "mditor.md"
  !insertmacro MDITOR_UNASSOCIATE "markdown" "mditor.markdown"
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.md\ShellNew" "IconPath"
  ${if} $R0 == "$INSTDIR\resources\app\build\doc.ico"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\ShellNew" "NullFile"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\ShellNew" "ItemName"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\ShellNew" "IconPath"
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.md\ShellNew"
  ${endif}
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
