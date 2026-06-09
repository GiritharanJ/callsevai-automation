// commission-parser.js
// Tracks ₹100 commission per completed job

const COMMISSION_AMOUNT = 100;

/**
 * Create a commission record for a completed job
 */
function createCommissionRecord(leadId, technicianId, technicianName, jobAmount) {
  return {
    leadId,
    technicianId,
    technicianName,
    jobAmount: jobAmount || 0,
    commissionAmount: COMMISSION_AMOUNT,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    paidAt: null
  };
}

/**
 * Mark commission as paid
 */
function markPaid(commissionRecord) {
  return {
    ...commissionRecord,
    status: 'PAID',
    paidAt: new Date().toISOString()
  };
}

/**
 * Format commission summary message for owner WhatsApp
 */
function formatCommissionAlert(leadId, techName, jobAmount) {
  return (
    `💰 *Commission Due — ₹${COMMISSION_AMOUNT}*\n` +
    `🆔 Lead: ${leadId}\n` +
    `👷 Technician: ${techName}\n` +
    `💼 Job Amount: ₹${jobAmount || 'Not reported'}\n` +
    `📅 Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
    `Reply *"${leadId} commission paid"* once collected.`
  );
}

/**
 * Format commission paid confirmation
 */
function formatPaidConfirmation(leadId, techName) {
  return (
    `✅ *Commission Received*\n` +
    `🆔 Lead: ${leadId}\n` +
    `👷 ${techName}\n` +
    `💵 ₹${COMMISSION_AMOUNT} — PAID\n` +
    `📅 ${new Date().toLocaleDateString('en-IN')}`
  );
}

module.exports = {
  COMMISSION_AMOUNT,
  createCommissionRecord,
  markPaid,
  formatCommissionAlert,
  formatPaidConfirmation
};
