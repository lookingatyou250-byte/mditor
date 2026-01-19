; Custom NSIS installer script for mditor
; This script ensures proper file association with "%1" parameter

!macro customInstall
  ; Register .md file association
  WriteRegStr HKCR ".md" "" "mditor.md"
  WriteRegStr HKCR "mditor.md" "" "Markdown 文档"
  WriteRegStr HKCR "mditor.md\DefaultIcon" "" "$INSTDIR\resources\app\build\doc.ico"
  WriteRegStr HKCR "mditor.md\shell\open\command" "" '"$INSTDIR\mditor.exe" "%1"'

  ; Register "New Markdown 文档" in right-click context menu
  WriteRegStr HKCR ".md\ShellNew" "NullFile" ""
  WriteRegStr HKCR ".md\ShellNew" "ItemName" "Markdown 文档"
  WriteRegStr HKCR ".md\ShellNew" "IconPath" "$INSTDIR\resources\app\build\doc.ico"

  ; Register .markdown file association
  WriteRegStr HKCR ".markdown" "" "mditor.markdown"
  WriteRegStr HKCR "mditor.markdown" "" "Markdown 文档"
  WriteRegStr HKCR "mditor.markdown\DefaultIcon" "" "$INSTDIR\resources\app\build\doc.ico"
  WriteRegStr HKCR "mditor.markdown\shell\open\command" "" '"$INSTDIR\mditor.exe" "%1"'

  ; Refresh shell icons
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; Remove .md file association
  DeleteRegKey HKCR "mditor.md"
  DeleteRegKey HKCR ".md\ShellNew"
  DeleteRegKey HKCR ".md"

  ; Remove .markdown file association
  DeleteRegKey HKCR "mditor.markdown"
  DeleteRegKey HKCR ".markdown"

  ; Refresh shell icons
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend
