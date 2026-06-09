// technician-parser.js
// Finds the best available technician for a given service + area

const technicians = require('../rules/technicians.json').technicians;

/**
 * Find matching technicians for a service and area
 * @param {string} serviceName  - e.g. "Electrician"
 * @param {string} area         - e.g. "Velachery"
 * @returns {Array} list of matching technician objects (sorted by exact area match)
 */
function findTechnicians(serviceName, area) {
  if (!serviceName) return [];

  const matched = technicians.filter(tech => {
    if (!tech.active) return false;
    const servicesMatch = tech.services.some(
      s => s.toLowerCase() === serviceName.toLowerCase()
    );
    return servicesMatch;
  });

  if (!area) return matched;

  // Sort: exact area match first, then partial match
  const areaLower = area.toLowerCase();
  return matched.sort((a, b) => {
    const aExact = a.areas.some(x => x.toLowerCase() === areaLower) ? 0 : 1;
    const bExact = b.areas.some(x => x.toLowerCase() === areaLower) ? 0 : 1;
    return aExact - bExact;
  });
}

/**
 * Get a single best technician
 */
function getBestTechnician(serviceName, area) {
  const list = findTechnicians(serviceName, area);
  return list.length > 0 ? list[0] : null;
}

/**
 * Format technician list as WhatsApp message
 */
function formatTechnicianMessage(technicians, leadId, serviceName, area) {
  if (!technicians || technicians.length === 0) {
    return `⚠️ No technician found for *${serviceName}* in *${area || 'this area'}*.\nPlease assign manually.`;
  }
  let msg = `🔧 *Technicians available for Lead ${leadId}*\n`;
  msg    += `📌 Service: *${serviceName}*\n`;
  msg    += `📍 Area: *${area || 'Not specified'}*\n\n`;
  technicians.slice(0, 3).forEach((t, i) => {
    msg += `${i+1}. *${t.name}*\n`;
    msg += `   📞 +${t.phone}\n`;
    msg += `   🏙️ ${t.areas.slice(0,4).join(', ')}\n\n`;
  });
  return msg.trim();
}

module.exports = { findTechnicians, getBestTechnician, formatTechnicianMessage };
