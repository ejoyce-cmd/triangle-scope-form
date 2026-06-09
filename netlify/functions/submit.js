const https = require('https');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const MONDAY_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY2NzU3OTQwOSwiYWFpIjoxMSwidWlkIjozNzg0OTk1OSwiaWFkIjoiMjAyNi0wNi0wNVQxODoyMDoxOS42ODVaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MTM0NzQ4OTYsInJnbiI6InVzZTEifQ.Q6hcQ7t8Jfi8tqgW_RzIlnFb1HbdcbIK1wQV9y0BHLE';
const MONDAY_BOARD = 18417004194;
const CC_TOKEN = 'Jc3Lv6lQBoSSCOK1uL17qwDDIAe-lX99LMkW_uwc5cU';

function mondayRequest(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generatePDF(address, tech, sections) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const navy = rgb(0.106, 0.227, 0.420);
  const red = rgb(0.753, 0.224, 0.169);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.5, 0.5, 0.5);
  const white = rgb(1, 1, 1);
  const lightGray = rgb(0.95, 0.95, 0.95);

  let page = pdfDoc.addPage([612, 792]);
  let { width, height } = page.getSize();
  let y = height - 40;

  function checkPage(needed = 60) {
    if (y < needed) {
      page = pdfDoc.addPage([612, 792]);
      y = height - 40;
    }
  }

  // Header background
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: navy });
  page.drawText('TRIANGLE RENOVATIONS', { x: 20, y: height - 35, size: 20, font: fontBold, color: white });
  page.drawText('Property Scope of Work', { x: 20, y: height - 55, size: 11, font, color: white });
  page.drawText(new Date().toLocaleDateString(), { x: width - 120, y: height - 55, size: 10, font, color: white });

  y = height - 100;

  // Property info box
  page.drawRectangle({ x: 20, y: y - 50, width: width - 40, height: 55, color: lightGray });
  page.drawText('Property:', { x: 30, y: y - 15, size: 10, font: fontBold, color: navy });
  page.drawText(address, { x: 100, y: y - 15, size: 10, font, color: black });
  page.drawText('Submitted By:', { x: 30, y: y - 35, size: 10, font: fontBold, color: navy });
  page.drawText(tech, { x: 100, y: y - 35, size: 10, font, color: black });
  y -= 70;

  let grandTotal = 0;

  sections.forEach(function(section) {
    // Get all items for this section
    let allItems = [];
    if (section.type === 'multiroom') {
      section.rooms.forEach(function(room) {
        room.items.forEach(function(item) {
          if (item.label) allItems.push({ ...item, roomName: room.name, sectionTitle: section.title });
        });
      });
    } else {
      section.items.forEach(function(item) {
        if (item.label) allItems.push({ ...item, roomName: null, sectionTitle: section.title });
      });
    }
    if (allItems.length === 0) return;

    checkPage(80);

    // Section header
    page.drawRectangle({ x: 20, y: y - 22, width: width - 40, height: 24, color: navy });
    page.drawText(section.title, { x: 28, y: y - 15, size: 11, font: fontBold, color: white });
    y -= 32;

    let currentRoom = null;
    allItems.forEach(function(item) {
      checkPage(70);

      // Room divider for multi-room
      if (item.roomName && item.roomName !== currentRoom) {
        currentRoom = item.roomName;
        page.drawRectangle({ x: 20, y: y - 18, width: width - 40, height: 20, color: rgb(0.878, 0.906, 0.957) });
        page.drawText(item.roomName, { x: 28, y: y - 12, size: 9, font: fontBold, color: navy });
        y -= 26;
        checkPage(60);
      }

      // Item row
      const cost = parseFloat(item.cost) || 0;
      if (cost > 0) grandTotal += cost;

      // Item label
      page.drawText('• ' + item.label, { x: 28, y: y - 12, size: 9, font: fontBold, color: black, maxWidth: 360 });

      // Condition badge
      const condColor = item.condition === 'Good' ? rgb(0.15, 0.6, 0.15) : item.condition === 'Poor' ? red : item.condition === 'Fair' ? rgb(0.85, 0.6, 0.1) : gray;
      page.drawRectangle({ x: 390, y: y - 16, width: 50, height: 14, color: condColor });
      page.drawText(item.condition || '-', { x: 393, y: y - 11, size: 7, font: fontBold, color: white });

      // Priority badge
      const priColor = item.priority === 'Must Do' ? red : item.priority === 'High' ? rgb(0.85, 0.6, 0.1) : gray;
      page.drawRectangle({ x: 446, y: y - 16, width: 50, height: 14, color: priColor });
      page.drawText(item.priority || '-', { x: 449, y: y - 11, size: 7, font: fontBold, color: white });

      // Cost
      if (cost > 0) {
        page.drawText('$' + cost.toFixed(2), { x: 502, y: y - 12, size: 9, font: fontBold, color: navy });
      }

      y -= 18;

      // Comments
      if (item.comments) {
        checkPage(20);
        page.drawText('  Notes: ' + item.comments, { x: 36, y: y - 8, size: 8, font, color: gray, maxWidth: 500 });
        y -= 14;
      }

      // Photos count
      if (item.photos && item.photos.length > 0) {
        checkPage(16);
        page.drawText('  📷 ' + item.photos.length + ' photo(s) captured', { x: 36, y: y - 8, size: 8, font, color: rgb(0.1, 0.5, 0.8) });
        y -= 14;
      }

      y -= 4;
    });

    y -= 8;
  });

  // Total footer
  checkPage(50);
  y -= 10;
  page.drawRectangle({ x: 20, y: y - 30, width: width - 40, height: 32, color: navy });
  page.drawText('TOTAL FIELD COST:', { x: 28, y: y - 18, size: 12, font: fontBold, color: white });
  page.drawText('$' + grandTotal.toFixed(2), { x: 420, y: y - 18, size: 14, font: fontBold, color: white });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

async function uploadPDFToMonday(itemId, pdfBuffer, filename) {
  try {
    const boundary = '----MondayBoundary' + Date.now();
    const query = 'mutation add_file($file: File!) { add_file_to_column(item_id: ' + itemId + ', column_id: "files", file: $file) { id } }';
    
    const formParts = [
      '--' + boundary + '\r\n',
      'Content-Disposition: form-data; name="query"\r\n\r\n',
      query + '\r\n',
      '--' + boundary + '\r\n',
      'Content-Disposition: form-data; name="variables[file]"; filename="' + filename + '"\r\n',
      'Content-Type: application/pdf\r\n\r\n'
    ];
    
    const formHeader = Buffer.from(formParts.join(''));
    const formFooter = Buffer.from('\r\n--' + boundary + '--\r\n');
    const formBody = Buffer.concat([formHeader, pdfBuffer, formFooter]);

    return new Promise((resolve) => {
      const options = {
        hostname: 'api.monday.com',
        path: '/v2/file',
        method: 'POST',
        headers: {
          'Authorization': MONDAY_KEY,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': formBody.length
        }
      };
      const req = https.request(options, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
      });
      req.on('error', () => resolve({}));
      req.write(formBody); req.end();
    });
  } catch(e) { return {}; }
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
    const results = { monday: false, pdf: false, companycam: false, photos: 0 };

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
      else if (t.includes('report')) colMap.report = col.id;
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

      // Post report as update
      const safeReport = reportText.substring(0, 5000).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n');
      await mondayRequest(`mutation { create_update(item_id: ${itemId}, body: "${safeReport}") { id } }`);

      // 3. Generate and attach PDF
      try {
        const pdfBuffer = await generatePDF(address, tech, sections);
        const filename = address.replace(/[^a-zA-Z0-9]/g, '_') + '_Scope.pdf';
        await uploadPDFToMonday(itemId, pdfBuffer, filename);
        results.pdf = true;
      } catch(e) { console.log('PDF error:', e.message); }
    }

    // 4. CompanyCam — create project and upload photos
    try {
      const ccBody = JSON.stringify({ project: { name: address, status: 'active' } });
      const ccRes = await new Promise((resolve) => {
        const options = {
          hostname: 'api.companycam.com',
          path: '/v2/projects',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + CC_TOKEN,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(ccBody)
          }
        };
        const req = https.request(options, (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
        });
        req.on('error', () => resolve({}));
        req.write(ccBody); req.end();
      });

      const projectId = ccRes.id;
      if (projectId) {
        results.companycam = true;

        // Collect all photos with tags
        const allPhotos = [];
        if (sections) {
          sections.forEach(section => {
            if (section.type === 'multiroom') {
              section.rooms.forEach(room => {
                room.items.forEach(item => {
                  (item.photos || []).forEach(photo => {
                    allPhotos.push({
                      data: photo.data,
                      name: photo.name || 'photo.jpg',
                      tag: section.title + ' – ' + room.name + ' – ' + item.label
                    });
                  });
                });
              });
            } else {
              section.items.forEach(item => {
                (item.photos || []).forEach(photo => {
                  allPhotos.push({
                    data: photo.data,
                    name: photo.name || 'photo.jpg',
                    tag: section.title + ' – ' + item.label
                  });
                });
              });
            }
          });
        }

        // Upload each photo
        for (const photo of allPhotos) {
          try {
            const base64Data = photo.data.split(',')[1];
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const boundary = '----CCBoundary' + Date.now() + Math.random().toString(36).substr(2);
            const formHeader = Buffer.from(
              '--' + boundary + '\r\n' +
              'Content-Disposition: form-data; name="photo[image]"; filename="' + photo.name + '"\r\n' +
              'Content-Type: image/jpeg\r\n\r\n'
            );
            const labelPart = Buffer.from(
              '\r\n--' + boundary + '\r\n' +
              'Content-Disposition: form-data; name="photo[label]"\r\n\r\n' +
              photo.tag +
              '\r\n--' + boundary + '--\r\n'
            );
            const formBody = Buffer.concat([formHeader, imgBuffer, labelPart]);

            await new Promise((resolve) => {
              const options = {
                hostname: 'api.companycam.com',
                path: '/v2/projects/' + projectId + '/photos',
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + CC_TOKEN,
                  'Content-Type': 'multipart/form-data; boundary=' + boundary,
                  'Content-Length': formBody.length
                }
              };
              const req = https.request(options, (res) => {
                let d = ''; res.on('data', c => d += c); res.on('end', resolve);
              });
              req.on('error', resolve);
              req.write(formBody); req.end();
            });
            results.photos++;
          } catch(e) {}
        }
      }
    } catch(e) { console.log('CC error:', e.message); }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, results }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
