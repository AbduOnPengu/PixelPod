<p align="center">
  <img src="https://img.shields.io/badge/Electron-44%20(Widevine%20ECS)-47848F?logo=electron&logoColor=white" alt="Electron 44 ECS" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite 5" />
  <img src="https://img.shields.io/badge/Spotify-PKCE%20%2B%20Connect-1DB954?logo=spotify&logoColor=white" alt="Spotify PKCE + Connect" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License" />
</p>

# PixelPod 2.0

**A dark-first desktop Spotify player with a nostalgic iPod Classic soul.**

PixelPod pairs a modern, keyboard-driven **Electron desktop music interface** with a faithful **Classic iPod Mode** powered by a rotary click wheel, LCD screen themes, anodized aluminum skins, and Web Audio tactile feedback — both sharing the exact same live playback and queue state.

> **Spotify Premium** is required for full track playback (via the built-in Web Playback SDK or Spotify Connect). Free accounts can sign in, browse playlists/liked songs, and search the catalog.

---

## Features

### Modern Desktop Experience
- **Three-Region Desktop Shell** — Frameless custom title bar with Back/Forward navigation and quick search, collapsible library sidebar, responsive content viewport, and persistent bottom player bar.
- **Full Library & Discovery** — Personalized Home (Recently Played, Top Tracks, Top Artists, Featured Playlists), debounced multi-entity Search (Tracks, Albums, Artists, Playlists), Grid/List Library browser with sort & filter, and rich Collection views for Playlists, Albums, Artists, Liked Songs, and Recent History.
- **Centerpiece Now Playing** — High-resolution album art with optional ambient artwork backdrop, interactive scrub bar, output mode badge (`Built-in SDK` vs `Spotify Connect`), and live Up Next preview.
- **Slide-Over Queue & Device Picker** — Inspect upcoming tracks, jump to any item, add tracks to your Spotify queue, or transfer playback seamlessly across active Spotify Connect devices.
- **Appearance Customization** — Dark-first design token system with 4 accent palettes (*Ember*, *Mint*, *Iris*, *Gold*), ambient backdrop toggle, and reduced-motion controls (*System*, *Reduce*, *Full*).

### Classic iPod Mode
- **Rotary Click Wheel** — Drag around the wheel to scroll menus with angular tracking, or use the directional `MENU`, `◀◀`, `▶▶`, `▶❚❚`, and center `SELECT` buttons.
- **Authentic Hardware Customization** — Switch instantaneously between *Classic* and *Modern* LCD screen themes, *Silver*, *Graphite*, and *Blue* anodized shells, and synthesized Web Audio click sounds.
- **Unified Playback State** — Switch between Desktop View and Classic Mode (`Ctrl/Cmd + Shift + C`) at any time without interrupting playback or losing your queue.

### Security & Native Desktop Integration
- **Pure PKCE OAuth 2.0 (No Client Secret)** — Signs in through your default system browser with an ephemeral `127.0.0.1` loopback listener (`S256` PKCE + CSRF `state`). No Express server and no `SPOTIFY_CLIENT_SECRET` required.
- **OS-Encrypted Token Storage** — Refresh tokens never leave the Electron main process and are encrypted on disk via Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux `libsecret`), falling back to memory-only if OS encryption is unavailable.
- **Hardened Renderer Sandbox** — Runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, sender-frame-verified IPC handlers, custom `app://pixelpod` protocol, and a strict Content Security Policy.
- **Dual Playback Engine** — Ships on castLabs Electron for Content Security (`v44.10.1+wvcus`) for Widevine EME in-app playback, and automatically falls back to **Spotify Connect** Web API remote control when Widevine is unavailable or an external speaker/app is selected.
- **Native OS Integration** — System tray icon & menu, global media key shortcuts, OS `navigator.mediaSession` metadata/controls, silent unfocused track-change notifications, multi-display-safe window bounds persistence, minimize/close-to-tray, and launch-on-startup.

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete architectural audit and engineering decisions.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Electron Main Process (electron/main/)                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ PKCE Auth    │  │ safeStorage  │  │ Atomic Prefs  │  │ Tray, Menu,   │  │
│  │ 127.0.0.1    │  │ Token Store  │  │ & WindowState │  │ Global Keys   │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  └───────┬───────┘  │
│         └─────────────────┴────────┬─────────┴──────────────────┘          │
│                                    │ Guarded IPC (sender origin + schema)  │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Sandboxed Preload (electron/preload/index.cjs)                            │
│  contextBridge -> Object.freeze(window.pixelpod)                           │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  React 18 Renderer (src/) — served via app://pixelpod with strict CSP      │
│  AuthContext ─► PreferencesContext ─► SpotifyContext ─► PlaybackContext     │
│                                                           └─► QueueContext │
│  ┌────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Modern Desktop Shell & Pages       │  │ Classic iPod Mode            │  │
│  │ Home / Search / Library / Queue /  │  │ IPod + Screen + ClickWheel   │  │
│  │ Collection / NowPlaying / Settings │  │ Themes + Skins + Web Audio   │  │
│  └────────────────────────────────────┘  └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```text
pixelpod/
├── electron/
│   ├── main/                  # Main process: PKCE auth, safeStorage, prefs, CSP/app://, tray, window state
│   ├── preload/               # Sandboxed CommonJS contextBridge (window.pixelpod)
│   ├── shared/                # Frozen IPC channels, preference schema, CSP builder
│   └── __tests__/             # Node-environment unit tests for Electron main & preload
├── src/
│   ├── components/
│   │   ├── shell/             # Desktop TitleBar, collapsible Sidebar, persistent PlayerBar
│   │   ├── ui/                # Artwork, MediaCard, TrackRow, QueueDrawer, Skeleton, StatePanel, Toast
│   │   └── ...                # Classic IPod, Screen, ClickWheel, ErrorBoundary
│   ├── pages/                 # Login, Home, Search, Library, Collection, NowPlaying, Settings, ClassicMode
│   ├── screens/               # Classic iPod LCD screens (Boot, Login, Menu, Search, NowPlaying, Settings)
│   ├── context/               # Auth, Preferences, Toast, Spotify, Playback, Queue providers
│   ├── services/              # Auth, Spotify Web API, and Playback/Connect service layers
│   ├── hooks/                 # Queue manager, Classic navigation, wheel & keyboard hooks
│   ├── desktop/               # Safe renderer wrapper around window.pixelpod
│   ├── styles/                # Dark-first CSS custom property design tokens
│   ├── utils/                 # Token cache, authenticated fetch, formatters, Web Audio sounds
│   └── __tests__/             # Renderer unit & integration tests (Desktop + Classic Mode)
├── scripts/                   # Icon generator, Electron launcher, optional castLabs VMP hooks
├── resources/                 # Runtime app & tray icons
├── build/                     # Packaging icon assets
├── docs/ARCHITECTURE.md       # System architecture & audit documentation
├── electron-builder.yml       # Cross-platform packaging configuration (Windows, macOS, Linux)
└── SETUP.md                   # Spotify Developer setup, PKCE redirect URI, and packaging guide
```

---

## Quick Start

### Prerequisites
- **Node.js** >= 20 and **npm** >= 10
- A **Spotify Developer** app ([developer.spotify.com/dashboard](https://developer.spotify.com/dashboard))
- **Spotify Premium** (for full audio playback)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Your Spotify App
1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and click **Create App**.
2. Add this exact **Redirect URI**:
   ```text
   http://127.0.0.1:43821/callback
   ```
   *(Spotify requires an explicit loopback IP literal — do **not** use `localhost`.)*
3. Copy your 32-character **Client ID** (no Client Secret is needed).
4. Paste the Client ID directly on PixelPod's welcome screen when the app launches, **or** copy `.env.example` to `.env` and set `SPOTIFY_CLIENT_ID=...` for local development.

See [SETUP.md](SETUP.md) for full details, troubleshooting, and Widevine/Spotify Connect notes.

### 3. Launch in Development
```bash
npm run dev
```
Starts the Vite HMR server (`http://127.0.0.1:5174`) and launches the PixelPod Electron desktop window automatically.

---

## Scripts & Packaging Commands

| Command | Description |
|---|---|
| `npm run dev` | Run Vite renderer HMR + Electron desktop app concurrently |
| `npm run build` | Build the production renderer bundle into `dist/` |
| `npm start` | Launch Electron directly against the production `dist/` bundle |
| `npm test` | Run Vitest in interactive watch mode |
| `npm run test:run` | Execute the full unit & integration test suite once |
| `npm run lint` | Lint `src/` and `electron/` with ESLint |
| `npm run format` | Format `src/` and `electron/` with Prettier |
| `npm run icons` | Regenerate procedural app & system tray PNG icons |
| `npm run pack` | Build `dist/` and create an unpacked desktop directory in `release/` |
| `npm run dist:win` | Build Windows **NSIS installer** (`Setup`) + **Portable** `.exe` in `release/` |
| `npm run dist:mac` | Build macOS `.dmg` (`x64` + `arm64`) in `release/` |
| `npm run dist:linux` | Build Linux `AppImage` + `deb` packages in `release/` |

---

## Keyboard Shortcuts

### Desktop Shell
| Shortcut | Action |
|---|---|
| `Space` | Play / Pause |
| `Ctrl/Cmd + →` / `Ctrl/Cmd + ←` | Next / Previous track |
| `S` / `R` | Toggle Shuffle / Cycle Repeat mode |
| `+` / `-` / `M` | Volume up / Volume down / Mute |
| `Ctrl/Cmd + K` | Jump to Search and focus query input |
| `Alt + ←` / `Alt + →` | Navigate Back / Forward |
| `Ctrl/Cmd + Shift + C` | Toggle between Modern Desktop and Classic iPod Mode |

### Classic iPod Mode
| Key | Action |
|---|---|
| `↑` / `↓` | Scroll menu items |
| `Enter` / `Escape` | Select (`SELECT`) / Back (`MENU`) |
| `Space` | Play / Pause |
| `←` / `→` | Previous / Next track |
| `S` / `R` / `M` / `+` / `-` | Shuffle / Repeat / Mute / Volume |

---

## License

Released under the [MIT License](LICENSE).
