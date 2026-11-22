import { Client, Databases } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  const db = new Databases(client);

  const body = JSON.parse(req.body || '{}');
  const { applicationId } = body;

  const app = await db.getDocument(process.env.DB_ID, process.env.COLLECTION_ID, applicationId);

  // RANDOM CODE
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const newCode = `ILL-2026-${randomNum}`;

  // FIRST NAME ONLY - Fix for "Ffk Mfkfk" -> "Ffk"
  const fullName = app.name || app.fullName || app.firstName || 'Member';
  const firstName = fullName.trim().split(' ')[0];
  // Capitalize first letter: ffk -> Ffk
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  await db.updateDocument(process.env.DB_ID, process.env.COLLECTION_ID, applicationId, {
    status: 'approved',
    illCode: newCode
  });

  // YOUR TEMPLATE - REPLACES OLD ONE
  const htmlContent = `<html><body><div style="background:#050000;color:#fff;font-family:Arial;padding:0;margin:0;">
<div style="max-width:600px;margin:0 auto;background:#050000;">
<div style="background:#0d0000;border-bottom:2px solid #ff1a1a;padding:30px;text-align:center;">
<div style="font-size:32px;color:#ff1a1a;">⛧</div>
<div style="font-size:24px;letter-spacing:4px;font-weight:bold;">ILLUM<span style="color:#ff1a1a;">INATI</span></div>
<div style="font-size:10px;letter-spacing:4px;color:#8a5555;">OUT OF THE DARK, INTO THE LIGHT</div>
</div>
<div style="padding:32px 24px;text-align:center;">
<div style="font-size:12px;letter-spacing:3px;color:#ff1a1a;">WELCOME TO THE CIRCLE ⛧</div>
<h1 style="font-size:26px;">Welcome, ${displayName}</h1>
<p style="color:#aaa;font-size:14px;">Your membership has been sealed.</p>
<div style="background:#140000;border:1px solid #ff1a1a;border-radius:16px;padding:22px;margin:20px 0;">
<div style="font-size:10px;letter-spacing:3px;color:#9a6a6a;">YOUR CODE</div>
<div style="font-size:28px;font-weight:900;font-family:monospace;white-space:nowrap;">${newCode}</div>
</div>
<a href="https://illumilight.co.za/dodis/dodis.html" style="display:inline-block;background:#ff1a1a;color:#fff;padding:14px 30px;border-radius:99px;text-decoration:none;font-weight:bold;">SHOP @ DODIS ⛧</a>
<p style="color:#555;font-size:11px;margin-top:20px;">AVE SATANAS • 666 • Johannesburg</p>
</div>
</div>
</div></body></html>`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'ILLUMILIGHT', email: 'noreply@illumilight.co.za' },
      to: [{ email: app.email, name: displayName }],
      subject: `Welcome to IllumiLight ⛧ Your Code ${newCode}`,
      htmlContent: htmlContent
    })
  });

  return res.json({ success: true, code: newCode, name: displayName });
};