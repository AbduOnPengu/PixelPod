import { spawn } from 'node:child_process'
import electronPath from 'electron'

// Electron-based IDEs (VS Code, Cursor, Antigravity) export ELECTRON_RUN_AS_NODE=1
// in integrated terminals, which forces child Electron binaries into plain Node mode
// unless deleted from the environment before spawning.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const args = ['.', ...process.argv.slice(2)]
const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env,
  windowsHide: false
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

