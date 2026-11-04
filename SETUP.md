# PixelPod Desktop Setup & Packaging Guide

PixelPod 2.0 is a standalone Electron desktop application. It authenticates directly with Spotify using **OAuth 2.0 Authorization Code with PKCE** — no local Express server and **no Spotify Client Secret** are ever used or stored.

---

## 1. Create Your Spotify Developer App

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and sign in.
2. Click **Create App** and enter:
   - **App name**: `PixelPod`
   - **App description**: `Desktop Spotify player`
   - **Redirect URI** *(must match character-for-character)*:
     ```text
     http://127.0.0.1:43821/callback
     ```
   - **APIs used**: Check **Web API** and **Web Playback SDK**.
3. Click **Save**, open **Settings**, and copy your 32-character hexadecimal **Client ID**.
   - You do **not** need your Client Secret. Never paste or commit a Client Secret.

> **Why `127.0.0.1` instead of `localhost`?**
> Spotify's OAuth redirect URI policy forbids `localhost` and only permits HTTP redirects on explicit loopback IP literals (`127.0.0.1` or `[::1]`). PixelPod binds a temporary loopback listener to `127.0.0.1:43821` **only** while an active login is waiting for the browser callback, then immediately closes the port.

### Development Mode Users
New Spotify Developer apps start in **Development Mode**, which restricts sign-in to allowlisted accounts:
- If you are signing in with the same Spotify account that created the app, it works immediately.
- To allow additional testers, add their name and Spotify email under **Dashboard → Users and Access**.

---

## 2. Provide Your Client ID to PixelPod

You have two ways to configure your Spotify Client ID:

### Option A — In-App Setup (Recommended & Used by Packaged Builds)
1. Launch PixelPod (`npm run dev`, `npm start`, or the installed `PixelPod` desktop app).
2. On the **Welcome to PixelPod** screen (or **Settings → Spotify Developer App**), paste your 32-character **Client ID**.
3. Click **Connect with Spotify**.
4. Authorize PixelPod in your default browser and return to the app.

Your Client ID is stored in PixelPod's OS `userData` directory (`preferences.json`), and your OAuth tokens are encrypted via OS-native credential storage (`safeStorage` — Windows DPAPI, macOS Keychain, or Linux `libsecret`) in `tokens.bin`.

### Option B — `.env` File (Local Development Convenience)
During unpackaged development (`npm run dev` / `npm start`), PixelPod also checks a root `.env` file:

```bash
cp .env.example .env
```

```env
SPOTIFY_CLIENT_ID=your_32_char_spotify_client_id_here
# Optional: override loopback callback port if 43821 is occupied on your machine
# (Remember to register the matching port in your Spotify App's Redirect URIs!)
# PIXELPOD_OAUTH_PORT=43821
```

> Packaged installers **never** bundle or read `.env` files.

---

## 3. Running in Development & Production

```bash
# Install dependencies (downloads castLabs Electron w/ Widevine)
npm install

# Run Vite HMR + Electron together
npm run dev

# Run lint & automated test suite
npm run lint
npm run test:run

# Build production renderer and launch standalone Electron against dist/
npm run build
npm start
```

---

## 4. Playback Modes: Built-in SDK vs. Spotify Connect

PixelPod supports two official Spotify playback paths seamlessly:

1. **Built-in Desktop Player (Spotify Web Playback SDK + OEM VMP Audio Engine)**
   - Spotify's Widevine license server strictly enforces production OEM Verified Media Path (VMP) signatures. On desktop, PixelPod automatically hosts Spotify's official Web Playback SDK inside an invisible, isolated headless system Chromium worker (Microsoft Edge on Windows, or Google Chrome / Brave) while keeping all UI, OS media keys, and encrypted token storage inside Electron.
   - PixelPod registers itself as a native Spotify device named **`PixelPod`** and streams full-length tracks directly on your computer without requiring an external Spotify window.

2. **Spotify Connect Mode (Automatic Fallback & Multi-Device Control)**
   - If Widevine EME cannot initialize on a system (for example, when running an unsigned binary on platforms enforcing Verified Media Path / VMP) — or whenever you prefer playing through external speakers, a phone, or the official Spotify client — PixelPod automatically switches to **Spotify Connect** mode.
   - Open the **Devices** drawer from the title bar or bottom player bar to select any active Spotify device and control playback, scrubbing, volume, shuffle, repeat, and queue via the Spotify Web API.

> **Spotify Premium Requirement**: Both the Web Playback SDK and Web API playback control endpoints require an active **Spotify Premium** subscription.

---

## 5. Building Installable Desktop Packages

PixelPod uses `electron-builder` (configured in `electron-builder.yml`) to produce standalone packages that bundle only `dist/`, `electron/`, `resources/`, and `package.json` inside `app.asar` — no dev server or `.env` files are included.

```bash
# Unpacked directory build for quick inspection (release/win-unpacked, etc.)
npm run pack

# Windows: builds NSIS Setup installer + Portable .exe in release/
npm run dist:win

# macOS: builds x64 + arm64 DMG in release/
npm run dist:mac

# Linux: builds AppImage + Debian (.deb) in release/
npm run dist:linux
```

### Optional: castLabs EVS (Widevine VMP Signing) for Public Redistribution
On Windows and macOS, Google Widevine's Verified Media Path (VMP) policy requires redistributed production binaries using the Web Playback SDK to carry a castLabs EVS signature; otherwise Widevine EME refuses initialization and PixelPod gracefully uses **Spotify Connect** mode.

If you have a castLabs EVS account and Python `castlabs-evs` (`python3 -m pip install castlabs-evs`):
1. Authenticate once with `python3 -m castlabs_evs.account reauth`.
2. Build with VMP signing enabled (`scripts/vmp-after-pack.cjs` / `scripts/vmp-after-sign.cjs`):
   ```bash
   npx cross-env PIXELPOD_VMP_SIGN=1 npm run dist:win
   ```

---

## 6. Troubleshooting

- **`INVALID_CLIENT: Invalid redirect URI` in browser**
  - Verify your Spotify Developer App settings include **`http://127.0.0.1:43821/callback`** with `http://`, `127.0.0.1` (not `localhost`), port `43821`, and no trailing slash, then click **Save** in the Spotify Dashboard.
- **Port `43821` is already in use**
  - Close the conflicting process, or launch with `PIXELPOD_OAUTH_PORT=43822` and add `http://127.0.0.1:43822/callback` to your Spotify App's Redirect URIs.
- **"Open Spotify on any device…" banner**
  - You are currently in **Spotify Connect** mode with no active remote device. Open Spotify on your desktop, web player, or phone once so it appears in PixelPod's **Devices** drawer, then click it to activate playback.
- **Resetting stored session or preferences**
  - Open **Settings → Account → Log out** inside PixelPod to wipe `tokens.bin` immediately. User preferences and window bounds live in Electron's OS `userData` folder (`%APPDATA%\PixelPod` on Windows, `~/Library/Application Support/PixelPod` on macOS, `~/.config/PixelPod` on Linux).
