const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// Using native fetch in Node 18+ / Electron 28+
// If older, we would use node-fetch

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const CACHE_PATH = path.join(app.getPath('userData'), 'shutdown_cache.json');

let tray = null;
let mainWindow = null;
let heartbeatInterval = null;
let config = {};

// 1. Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

// 2. Load Config
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        } catch (e) {
            console.error('Config parse error', e);
        }
    }
}

function saveConfig(newConfig) {
    config = { ...config, ...newConfig };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
    
    // Setup auto-start
    app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath
    });

    startMonitoring();
}

function getCurrentTimeStr() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

// 3. API Communication
async function sendToGas(action, extraParams = {}) {
    if (!config.gasUrl || !config.dept || !config.name) return false;
    
    const payload = {
        action,
        dept: config.dept,
        name: config.name,
        time: getCurrentTimeStr(),
        ...extraParams
    };

    try {
        const response = await fetch(config.gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await response.json();
        return data.success;
    } catch (e) {
        console.error(`Error sending ${action}:`, e);
        return false;
    }
}

// Detached curl fallback for shutdown
function sendOffWithCurl() {
    if (!config.gasUrl) return;
    const time = getCurrentTimeStr();
    const payload = JSON.stringify({
        action: 'recordOff',
        dept: config.dept,
        name: config.name,
        time: time
    }).replace(/"/g, '\\"'); // escape quotes for powershell

    // Use powershell Invoke-RestMethod for detached execution since it's windows
    const psCommand = `Invoke-RestMethod -Uri "${config.gasUrl}" -Method Post -Body '${payload}' -ContentType "text/plain;charset=utf-8"`;
    
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
}

// 4. Monitoring Logic
function startMonitoring() {
    if (!config.gasUrl || !config.dept || !config.name) return;

    // Send Boot
    sendToGas('recordBoot');

    // Start Heartbeat (every 30 seconds)
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        const time = getCurrentTimeStr();
        // Save to local cache as well
        fs.writeFileSync(CACHE_PATH, JSON.stringify({ lastTime: time }));
        sendToGas('heartbeat');
        
        // Also check for alert (Overtime encourage to leave)
        checkAlertTime(time);
    }, 30000);
}

let alertTriggered = false;
async function checkAlertTime(currentTime) {
    if (alertTriggered || !config.gasUrl) return;
    // Basic check against settings could be implemented by fetching settings on boot
    // For simplicity, hardcode check around 18:00 if not implemented via API
    // Actually, GAS gets settings but desktop needs to know.
    // Assuming alert time is around 18:00
    if (currentTime.startsWith('18:00') || currentTime.startsWith('18:01')) {
        alertTriggered = true;
        new Notification({
            title: '퇴근 안내',
            body: '정규 업무 시간이 종료되었습니다. 시간외근무 미신청자는 신속히 퇴근하시기 바랍니다.'
        }).show();
    }
}

// 5. App Lifecycle
app.whenReady().then(() => {
    loadConfig();

    // Setup Tray
    tray = new Tray(path.join(__dirname, 'icon.ico')); // ensure icon.ico exists or ignore warning
    const contextMenu = Menu.buildFromTemplate([
        { label: '설정 열기', click: createMainWindow },
        { label: '종료 (기록 강제 저장)', click: () => {
            sendOffWithCurl();
            app.quit();
        }}
    ]);
    tray.setToolTip('PC ON/OFF 모니터링');
    tray.setContextMenu(contextMenu);

    if (!config.gasUrl) {
        createMainWindow();
    } else {
        startMonitoring();
    }

    // OS Signals for Shutdown
    powerMonitor.on('shutdown', () => {
        sendOffWithCurl();
    });

    app.on('session-end', () => {
        sendOffWithCurl();
    });
});

function createMainWindow() {
    if (mainWindow) {
        mainWindow.focus();
        return;
    }
    mainWindow = new BrowserWindow({
        width: 450,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers
ipcMain.handle('save-config', async (event, newConfig) => {
    saveConfig(newConfig);
    if(mainWindow) {
        mainWindow.hide(); // hide instead of close for tray app
    }
    return { success: true };
});

ipcMain.handle('get-config', () => {
    return config;
});

// Create a dummy icon if not exists
if (!fs.existsSync(path.join(__dirname, 'icon.ico'))) {
    // Just create a blank file to avoid crash, in real prod this would be a real ico
    fs.writeFileSync(path.join(__dirname, 'icon.ico'), '');
}
