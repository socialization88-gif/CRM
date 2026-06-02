# Windows Update Checklist

Use this after building a new installer for the desktop app.

## Build
- Run `npm run dist:win`
- Wait for the installer to finish creating inside `dist/`

## Install
- Run the new installer file from `dist/`
- Finish the setup using the default options unless you want a custom install folder

## Replace old shortcut
- Unpin the old `Electron` taskbar icon if it exists
- Open Start Menu and find `QUANTUM Work Management`
- Pin the new shortcut to the taskbar
- If an old desktop shortcut exists, delete it and use the new one

## Verify
- Open the app from the new pinned icon
- Confirm the window title shows `QUANTUM Work Management`
- Confirm the app icon matches `Qlogo`
- Confirm login and upload flows still work

## If something looks old
- Uninstall the previous version from Apps and Features
- Reinstall the new `dist` installer
- Pin the Start Menu shortcut again
