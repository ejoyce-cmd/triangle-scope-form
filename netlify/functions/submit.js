const https = require('https');

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
    const results = { monday: false, companycam: false, photos: 0 };

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

      // Post full report as thread update
      const safeReport = reportText.substring(0, 5000)
        .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      await mondayRequest(`mutation { create_update(item_id: ${itemId}, body: "${safeReport}") { id } }`);

      // Post to full report column if mapped
      if (colMap.report) {
        await mondayRequest(
          `mutation { change_simple_column_value(board_id: ${MONDAY_BOARD}, item_id: ${itemId}, column_id: "${colMap.report}", value: ${JSON.stringify(reportText.substring(0, 2000))}) { id } }`
        );
      }
    }

    // 3. CompanyCam — create project
    const ccRes = await new Promise((resolve) => {
      const body = JSON.stringify({ project: { name: address, status: 'active' } });
      const options = {
        hostname: 'api.companycam.com',
        path: '/v2/projects',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + CC_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https.request(options, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
      });
      req.on('error', () => resolve({}));
      req.write(body); req.end();
    });

    const projectId = ccRes.id;
    if (projectId) {
      results.companycam = true;

      // Upload all photos
      const allPhotos = [];
      if (sections) {
        sections.forEach(section => {
          section.items.forEach(item => {
            (item.photos || []).forEach(photo => {
              allPhotos.push({ data: photo.data, name: photo.name || 'photo.jpg', label: item.label });
            });
          });
        });
      }

      for (const photo of allPhotos) {
        try {
          const base64Data = photo.data.split(',')[1];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          const boundary = '----TR' + Date.now();
          const formHeader = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="photo[image]"; filename="${photo.name}"\r\nContent-Type: image/jpeg\r\n\r\n`
          );
          const formFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
          const formBody = Buffer.concat([formHeader, imgBuffer, formFooter]);

          await new Promise((resolve) => {
            const options = {
              hostname: 'api.companycam.com',
              path: `/v2/projects/${projectId}/photos`,
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + CC_TOKEN,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
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

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, results }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
