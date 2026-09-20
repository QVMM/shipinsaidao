import { app, BrowserWindow, dialog, Menu, session } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
let server = null
let mainWindow = null

function runtimePaths() {
  const dataRoot = join(app.getPath('userData'), 'runtime')
  return {
    dataRoot,
    database: join(dataRoot, 'tihua.db'),
    models: app.isPackaged ? join(process.resourcesPath, 'models', 'offline') : join(projectRoot, 'models', 'offline'),
  }
}

async function startLocalServer() {
  const paths = runtimePaths()
  mkdirSync(dirname(paths.database), { recursive: true })
  process.env.OFFLINE_MODE = '1'
  process.env.HOST = '127.0.0.1'
  process.env.DATABASE_PATH = paths.database
  process.env.OFFLINE_MODEL_DIR = paths.models
  process.env.SESSION_SECRET ||= randomBytes(32).toString('hex')

  const [{ buildApp }, { getOfflineVoiceStatus }] = await Promise.all([
    import('../server/app.js'),
    import('../server/offline-voice.js'),
  ])
  const voice = getOfflineVoiceStatus()
  if (!voice.ready) {
    throw new Error(`${voice.message}\n模型目录：${voice.modelDir}`)
  }
  server = await buildApp()
  const address = await server.listen({ port: 0, host: '127.0.0.1' })
  return address
}

function createMainWindow(address) {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const local = webContents.getURL().startsWith('http://127.0.0.1:')
    callback(local && permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return permission === 'media' && requestingOrigin.startsWith('http://127.0.0.1:')
  })

  mainWindow = new BrowserWindow({
    width: 1512,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#001b17',
    title: '替抗蓟化 · 离线竞赛版',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11' || (input.key.toLowerCase() === 'f' && input.control && input.meta)) {
      event.preventDefault()
      mainWindow?.setFullScreen(!mainWindow.isFullScreen())
    }
    if (input.key === 'Escape' && mainWindow?.isFullScreen()) mainWindow.setFullScreen(false)
  })
  mainWindow.loadURL(`${address}/?offline=1#/stage`)
}

const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    try {
      const address = await startLocalServer()
      createMainWindow(address)
    } catch (error) {
      dialog.showErrorBox('离线系统启动失败', String(error?.message || error))
      app.quit()
    }
  })
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  server?.close().catch(() => {})
})
