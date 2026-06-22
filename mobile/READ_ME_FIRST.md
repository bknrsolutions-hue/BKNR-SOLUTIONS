# BKNR ERP Mobile App — Quick Start Guide

## 📱 Running on your phone

### Step 1: Find your Mac's IP address
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```
Example: `192.168.1.100`

### Step 2: Update the backend URL
Open `mobile/src/config.js` and set your Mac's LAN IP:
```js
export const BASE_URL = 'http://192.168.1.100:8000';
```

> **Important:** Your phone and Mac must be on the **same WiFi network**.

### Step 3: Install Expo Go on your phone
- iPhone: [App Store → Expo Go](https://apps.apple.com/app/expo-go/id982107779)
- Android: [Play Store → Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

### Step 4: Start the dev server (if not running)
```bash
cd mobile
npx expo start
```

### Step 5: Scan the QR code
- **iPhone**: Scan with the Camera app
- **Android**: Scan with the Expo Go app

---

## 🖥️ Running on iOS Simulator (Mac only)
```bash
cd mobile
npx expo start --ios
```

## 🤖 Running on Android Emulator
```bash
cd mobile
npx expo start --android
```

---

## 📁 Project Structure
```
mobile/
├── App.js                    ← Root entry (don't edit)
├── app.json                  ← App name, bundle ID, config
├── src/
│   ├── config.js             ← 🔴 SET YOUR IP HERE
│   ├── menuData.js           ← All ERP module definitions
│   ├── context/
│   │   └── AuthContext.js    ← Login/logout logic
│   ├── navigation/
│   │   └── AppNavigator.js   ← Screen routing
│   ├── screens/
│   │   ├── LoginScreen.js    ← Sign in screen
│   │   ├── HomeScreen.js     ← Category grid
│   │   ├── ModuleGridScreen.js ← Module list
│   │   └── WebViewScreen.js  ← ERP page viewer
│   └── components/
│       └── LoadingScreen.js  ← Loading spinner
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---|---|
| "Cannot reach server" | Check `BASE_URL` in `config.js` has your LAN IP |
| App shows white screen | Make sure backend is running: `uvicorn app.main:application` |
| Session keeps expiring | Normal — log in again. Session lasts 8 hours |
| WebView blank | Ensure `usesCleartextTraffic: true` in `app.json` (Android) |

---

## 🚀 For Production
1. Set `BASE_URL` to your production domain (HTTPS)
2. Remove `NSAllowsArbitraryLoads: true` from `app.json` (iOS)
3. Remove `usesCleartextTraffic: true` from `app.json` (Android)  
4. Run `npx expo build` or use EAS Build
