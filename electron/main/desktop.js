import path from 'node:path'

/**
 * Tray icon, application menu, global shortcuts and track notifications.
 * All playback actions are forwarded to the renderer, which owns playback state.
 */
export function createDesktopIntegration({
  electron,
  resourcesDir,
  prefs,
  getWindow,
  showWindow,
  sendCommand,
  navigate,
  quit
}) {
  const { Tray, Menu, nativeImage, globalShortcut, Notification, app } = electron
  let tray = null
  let player = { isPlaying: false, title: '', artist: '', album: '', artworkUrl: '', mode: 'none' }
  let lastNotifiedTitle = null
  let registeredAccelerators = []

  const isMac = process.platform === 'darwin'

  const trayIcon = () => {
    const file = isMac ? 'trayTemplate.png' : 'tray.png'
    const image = nativeImage.createFromPath(path.join(resourcesDir, file))
    if (isMac) image.setTemplateImage(true)
    return image
  }

  const toggleWindow = () => {
    const win = getWindow()
    if (win && win.isVisible() && !win.isMinimized() && win.isFocused()) win.hide()
    else showWindow()
  }

  const trackLabel = () => {
    if (!player.title) return 'Nothing playing'
    const label = player.artist ? `${player.title} — ${player.artist}` : player.title
    return label.length > 60 ? `${label.slice(0, 57)}…` : label
  }

  const buildTrayMenu = () =>
    Menu.buildFromTemplate([
      { label: trackLabel(), enabled: false },
      { type: 'separator' },
      { label: player.isPlaying ? 'Pause' : 'Play', click: () => sendCommand('playPause') },
      { label: 'Next Track', click: () => sendCommand('next') },
      { label: 'Previous Track', click: () => sendCommand('previous') },
      { type: 'separator' },
      { label: 'Show PixelPod', click: showWindow },
      { label: 'Settings', click: () => navigate('settings') },
      { type: 'separator' },
      { label: 'Quit PixelPod', click: quit }
    ])

  const refreshTray = () => {
    if (!tray) return
    tray.setToolTip(player.title ? `PixelPod — ${trackLabel()}` : 'PixelPod')
    tray.setContextMenu(buildTrayMenu())
  }

  const buildAppMenu = () => {
    const template = [
      ...(isMac
        ? [{ role: 'appMenu', submenu: [
            { role: 'about' }, { type: 'separator' },
            { label: 'Settings…', accelerator: 'Cmd+,', click: () => navigate('settings') },
            { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' }, { label: 'Quit PixelPod', accelerator: 'Cmd+Q', click: quit }
          ] }]
        : [{ label: 'File', submenu: [
            { label: 'Settings', accelerator: 'Ctrl+,', click: () => navigate('settings') },
            { type: 'separator' },
            { label: 'Quit', accelerator: 'Ctrl+Q', click: quit }
          ] }]),
      { role: 'editMenu' },
      { label: 'View', submenu: [
        { label: 'Home', accelerator: 'CmdOrCtrl+1', click: () => navigate('home') },
        { label: 'Search', click: () => navigate('search') },
        { label: 'Your Library', accelerator: 'CmdOrCtrl+2', click: () => navigate('library') },
        { label: 'Now Playing', accelerator: 'CmdOrCtrl+3', click: () => navigate('nowPlaying') },
        { label: 'Classic Mode', click: () => navigate('classic') },
        { type: 'separator' },
        ...(app.isPackaged ? [] : [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }]),
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ] },
      { label: 'Playback', submenu: [
        // In-window shortcuts (Space, Ctrl+Left/Right) are handled by App.jsx so they never double-fire.
        { label: 'Play / Pause', click: () => sendCommand('playPause') },
        { label: 'Next Track', click: () => sendCommand('next') },
        { label: 'Previous Track', click: () => sendCommand('previous') }
      ] },
      { role: 'windowMenu' }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  /**
   * Global shortcuts. Ctrl+Alt+Space/Right/Left are always available (when enabled).
   * Hardware media keys are handled by Chromium's Media Session while the SDK plays
   * audio locally; in Spotify Connect mode there is no local media session, so we
   * register the media keys explicitly to avoid double-handling in SDK mode.
   */
  const updateShortcuts = () => {
    for (const accelerator of registeredAccelerators) globalShortcut.unregister(accelerator)
    registeredAccelerators = []
    if (!prefs.get('globalMediaShortcuts')) return

    const bindings = [
      ['CommandOrControl+Alt+Space', 'playPause'],
      ['CommandOrControl+Alt+Right', 'next'],
      ['CommandOrControl+Alt+Left', 'previous']
    ]
    if (player.mode === 'connect') {
      bindings.push(['MediaPlayPause', 'playPause'], ['MediaNextTrack', 'next'], ['MediaPreviousTrack', 'previous'])
    }
    for (const [accelerator, command] of bindings) {
      try {
        if (globalShortcut.register(accelerator, () => sendCommand(command))) {
          registeredAccelerators.push(accelerator)
        }
      } catch {
        /* accelerator unsupported on this platform */
      }
    }
  }

  const maybeNotify = () => {
    if (!prefs.get('trackNotifications') || !player.isPlaying || !player.title) return
    if (player.title === lastNotifiedTitle) return
    lastNotifiedTitle = player.title
    const win = getWindow()
    if (win && win.isFocused()) return
    if (!Notification.isSupported()) return
    new Notification({ title: player.title, body: [player.artist, player.album].filter(Boolean).join(' · '), silent: true }).show()
  }

  return {
    init() {
      buildAppMenu()
      tray = new Tray(trayIcon())
      tray.on('click', toggleWindow)
      refreshTray()
      updateShortcuts()
      prefs.onChange((key) => {
        if (key === 'globalMediaShortcuts') updateShortcuts()
        if (key === 'launchOnStartup') applyLoginItem()
      })
      applyLoginItem()
    },
    updatePlayer(next) {
      const modeChanged = next.mode !== player.mode
      player = next
      refreshTray()
      if (modeChanged) updateShortcuts()
      maybeNotify()
    },
    dispose() {
      globalShortcut.unregisterAll()
      tray?.destroy()
      tray = null
    }
  }

  function applyLoginItem() {
    if (!app.isPackaged) return // avoid registering the dev Electron binary
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(prefs.get('launchOnStartup')) })
    } catch {
      /* unsupported (e.g. some Linux setups) */
    }
  }
}

