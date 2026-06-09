// apps-script.gs
// Deploy this as a Google Apps Script Web App (Execute as: Me, Access: Anyone)
// Paste the Web App URL into your .env as APPS_SCRIPT_URL

const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE'; // Replace after creating sheet

// Sheet names — must match exactly
const SHEETS = {
  LEADS:       'Leads',
  CUSTOMERS:   'Customers',
  TECHNICIANS: 'Technicians',
  FOLLOWUPS:   'Followups',
  COMPLETED:   'Completed Jobs',
  COMMISSION:  'Commission Tracking',
  MESSAGES:    'Message Log'
};

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch (action) {
      case 'ADD_LEAD':         result = addLead(data);            break;
      case 'UPDATE_STATUS':    result = updateStatus(data);       break;
      case 'ADD_COMMISSION':   result = addCommission(data);      break;
      case 'COMMISSION_PAID':  result = markCommissionPaid(data); break;
      case 'LOG_MESSAGE':      result = logMessage(data);         break;
      default:
        result = { status: 'ERROR', message: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ERROR', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const config = {
    [SHEETS.LEADS]: [
      'Lead ID','Customer Name','Customer Phone','Service','Service ID',
      'Area','Raw Message','Technician ID','Technician Name','Technician Phone',
      'Status','Timestamp','Updated At'
    ],
    [SHEETS.CUSTOMERS]: [
      'Phone','Name','First Contact','Last Contact','Total Leads','Services Used'
    ],
    [SHEETS.TECHNICIANS]: [
      'Tech ID','Name','Phone','Services','Areas','Total Jobs','Active'
    ],
    [SHEETS.FOLLOWUPS]: [
      'Lead ID','Customer Phone','Service','Area','Reason','Scheduled At','Done'
    ],
    [SHEETS.COMPLETED]: [
      'Lead ID','Customer Name','Customer Phone','Service','Area',
      'Technician','Job Amount','Completed At'
    ],
    [SHEETS.COMMISSION]: [
      'Lead ID','Technician ID','Technician Name','Job Amount',
      'Commission Amount','Status','Created At','Paid At'
    ],
    [SHEETS.MESSAGES]: [
      'Sender Phone','Message','Parsed Type','Timestamp'
    ]
  };

  for (const [name, headers] of Object.entries(config)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold')
           .setBackground('#1D9E75').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  }

  Logger.log('✅ All sheets created successfully');
}

// ─── ACTION HANDLERS ─────────────────────────────────────────────────────────

function addLead(data) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.LEADS);

  // Check duplicate lead ID
  const existing = findRowByLeadId(sheet, data.leadId);
  if (existing > 0) {
    return { status: 'DUPLICATE', message: 'Lead ' + data.leadId + ' already exists' };
  }

  sheet.appendRow([
    data.leadId, data.customerName, data.customerPhone,
    data.service, data.serviceId, data.area, data.rawMessage,
    data.technicianId, data.technicianName, data.technicianPhone,
    'NEW', data.timestamp, ''
  ]);

  // Also update Customers sheet
  upsertCustomer(ss, data.customerPhone, data.customerName, data.service);

  return { status: 'OK', leadId: data.leadId };
}

function updateStatus(data) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.LEADS);
  const row   = findRowByLeadId(sheet, data.leadId);

  if (row < 2) return { status: 'NOT_FOUND', leadId: data.leadId };

  // Col 11 = Status, Col 13 = Updated At
  sheet.getRange(row, 11).setValue(data.status);
  sheet.getRange(row, 13).setValue(data.updatedAt);

  // If completed, add to Completed Jobs sheet
  if (data.status === 'COMPLETED') {
    const leadData = sheet.getRange(row, 1, 1, 13).getValues()[0];
    const completedSheet = ss.getSheetByName(SHEETS.COMPLETED);
    completedSheet.appendRow([
      leadData[0],  // Lead ID
      leadData[1],  // Customer Name
      leadData[2],  // Customer Phone
      leadData[3],  // Service
      leadData[5],  // Area
      leadData[8],  // Technician Name
      data.jobAmount,
      data.updatedAt
    ]);
  }

  // If followup, add to Followups sheet
  if (data.status === 'FOLLOWUP') {
    const leadData = sheet.getRange(row, 1, 1, 13).getValues()[0];
    const fuSheet = ss.getSheetByName(SHEETS.FOLLOWUPS);
    fuSheet.appendRow([
      leadData[0], leadData[2], leadData[3], leadData[5],
      data.reason || 'No reason given',
      data.updatedAt, 'NO'
    ]);
  }

  return { status: 'OK', updated: data.leadId, newStatus: data.status };
}

function addCommission(data) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                              .getSheetByName(SHEETS.COMMISSION);
  sheet.appendRow([
    data.leadId, data.technicianId, data.technicianName,
    data.jobAmount, data.commissionAmount || 100,
    'PENDING', data.createdAt, ''
  ]);
  return { status: 'OK', commission: data.leadId };
}

function markCommissionPaid(data) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                              .getSheetByName(SHEETS.COMMISSION);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.leadId) {
      sheet.getRange(i + 1, 6).setValue('PAID');
      sheet.getRange(i + 1, 8).setValue(data.paidAt);
      return { status: 'OK', paid: data.leadId };
    }
  }
  return { status: 'NOT_FOUND', leadId: data.leadId };
}

function logMessage(data) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                              .getSheetByName(SHEETS.MESSAGES);
  sheet.appendRow([data.senderPhone, data.message, data.parsedType, data.timestamp]);
  return { status: 'OK' };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function findRowByLeadId(sheet, leadId) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === leadId) return i + 1;
  }
  return -1;
}

function upsertCustomer(ss, phone, name, service) {
  const sheet  = ss.getSheetByName(SHEETS.CUSTOMERS);
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === phone) {
      // Update existing: increment total leads
      sheet.getRange(i + 1, 3).setValue(now); // Last Contact
      const count = (values[i][4] || 0) + 1;
      sheet.getRange(i + 1, 5).setValue(count);
      const svcs = values[i][5] ? values[i][5] + ', ' + service : service;
      sheet.getRange(i + 1, 6).setValue(svcs);
      return;
    }
  }

  // New customer
  sheet.appendRow([phone, name, now, now, 1, service]);
}

// ─── DASHBOARD SUMMARY (call from a trigger or manually) ─────────────────────

function getDashboardSummary() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const leads  = ss.getSheetByName(SHEETS.LEADS).getDataRange().getValues();
  const comm   = ss.getSheetByName(SHEETS.COMMISSION).getDataRange().getValues();

  const summary = {
    totalLeads:        leads.length - 1,
    newLeads:          0,
    assigned:          0,
    completed:         0,
    cancelled:         0,
    followups:         0,
    commissionPending: 0,
    commissionPaid:    0
  };

  for (let i = 1; i < leads.length; i++) {
    const status = leads[i][10];
    if (status === 'NEW')       summary.newLeads++;
    if (status === 'ASSIGNED')  summary.assigned++;
    if (status === 'COMPLETED') summary.completed++;
    if (status === 'CANCELLED') summary.cancelled++;
    if (status === 'FOLLOWUP')  summary.followups++;
  }

  for (let i = 1; i < comm.length; i++) {
    if (comm[i][5] === 'PENDING') summary.commissionPending += (comm[i][4] || 100);
    if (comm[i][5] === 'PAID')    summary.commissionPaid    += (comm[i][4] || 100);
  }

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}
