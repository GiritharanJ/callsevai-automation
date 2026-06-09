// sheet-helper.js
// Sends CRM data to Google Sheets via Apps Script Web App URL

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

/**
 * Generic POST to Google Apps Script
 */
async function postToSheet(payload) {
  if (!APPS_SCRIPT_URL) {
    console.error('[SheetHelper] APPS_SCRIPT_URL not set in .env');
    return { success: false, error: 'No URL configured' };
  }

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const text = await res.text();
    console.log(`[SheetHelper] Response: ${text}`);
    return { success: true, response: text };
  } catch (err) {
    console.error(`[SheetHelper] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Add new lead to Leads sheet
 */
async function addLead(lead, technician) {
  return postToSheet({
    action: 'ADD_LEAD',
    leadId:          lead.leadId,
    customerName:    lead.customerName,
    customerPhone:   lead.customerPhone,
    service:         lead.service?.name || '',
    serviceId:       lead.service?.id || '',
    area:            lead.area || '',
    rawMessage:      lead.rawMessage,
    technicianId:    technician?.id || '',
    technicianName:  technician?.name || '',
    technicianPhone: technician?.phone || '',
    status:          'NEW',
    timestamp:       lead.timestamp
  });
}

/**
 * Update job status in Leads sheet
 */
async function updateStatus(leadId, statusType, amount, techPhone) {
  return postToSheet({
    action:      'UPDATE_STATUS',
    leadId,
    status:      statusType,
    jobAmount:   amount || '',
    techPhone:   techPhone || '',
    updatedAt:   new Date().toISOString()
  });
}

/**
 * Add commission record
 */
async function addCommission(commissionRecord) {
  return postToSheet({
    action: 'ADD_COMMISSION',
    ...commissionRecord
  });
}

/**
 * Update commission as paid
 */
async function markCommissionPaid(leadId) {
  return postToSheet({
    action:   'COMMISSION_PAID',
    leadId,
    paidAt:   new Date().toISOString()
  });
}

/**
 * Log raw message for audit trail
 */
async function logMessage(senderPhone, message, parsedType) {
  return postToSheet({
    action:       'LOG_MESSAGE',
    senderPhone,
    message,
    parsedType,
    timestamp:    new Date().toISOString()
  });
}

module.exports = { addLead, updateStatus, addCommission, markCommissionPaid, logMessage };
