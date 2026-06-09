// lead-parser.js
// Parses incoming WhatsApp messages to detect service type, area, and lead details

const services = require('../rules/services.json').services;
const areas    = require('../rules/areas.json').areas;

/**
 * Detect which service is being requested
 * Returns { id, name } or null
 */
function detectService(text) {
  const lower = text.toLowerCase();
  for (const svc of services) {
    for (const kw of svc.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { id: svc.id, name: svc.name };
      }
    }
  }
  return null;
}

/**
 * Detect area/city from message
 * Returns area string or null
 */
function detectArea(text) {
  const lower = text.toLowerCase();
  for (const area of areas) {
    if (lower.includes(area.toLowerCase())) {
      return area;
    }
  }
  // Try "in <word>" pattern as fallback
  const inMatch = text.match(/\bin\s+([A-Za-z\s]{3,20})/i);
  if (inMatch) return inMatch[1].trim();
  return null;
}

/**
 * Extract customer name from message if present
 * Simple heuristic: "name: X" or "my name is X"
 */
function detectName(text) {
  const patterns = [
    /(?:name|my name is|i am|iam)[:\s]+([A-Za-z\s]{2,30})/i,
    /(?:பெயர்)[:\s]+([A-Za-z\u0B80-\u0BFF\s]{2,30})/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Main parse function
 * @param {string} senderPhone - WhatsApp number (e.g. "919876543210@c.us")
 * @param {string} message     - Raw message text
 * @returns {object} parsed lead object
 */
function parseLead(senderPhone, message) {
  const service  = detectService(message);
  const area     = detectArea(message);
  const name     = detectName(message);
  const phone    = senderPhone.replace('@c.us', '').replace('@s.whatsapp.net', '');
  const isLead   = !!(service);

  return {
    type: isLead ? 'LEAD' : 'UNKNOWN',
    service,
    area,
    customerName: name || 'Unknown',
    customerPhone: phone,
    rawMessage: message,
    timestamp: new Date().toISOString(),
    leadId: isLead ? generateLeadId() : null
  };
}

function generateLeadId() {
  const now = new Date();
  const d   = now.getDate().toString().padStart(2,'0');
  const m   = (now.getMonth()+1).toString().padStart(2,'0');
  const y   = now.getFullYear().toString().slice(-2);
  const r   = Math.floor(Math.random()*900)+100;
  return `CS${d}${m}${y}-${r}`;
}

module.exports = { parseLead, detectService, detectArea, detectName };
