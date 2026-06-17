const http = require('http');

async function runTests() {
  console.log("=== Whitebox Testing Widget Integration ===\n");

  // 1. Test loader.js endpoint
  console.log("Testing GET /widget/loader.js...");
  const loaderRes = await fetch('http://localhost:4000/widget/loader.js');
  console.log(`Status: ${loaderRes.status}`);
  console.log(`Content-Type: ${loaderRes.headers.get('content-type')}`);
  const loaderText = await loaderRes.text();
  console.log(`Body starts with: ${loaderText.substring(0, 50)}...`);
  console.log(`Includes botId extraction: ${loaderText.includes('getAttribute(\'data-bot-id\')')}`);
  console.log("---");

  // Since we don't have a valid botId right now easily, let's test POST /session with invalid ID
  console.log("Testing POST /api/chat/session with missing botId...");
  const sessRes1 = await fetch('http://localhost:4000/api/chat/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log(`Status: ${sessRes1.status}`);
  const sessData1 = await sessRes1.json();
  console.log(`Response: ${JSON.stringify(sessData1)}`);
  console.log("---");
  
  console.log("Testing GET /widget/invalid-bot-id...");
  const widgetRes = await fetch('http://localhost:4000/widget/invalid-bot-id');
  console.log(`Status: ${widgetRes.status}`);
  console.log(`Content-Type: ${widgetRes.headers.get('content-type')}`);
  const widgetText = await widgetRes.text();
  console.log(`Body: ${widgetText}`);
  console.log("---");
}

runTests().catch(console.error);
