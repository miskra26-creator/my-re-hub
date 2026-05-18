const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let backendProcess;
let tray;

// ── Start the lead capture backend server ────────────────────────────────────
function startBackend() {
  const serverPath = isDev
    ? path.join(__dirname, '..', 'server.js')
    : path.join(process.resourcesPath, 'server.js');

  const nodePath = process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), '..', '..', 'node.exe')
    : 'node';

  try {
    backendProcess = spawn(nodePath, [serverPath], {
      stdio: 'ignore',
      detached: false,
      shell: true,
    });
    backendProcess.on('error', () => {}); // silent if node not found via that path
    console.log('Backend server started');
  } catch (e) {
    console.log('Backend start skipped:', e.message);
  }
}

// ── Create main window ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // allow localhost API calls
    },
    icon: path.join(__dirname, 'logo512.png'),
    backgroundColor: '#050810',
    title: 'Real Estate Hub',
    titleBarStyle: 'default',
    show: false,
    autoHideMenuBar: true,
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  const appUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '..', 'build', 'index.html')}`;

  mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in real browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend();
  // Small delay to let backend start
  setTimeout(createWindow, 800);
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
