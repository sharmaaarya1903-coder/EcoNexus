# EcoNexus — Easy Server Connection Guide

## What this package does
Your EcoNexus app can connect to one main PC server. That server handles:
- login / account creation
- user activity + active-user count
- campaigns
- updates
- gallery
- central app settings

## 1. Put the server on your PC
Extract this ZIP.
Open:
`server`

Double-click:
`start-econexus.bat`

The server listens on port **3000**.

## 2. Your PC IP
For the current setup, the app config uses:
`http://192.168.29.217:3000`

If your PC IP changes, edit **one line** in:
`app-config/config.js`

Example:
`window.ECONEXUS_API_BASE = "http://192.168.29.217:3000";`

## 3. Test the server
On the PC, open:
`http://localhost:3000/api/health`

You should see JSON containing:
`"ok":true`

From a phone on the SAME Wi-Fi, open:
`http://192.168.29.217:3000/api/health`

If that works, the phone can reach the server.

## 4. Windows Firewall
If the phone cannot open the address:
- allow **Node.js** through Windows Defender Firewall on **Private networks**
- make sure the PC and phone are on the same Wi-Fi
- make sure the router is not using guest/client isolation

## 5. Connect the Android app
The Android project contains:
`app/src/main/assets/config.js`

This package already sets it to:
`http://192.168.29.217:3000`

Open the Android project in Android Studio and run it on the phone.

## 6. Admin panel
The web server itself serves the app at:
`http://192.168.29.217:3000/`

Your Main Data Center can use the same server APIs.

Default admin password for this demo server:
`EcoNexusAdmin123!`

IMPORTANT: change it before any public/internet deployment. For a school/local-network demo this is fine as a starting point.

## 7. Account activity
The server stores accounts in:
`server/data.json`

The server tracks:
- account creation time
- last login
- last seen / heartbeat
- active status

The admin Users & Activity page reads:
`/api/admin/users`

The app should send a heartbeat to:
`/api/auth/heartbeat`

Every active user is considered online for roughly 90 seconds after the most recent heartbeat.

## 8. Important: same Wi-Fi
For the easiest school demo:
**PC + phone = same Wi-Fi**

Do NOT expose this demo server directly to the public internet without proper HTTPS, stronger authentication, database security, rate limiting, and production configuration.

## 9. If the IP changes
Run on Windows:
`ipconfig`

Find the IPv4 Address of the active Wi-Fi/Ethernet adapter.
Then change the API base in the app config.

## 10. Best setup for your project
PC:
`server.js` → port 3000

Phone:
`EcoNexus Android app`

Connection:
`Phone → Wi-Fi → PC:3000 → EcoNexus API`

Admin:
`Main Data Center → same PC:3000`
