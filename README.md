# CallSevai WhatsApp CRM Bot

**Tamil Nadu Home Services | callsevai.com | WhatsApp: +91 87783 73517**

Automates lead management, technician assignment, and commission tracking — 100% free stack.

## Quick Start
```bash
npm install
cp .env.example .env   # fill in values
node whatsapp-bot/bot.js
```

See `docs/IMPLEMENTATION.md` for full setup guide.

## Stack
- **Bot**: Node.js + whatsapp-web.js
- **CRM**: Google Sheets + Google Apps Script
- **Rules**: JSON files (services, areas, technicians, status)
- **Cost**: ₹0

## Flow
```
Customer WhatsApp → Bot detects service+area → Lead created → 
Tech notified → Tech updates status → Commission tracked → Google Sheet updated
```
