const path = require('path');
const { app, BrowserWindow } = require('electron');
const { start } = require('./server');

const PORT = Number(process.env.PORT || 3000);
const APP_NAME = 'QUANTUM Work Management';
const APP_ID = 'com.quantum.workmanagement';
let mainWindow = null;

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

async function isServerReachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`http://127.0.0.1:${PORT}/`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok || response.status === 200;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'assets', 'Qlogo.ico'),
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (!(await isServerReachable())) {
    await start();
  }
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
