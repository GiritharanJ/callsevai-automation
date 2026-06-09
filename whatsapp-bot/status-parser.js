// status-parser.js
// Parses technician messages to detect job status updates

const statusRules = require('../rules/status.json');

/**
 * Parse a message from a technician to determine what status update it represents
 * @param {string} message
 * @returns {object} { type, amount, raw }
 */
function parseStatus(message) {
  const lower = message.toLowerCase();

  // Check COMPLETED first (highest priority)
  if (matchesAny(lower, statusRules.completed_keywords)) {
    const amount = extractAmount(message);
    return {
      type: 'COMPLETED',
      amount: amount,
      raw: message,
      timestamp: new Date().toISOString()
    };
  }

  // Check COMMISSION PAID
  if (matchesAny(lower, statusRules.commission_paid_keywords)) {
    return {
      type: 'COMMISSION_PAID',
      amount: 100,
      raw: message,
      timestamp: new Date().toISOString()
    };
  }

  // Check COMMISSION PENDING
  if (matchesAny(lower, statusRules.commission_pending_keywords)) {
    return {
      type: 'COMMISSION_PENDING',
      raw: message,
      timestamp: new Date().toISOString()
    };
  }

  // Check ASSIGNED / ON THE WAY
  if (matchesAny(lower, statusRules.assign_keywords)) {
    return {
      type: 'ASSIGNED',
      raw: message,
      timestamp: new Date().toISOString()
    };
  }

  // Check FOLLOWUP
  if (matchesAny(lower, statusRules.followup_keywords)) {
    return {
      type: 'FOLLOWUP',
      raw: message,
      timestamp: new Date().toISOString()
    };
  }

  // Check CANCELLED
  if (matchesAny(lower, statusRules.cancel_keywords)) {
    return {
      type: 'CANCELLED',
      raw: message,
      timestamp: new Date().toISOString()
    };
  }

  return { type: 'UNKNOWN', raw: message, timestamp: new Date().toISOString() };
}

/**
 * Extract job amount from message
 * e.g. "completed amount 2500" → 2500
 */
function extractAmount(text) {
  const pattern = new RegExp(statusRules.amount_pattern, 'i');
  const match = text.match(pattern);
  if (match) {
    // Find the number group
    const num = text.match(/\d{3,6}/);
    if (num) return parseInt(num[0], 10);
  }
  return null;
}

function matchesAny(text, keywords) {
  return keywords.some(kw => text.includes(kw.toLowerCase()));
}

/**
 * Extract lead ID from message if technician quotes it
 * e.g. "CS100626-451 completed"
 */
function extractLeadId(text) {
  const match = text.match(/CS\d{6}-\d{3}/i);
  return match ? match[0].toUpperCase() : null;
}

module.exports = { parseStatus, extractAmount, extractLeadId };
