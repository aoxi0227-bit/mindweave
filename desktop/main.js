"use strict";
// 思脉 MindWeave 桌面壳：以 ELECTRON_RUN_AS_NODE 子进程方式启动 server.js，
// 窗口加载本地页面。服务器与窗口同生共死；数据写入 app/ 同级 .mindweave/（便携模式）。
const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = parseInt(process.env.PORT || "4317", 10);
const APP_DIR = path.join(__dirname, "app");
let serverProc = null, win = null, quitting = false;

function startServer() {
  if (quitting) return;
  serverProc = spawn(process.execPath, [path.join(APP_DIR, "server.js")], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1", PORT: String(PORT) }),
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  serverProc.on("exit", () => { serverProc = null; if (!quitting) setTimeout(startServer, 1500); });
}

function waitServer(cb, tries) {
  tries = tries || 0;
  const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/health", timeout: 1500 }, (res) => {
    res.resume();
    cb(true);
  });
  req.on("error", () => {
    if (tries > 60) cb(false);
    else setTimeout(() => waitServer(cb, tries + 1), 500);
  });
  req.on("timeout", () => req.destroy());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 900, minHeight: 600,
    title: "思脉 MindWeave",
    icon: path.join(APP_DIR, "logo.png"),
    autoHideMenuBar: true,
    backgroundColor: "#F6F1E4",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL("http://127.0.0.1:" + PORT);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.on("closed", () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    try { fs.mkdirSync(path.join(APP_DIR, ".mindweave"), { recursive: true }); } catch (e) {}
    startServer();
    waitServer((ok) => {
      if (!ok) {
        dialog.showErrorBox("思脉 MindWeave", "本地服务启动失败：端口 " + PORT + " 无响应。请关闭占用该端口的程序后重试。");
        app.quit();
        return;
      }
      createWindow();
    });
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
    if (serverProc) { try { serverProc.kill(); } catch (e) {} }
  });
}
