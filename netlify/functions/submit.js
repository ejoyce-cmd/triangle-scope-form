const https = require('https');

const MONDAY_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY2NzU3OTQwOSwiYWFpIjoxMSwidWlkIjozNzg0OTk1OSwiaWFkIjoiMjAyNi0wNi0wNVQxODoyMDoxOS42ODVaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MTM0NzQ4OTYsInJnbiI6InVzZTEifQ.Q6hcQ7t8Jfi8tqgW_RzIlnFb1HbdcbIK1wQV9y0BHLE';
const MONDAY_BOARD = 18417004194;
const CC_TOKEN = 'Jc3Lv6lQBoSSCOK1uL17qwDDIAe-lX99LMkW_uwc5cU';

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve) => {
    const isBuffer = Buffer.isBuffer(body);
    const contentLength = isBuffer ? body.length : Buffer.byteLength(body);
    const options = {
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': contentLength }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, data: e.message }));
    req.write(body);
    req.end();
  });
}

function mondayRequest(query) {
  return httpsPost('api.monday.com', '/v2',
    { 'Content-Type': 'application/json', 'Authorization': MONDAY_KEY },
    JSON.stringify({ query })
  ).then(r => r.data);
}

// Pure JS minimal PDF generator - no dependencies needed
function generatePDF(address, tech, sections) {
  const lines = [];
  let grandTotal = 0;

  // PDF header
  lines.push('%PDF-1.4');

  const objects = [];
  let objNum = 1;

  function addObj(content) {
    const num = objNum++;
    objects.push({ num, content });
    return num;
  }

  // Build content stream
  const contentLines = [];

  // Helper to escape PDF string
  function esc(s) {
    return String(s || '').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }

  // Header
  contentLines.push('BT');
  contentLines.push('/F2 18 Tf');
  contentLines.push('0.106 0.227 0.420 rg');
  contentLines.push('50 780 Td');
  contentLines.push('(TRIANGLE RENOVATIONS) Tj');
  contentLines.push('/F1 11 Tf');
  contentLines.push('0 0 0 rg');
  contentLines.push('0 -20 Td');
  contentLines.push('(Property Scope of Work) Tj');
  contentLines.push('ET');

  // Navy header bar
  contentLines.push('0.106 0.227 0.420 rg');
  contentLines.push('0 750 612 42 re f');
  contentLines.push('1 1 1 rg');
  contentLines.push('BT /F2 14 Tf 20 760 Td (TRIANGLE RENOVATIONS - SCOPE OF WORK) Tj ET');

  // Property info
  contentLines.push('0.95 0.95 0.95 rg');
  contentLines.push('20 695 572 50 re f');
  contentLines.push('0 0 0 rg');
  contentLines.push('BT');
  contentLines.push('/F2 10 Tf');
  contentLines.push('30 730 Td (Property:) Tj');
  contentLines.push('/F1 10 Tf');
  contentLines.push('100 730 Td (' + esc(address) + ') Tj');
  contentLines.push('/F2 10 Tf');
  contentLines.push('30 715 Td (Submitted By:) Tj');
  contentLines.push('/F1 10 Tf');
  contentLines.push('100 715 Td (' + esc(tech) + ') Tj');
  contentLines.push('/F2 10 Tf');
  contentLines.push('30 700 Td (Date:) Tj');
  contentLines.push('/F1 10 Tf');
  contentLines.push('100 700 Td (' + esc(new Date().toLocaleDateString()) + ') Tj');
  contentLines.push('ET');

  let yPos = 680;
  const pages = [contentLines.join('\n')];
  let currentPageLines = [];

  function newPage() {
    pages.push(currentPageLines.join('\n'));
    currentPageLines = [];
    yPos = 750;
  }

  function checkY(needed) {
    if (yPos < needed) newPage();
  }

  sections.forEach(function(section) {
    let allItems = [];
    if (section.type === 'multiroom') {
      section.rooms.forEach(function(room) {
        room.items.forEach(function(item) {
          if (item.label) allItems.push({ ...item, roomName: room.name });
        });
      });
    } else {
      section.items.forEach(function(item) {
        if (item.label) allItems.push({ ...item, roomName: null });
      });
    }
    if (allItems.length === 0) return;

    checkY(80);
    // Section header
    currentPageLines.push('0.106 0.227 0.420 rg');
    currentPageLines.push('20 ' + (yPos - 18) + ' 572 20 re f');
    currentPageLines.push('1 1 1 rg');
    currentPageLines.push('BT /F2 10 Tf 28 ' + (yPos - 12) + ' Td (' + esc(section.title) + ') Tj ET');
    currentPageLines.push('0 0 0 rg');
    yPos -= 28;

    let currentRoom = null;
    allItems.forEach(function(item) {
      checkY(60);
      const cost = parseFloat(item.cost) || 0;
      if (cost > 0) grandTotal += cost;

      if (item.roomName && item.roomName !== currentRoom) {
        currentRoom = item.roomName;
        currentPageLines.push('0.878 0.906 0.957 rg');
        currentPageLines.push('20 ' + (yPos - 16) + ' 572 18 re f');
        currentPageLines.push('0.106 0.227 0.420 rg');
        currentPageLines.push('BT /F2 9 Tf 28 ' + (yPos - 10) + ' Td (' + esc(item.roomName) + ') Tj ET');
        currentPageLines.push('0 0 0 rg');
        yPos -= 24;
        checkY(50);
      }

      // Alternating row bg
      currentPageLines.push('0.98 0.98 0.98 rg');
      currentPageLines.push('20 ' + (yPos - 16) + ' 572 18 re f');
      currentPageLines.push('0 0 0 rg');

      // Item label
      const labelTrunc = esc(item.label.substring(0, 55));
      currentPageLines.push('BT /F2 8 Tf 28 ' + (yPos - 10) + ' Td (' + labelTrunc + ') Tj ET');

      // Condition
      const condColor = item.condition === 'Good' ? '0.15 0.6 0.15 rg' : item.condition === 'Poor' ? '0.753 0.224 0.169 rg' : '0.85 0.6 0.1 rg';
      currentPageLines.push(condColor);
      currentPageLines.push('370 ' + (yPos - 15) + ' 55 14 re f');
      currentPageLines.push('1 1 1 rg');
      currentPageLines.push('BT /F2 7 Tf 373 ' + (yPos - 9) + ' Td (' + esc(item.condition || 'N/A') + ') Tj ET');

      // Priority
      const priColor = item.priority === 'Must Do' ? '0.753 0.224 0.169 rg' : item.priority === 'High' ? '0.85 0.6 0.1 rg' : '0.5 0.5 0.5 rg';
      currentPageLines.push(priColor);
      currentPageLines.push('430 ' + (yPos - 15) + ' 55 14 re f');
      currentPageLines.push('1 1 1 rg');
      currentPageLines.push('BT /F2 7 Tf 433 ' + (yPos - 9) + ' Td (' + esc(item.priority || '-') + ') Tj ET');

      // Cost
      currentPageLines.push('0 0 0 rg');
      if (cost > 0) {
        currentPageLines.push('BT /F2 8 Tf 492 ' + (yPos - 10) + ' Td ($' + esc(cost.toFixed(2)) + ') Tj ET');
      }

      yPos -= 20;

      if (item.comments) {
        checkY(20);
        currentPageLines.push('BT /F1 7 Tf 36 ' + (yPos - 8) + ' Td (Notes: ' + esc(item.comments.substring(0, 80)) + ') Tj ET');
        yPos -= 13;
      }

      if (item.photos && item.photos.length > 0) {
        checkY(16);
        currentPageLines.push('0.1 0.5 0.8 rg');
        currentPageLines.push('BT /F1 7 Tf 36 ' + (yPos - 8) + ' Td (' + item.photos.length + ' photo(s) captured) Tj ET');
        currentPageLines.push('0 0 0 rg');
        yPos -= 13;
      }
    });
    yPos -= 8;
  });

  // Total footer on last page
  currentPageLines.push('0.106 0.227 0.420 rg');
  currentPageLines.push('20 ' + (yPos - 30) + ' 572 32 re f');
  currentPageLines.push('1 1 1 rg');
  currentPageLines.push('BT /F2 12 Tf 28 ' + (yPos - 18) + ' Td (TOTAL FIELD COST:) Tj ET');
  currentPageLines.push('BT /F2 14 Tf 420 ' + (yPos - 18) + ' Td ($' + grandTotal.toFixed(2) + ') Tj ET');
  pages.push(currentPageLines.join('\n'));

  // Now build the actual PDF binary
  const pageCount = pages.length;
  let pdf = '%PDF-1.4\n';
  const offsets = [];

  // Font objects
  const f1Num = objNum++;
  offsets[f1Num] = pdf.length;
  pdf += f1Num + ' 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n';

  const f2Num = objNum++;
  offsets[f2Num] = pdf.length;
  pdf += f2Num + ' 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>\nendobj\n';

  const fontDictNum = objNum++;
  offsets[fontDictNum] = pdf.length;
  pdf += fontDictNum + ' 0 obj\n<</F1 ' + f1Num + ' 0 R /F2 ' + f2Num + ' 0 R>>\nendobj\n';

  // Pages
  const pageNums = [];
  const contentNums = [];

  pages.forEach(function(pageContent, idx) {
    const streamContent = pageContent;
    const streamLen = Buffer.byteLength(streamContent);
    const cNum = objNum++;
    offsets[cNum] = pdf.length;
    pdf += cNum + ' 0 obj\n<</Length ' + streamLen + '>>\nstream\n' + streamContent + '\nendstream\nendobj\n';
    contentNums.push(cNum);

    const pNum = objNum++;
    pageNums.push(pNum);
    // page object added after pages dict
  });

  const pagesDictNum = objNum++;

  pageNums.forEach(function(pNum, idx) {
    offsets[pNum] = pdf.length;
    pdf += pNum + ' 0 obj\n<</Type /Page /Parent ' + pagesDictNum + ' 0 R /MediaBox [0 0 612 792] /Contents ' + contentNums[idx] + ' 0 R /Resources <</Font ' + fontDictNum + ' 0 R>>>>\nendobj\n';
  });

  offsets[pagesDictNum] = pdf.length;
  pdf += pagesDictNum + ' 0 obj\n<</Type /Pages /Kids [' + pageNums.map(n => n + ' 0 R').join(' ') + '] /Count ' + pageNums.length + '>>\nendobj\n';

  const catalogNum = objNum++;
  offsets[catalogNum] = pdf.length;
  pdf += catalogNum + ' 0 obj\n<</Type /Catalog /Pages ' + pagesDictNum + ' 0 R>>\nendobj\n';

  const xrefOffset = pdf.length;
  const totalObjs = objNum;
  pdf += 'xref\n0 ' + totalObjs + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < totalObjs; i++) {
    pdf += (offsets[i] ? String(offsets[i]).padStart(10, '0') : '0000000000') + ' 00000 n \n';
  }
  pdf += 'trailer\n<</Size ' + totalObjs + ' /Root ' + catalogNum + ' 0 R>>\nstartxref\n' + xrefOffset + '\n%%EOF';

  return Buffer.from(pdf);
}

async function uploadPDFToMonday(itemId, pdfBuffer, filename) {
  try {
    const boundary = '----MondayFile' + Date.now();
    const query = 'mutation ($file: File!) { add_file_to_column(item_id: ' + itemId + ', column_id: "generated_report", file: $file) { id } }';
    const headerPart = '--' + boundary + '\r\nContent-Disposition: form-data; name="query"\r\n\r\n' + query + '\r\n';
    const filePart = '--' + boundary + '\r\nContent-Disposition: form-data; name="variables[file]"; filename="' + filename + '"\r\nContent-Type: application/pdf\r\n\r\n';
    const footer = '\r\n--' + boundary + '--\r\n';
    const body = Buffer.concat([Buffer.from(headerPart + filePart), pdfBuffer, Buffer.from(footer)]);

    return httpsPost('api.monday.com', '/v2/file',
      { 'Authorization': MONDAY_KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      body
    );
  } catch(e) { return { status: 0, data: e.message }; }
}

async function uploadPhotoToCC(projectId, photoData, photoName, tag) {
  try {
    const base64Data = photoData.split(',')[1];
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const boundary = '----CCUpload' + Date.now() + Math.random().toString(36).substr(2, 5);
    const part1 = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="photo[image]"; filename="' + photoName + '"\r\nContent-Type: image/jpeg\r\n\r\n');
    const part2 = Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="photo[label]"\r\n\r\n' + tag + '\r\n--' + boundary + '--\r\n');
    const body = Buffer.concat([part1, imgBuffer, part2]);

    return httpsPost('api.companycam.com', '/v2/projects/' + projectId + '/photos',
      { 'Authorization': 'Bearer ' + CC_TOKEN, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      body
    );
  } catch(e) { return { status: 0 }; }
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const payload = JSON.parse(event.body);
    const { address, tech, reportText, grandTotal, sections } = payload;
    const results = { monday: false, pdf: false, companycam: false, photos: 0, errors: [] };

    // 1. Get Monday column IDs
    const boardData = await mondayRequest(`{ boards(ids: [${MONDAY_BOARD}]) { columns { id title type } } }`);
    const cols = (boardData.data && boardData.data.boards && boardData.data.boards[0].columns) || [];
    const colMap = {};
    cols.forEach(col => {
      const t = col.title.toLowerCase();
      if (t.includes('address')) colMap.address = col.id;
      else if (t.includes('submitted by')) colMap.submittedBy = col.id;
      else if (t.includes('date')) colMap.date = col.id;
      else if (t.includes('cost')) colMap.cost = col.id;
      else if (t.includes('status')) colMap.status = col.id;
    });

    // 2. Create Monday item
    const today = new Date().toISOString().split('T')[0];
    const colVals = {};
    if (colMap.address) colVals[colMap.address] = address;
    if (colMap.submittedBy) colVals[colMap.submittedBy] = tech;
    if (colMap.date) colVals[colMap.date] = { date: today };
    if (colMap.cost) colVals[colMap.cost] = grandTotal;
    if (colMap.status) colVals[colMap.status] = { label: 'Submitted' };

    const cleanAddr = address.replace(/['"\\]/g, ' ');
    const createRes = await mondayRequest(
      `mutation { create_item(board_id: ${MONDAY_BOARD}, item_name: "${cleanAddr}", column_values: ${JSON.stringify(JSON.stringify(colVals))}) { id } }`
    );
    const itemId = createRes.data && createRes.data.create_item && createRes.data.create_item.id;

    if (itemId) {
      results.monday = true;
      // Post report as thread update
      const safeReport = reportText.substring(0, 5000).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n');
      await mondayRequest(`mutation { create_update(item_id: ${itemId}, body: "${safeReport}") { id } }`);

      // 3. Generate and attach PDF
      try {
        const pdfBuffer = generatePDF(address, tech, sections);
        const filename = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40) + '_Scope.pdf';
        const pdfRes = await uploadPDFToMonday(itemId, pdfBuffer, filename);
        if (pdfRes.status === 200 || (pdfRes.data && pdfRes.data.data)) {
          results.pdf = true;
        } else {
          results.errors.push('PDF upload: ' + JSON.stringify(pdfRes.data).substring(0, 100));
        }
      } catch(e) {
        results.errors.push('PDF error: ' + e.message);
      }
    }

    // 4. CompanyCam project + photos
    try {
      const ccCreateRes = await httpsPost('api.companycam.com', '/v2/projects',
        { 'Authorization': 'Bearer ' + CC_TOKEN, 'Content-Type': 'application/json' },
        JSON.stringify({ project: { name: address, status: 'active' } })
      );

      const projectId = ccCreateRes.data && ccCreateRes.data.id;
      if (projectId) {
        results.companycam = true;

        const allPhotos = [];
        if (sections) {
          sections.forEach(section => {
            if (section.type === 'multiroom') {
              section.rooms.forEach(room => {
                room.items.forEach(item => {
                  (item.photos || []).forEach(photo => {
                    allPhotos.push({ data: photo.data, name: photo.name || 'photo.jpg', tag: section.title + ' – ' + room.name + ' – ' + item.label });
                  });
                });
              });
            } else {
              section.items.forEach(item => {
                (item.photos || []).forEach(photo => {
                  allPhotos.push({ data: photo.data, name: photo.name || 'photo.jpg', tag: section.title + ' – ' + item.label });
                });
              });
            }
          });
        }

        for (const photo of allPhotos) {
          const r = await uploadPhotoToCC(projectId, photo.data, photo.name, photo.tag);
          if (r.status === 200 || r.status === 201) results.photos++;
          else results.errors.push('Photo upload status: ' + r.status);
        }
      } else {
        results.errors.push('CC project creation failed: ' + JSON.stringify(ccCreateRes.data).substring(0, 100));
      }
    } catch(e) {
      results.errors.push('CC error: ' + e.message);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, results }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
