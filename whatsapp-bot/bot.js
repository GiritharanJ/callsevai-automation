// bot.js — CallSevai WhatsApp Automation Bot
// Run: node bot.js
// Requires: npm install whatsapp-web.js qrcode-terminal dotenv

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode                = require('qrcode-terminal');
const { parseLead }         = require('./lead-parser');
const { parseStatus, extractLeadId } = require('./status-parser');
const { findTechnicians, formatTechnicianMessage } = require('./technician-parser');
const { createCommissionRecord, formatCommissionAlert, formatPaidConfirmation } = require('./commission-parser');
const sheets                = require('../sheets/sheet-helper');
const techniciansDB         = require('../rules/technicians.json').technicians;

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const OWNER_NUMBER = process.env.OWNER_NUMBER; // e.g. "918778373517@c.us"
const BOT_ACTIVE_FROM = parseInt(process.env.BOT_ACTIVE_FROM || '8');  // 8 AM
const BOT_ACTIVE_TO   = parseInt(process.env.BOT_ACTIVE_TO   || '21'); // 9 PM

// Known technician phones (auto-loaded from rules)
const TECH_PHONES = new Set(
  techniciansDB.map(t => t.phone + '@c.us')
);

// ─── SESSION STORE (in-memory, resets on bot restart) ────────────────────────
// Maps leadId → { lead, technician, status }
const sessionStore = new Map();

// Maps techPhone → last known leadId (for status updates without lead ID)
const techLastLead = new Map();

// ─── CLIENT SETUP ────────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'callsevai' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// ─── EVENT: QR CODE ──────────────────────────────────────────────────────────

client.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with your Business WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

// ─── EVENT: READY ─────────────────────────────────────────────────────────────

client.on('ready', () => {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`\n✅ CallSevai Bot is LIVE — ${now}`);
  console.log(`📋 Active hours: ${BOT_ACTIVE_FROM}:00 AM – ${BOT_ACTIVE_TO}:00 PM\n`);
});

// ─── EVENT: MESSAGE ──────────────────────────────────────────────────────────

client.on('message', async (msg) => {
  // Skip group messages, status messages, self-messages
  if (msg.from === 'status@broadcast') return;
  if (msg.id.fromMe) return;
  if (msg.from.includes('@g.us')) return; // skip groups

  // Check active hours
  if (!isActiveHours()) {
    console.log(`[Bot] Message from ${msg.from} — outside active hours, skipping.`);
    return;
  }

  const sender  = msg.from;
  const text    = msg.body?.trim();
  if (!text) return;

  console.log(`\n📩 [${new Date().toLocaleTimeString('en-IN')}] From: ${sender}`);
  console.log(`   Message: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);

  // ── Route by sender type ──────────────────────────────────────────────────

  if (TECH_PHONES.has(sender)) {
    await handleTechnicianMessage(sender, text, msg);
  } else {
    await handleCustomerMessage(sender, text, msg);
  }
});

// ─── CUSTOMER MESSAGE HANDLER ─────────────────────────────────────────────────

async function handleCustomerMessage(sender, text, msg) {
  // Log raw message
  await sheets.logMessage(sender, text, 'CUSTOMER_RAW');

  const lead = parseLead(sender, text);
  console.log(`   [Parser] Type: ${lead.type} | Service: ${lead.service?.name} | Area: ${lead.area}`);

  if (lead.type === 'LEAD') {
    // Find matching technicians
    const techs      = findTechnicians(lead.service.name, lead.area);
    const bestTech   = techs[0] || null;

    // Save to session
    sessionStore.set(lead.leadId, { lead, technician: bestTech, status: 'NEW' });
    if (bestTech) techLastLead.set(bestTech.phone + '@c.us', lead.leadId);

    // Push to Google Sheet
    await sheets.addLead(lead, bestTech);

    // Reply to customer
    const customerReply =
      `✅ *நன்றி! CallSevai உங்கள் request பெற்றது.*\n\n` +
      `🔧 Service: *${lead.service.name}*\n` +
      `📍 Area: *${lead.area || 'Confirming...'}*\n` +
      `🆔 Lead ID: *${lead.leadId}*\n\n` +
      `👷 Expert confirm ஆவதற்கு *2-5 minutes* காத்திருங்கள்.\n` +
      `📞 தொடர்புக்கு: *8778373517*`;

    await msg.reply(customerReply);

    // Notify owner about new lead
    const ownerMsg =
      `🔔 *NEW LEAD — ${lead.leadId}*\n` +
      `👤 ${lead.customerName} | 📞 ${lead.customerPhone}\n` +
      `🔧 ${lead.service.name} | 📍 ${lead.area || 'Area not specified'}\n` +
      `💬 "${text.substring(0, 100)}"\n\n` +
      (bestTech
        ? `👷 Auto-matched: *${bestTech.name}* (+${bestTech.phone})`
        : `⚠️ No technician auto-matched. Please assign manually.`
      );

    await notifyOwner(ownerMsg);

    // Forward lead to best technician
    if (bestTech) {
      const techMsg =
        `🔔 *New Lead — ${lead.leadId}*\n\n` +
        `👤 Customer: ${lead.customerName}\n` +
        `📞 Phone: +${lead.customerPhone}\n` +
        `🔧 Service: *${lead.service.name}*\n` +
        `📍 Area: *${lead.area || 'Check with customer'}*\n` +
        `💬 Message: "${text.substring(0, 80)}"\n\n` +
        `✅ Reply *"${lead.leadId} assigned"* when you go\n` +
        `✅ Reply *"${lead.leadId} completed amount XXXX"* when done\n` +
        `✅ Reply *"${lead.leadId} commission paid"* after paying ₹100`;

      await sendToNumber(bestTech.phone, techMsg);
      await sheets.updateStatus(lead.leadId, 'ASSIGNED_PENDING', null, bestTech.phone);
    }

    console.log(`   [Lead] Created: ${lead.leadId} | Tech: ${bestTech?.name || 'None'}`);

  } else {
    // Non-lead customer message — send general reply
    await msg.reply(
      `🙏 *வணக்கம்! CallSevai-க்கு வரவேற்கிறோம்.*\n\n` +
      `எந்த service தேவை என்று தெளிவாக சொல்லுங்கள்.\n` +
      `உதாரணம்: "Electrician needed in Velachery"\n\n` +
      `📞 Direct: *+91 87783 73517*\n` +
      `🌐 *callsevai.com*`
    );
    await sheets.logMessage(sender, text, 'CUSTOMER_UNKNOWN');
  }
}

// ─── TECHNICIAN MESSAGE HANDLER ───────────────────────────────────────────────

async function handleTechnicianMessage(sender, text, msg) {
  await sheets.logMessage(sender, text, 'TECH_RAW');

  const statusResult = parseStatus(text);
  const mentionedId  = extractLeadId(text);
  const leadId       = mentionedId || techLastLead.get(sender);

  console.log(`   [TechParser] Status: ${statusResult.type} | LeadID: ${leadId || 'Not specified'}`);

  if (!leadId) {
    await msg.reply(`⚠️ Lead ID தெரியவில்லை. Please include Lead ID (e.g. CS100626-451) in your message.`);
    return;
  }

  // Update techLastLead mapping
  techLastLead.set(sender, leadId);

  // Find technician record
  const techPhone = sender.replace('@c.us', '').replace('@s.whatsapp.net', '');
  const tech      = techniciansDB.find(t => t.phone === techPhone);
  const techName  = tech?.name || 'Technician';

  switch (statusResult.type) {

    case 'ASSIGNED':
      await sheets.updateStatus(leadId, 'ASSIGNED', null, techPhone);
      await msg.reply(`✅ *${leadId}* — Assigned confirmed. Customer-ஐ contact பண்ணுங்கள்.`);
      await notifyOwner(`👷 *${techName}* assigned to *${leadId}*`);
      break;

    case 'COMPLETED': {
      const amount = statusResult.amount;
      await sheets.updateStatus(leadId, 'COMPLETED', amount, techPhone);

      // Create commission record
      const commRec = createCommissionRecord(leadId, tech?.id, techName, amount);
      await sheets.addCommission(commRec);

      // Alert owner about commission due
      await notifyOwner(formatCommissionAlert(leadId, techName, amount));
      await msg.reply(
        `✅ *Job Completed — ${leadId}*\n` +
        `💼 Amount: ₹${amount || 'Not specified'}\n` +
        `💰 Commission due: ₹100\n` +
        `📲 Please pay ₹100 commission to CallSevai GPay.`
      );
      break;
    }

    case 'COMMISSION_PAID':
      await sheets.markCommissionPaid(leadId);
      await msg.reply(formatPaidConfirmation(leadId, techName));
      await notifyOwner(`💰 Commission received from *${techName}* for *${leadId}*`);
      break;

    case 'FOLLOWUP':
      await sheets.updateStatus(leadId, 'FOLLOWUP', null, techPhone);
      await msg.reply(`📅 *${leadId}* — Followup noted. Try again in a few hours.`);
      break;

    case 'CANCELLED':
      await sheets.updateStatus(leadId, 'CANCELLED', null, techPhone);
      await msg.reply(`❌ *${leadId}* — Marked as Cancelled.`);
      await notifyOwner(`❌ *${leadId}* cancelled by *${techName}*`);
      break;

    default:
      await msg.reply(
        `ℹ️ *CallSevai Bot Commands:*\n\n` +
        `• *CS_______ assigned* — job எடுத்தேன்\n` +
        `• *CS_______ completed amount 2500* — job முடிந்தது\n` +
        `• *CS_______ commission paid* — ₹100 paid\n` +
        `• *CS_______ followup* — customer not reachable\n` +
        `• *CS_______ cancel* — job cancel\n\n` +
        `உங்கள் last lead ID: *${leadId}*`
      );
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function notifyOwner(message) {
  if (!OWNER_NUMBER) return;
  try {
    await client.sendMessage(OWNER_NUMBER, message);
  } catch (err) {
    console.error(`[Bot] Owner notify failed: ${err.message}`);
  }
}

async function sendToNumber(phone, message) {
  const chatId = phone.replace(/\D/g, '') + '@c.us';
  try {
    await client.sendMessage(chatId, message);
    console.log(`   [Bot] Sent to ${phone}`);
  } catch (err) {
    console.error(`[Bot] Send failed to ${phone}: ${err.message}`);
  }
}

function isActiveHours() {
  const hour = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false
  });
  const h = parseInt(hour);
  return h >= BOT_ACTIVE_FROM && h < BOT_ACTIVE_TO;
}

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down CallSevai bot...');
  await client.destroy();
  process.exit(0);
});

// ─── START ────────────────────────────────────────────────────────────────────

console.log('🚀 Starting CallSevai WhatsApp Bot...');
client.initialize();
