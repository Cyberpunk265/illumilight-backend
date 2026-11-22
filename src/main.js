import { Client, Databases, Account, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || '6ae27aad00007b481204')
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const DB_ID = "illumilight-db";
    const COL_ID = "membership_applications";
    const action = body.action;

    if (body.jwt) {
      const userClient = new Client()
        .setEndpoint('https://fra.cloud.appwrite.io/v1')
        .setProject('6ae27aad00007b481204')
        .setJWT(body.jwt);
      const userAccount = new Account(userClient);
      const user = await userAccount.get();
      if (user.email.toLowerCase() !== 'pmtraders96@gmail.com') {
        return res.json({ success: false, message: 'Not an administrator' }, 403);
      }

      if (action === 'verify_admin' || !action) {
        return res.json({ success: true, message: 'Administrator verified' });
      }

      if (action === 'get_applications') {
        const list = await db.listDocuments(DB_ID, COL_ID, [Query.limit(100), Query.orderDesc('$createdAt')]);
        return res.json({ success: true, applications: list.documents });
      }

      if (action === 'approve') {
        const rowId = body.rowId;
        const app = await db.getDocument(DB_ID, COL_ID, rowId);
        const newCode = `ILL-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        // FIX: FIRST NAME ONLY - Ffk Mfkfk -> Ffk
        const fullName = app.full_name || 'Member';
        const firstNameRaw = fullName.trim().split(' ')[0];
        const displayName = firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1).toLowerCase();

        const updated = await db.updateDocument(DB_ID, COL_ID, rowId, {
          status: 'approved',
          membership_code: newCode
        });

        // YOUR ORIGINAL DODIS TEMPLATE from screenshot, but with first name only
        const htmlContent = `<div style="background:#050000;color:#fff;font-family:Arial,sans-serif;padding:0;margin:0;"><div style="max-width:600px;margin:0 auto;background:#050000;"><div style="background:#0d0000;border-bottom:2px solid #ff1a1a;padding:32px 20px;text-align:center;"><div style="color:#ff1a1a;font-size:32px;">✹</div><div style="font-size:32px;letter-spacing:6px;font-weight:900;margin-top:8px;">ILLUMI<span style="color:#ff1a1a;">LIGHT</span></div><div style="font-size:13px;letter-spacing:4px;color:#c9a9a9;margin-top:6px;">DODIS • DEPARTMENT OF<br>DISTRIBUTION</div></div><div style="padding:36px 24px;text-align:center;"><div style="font-size:13px;letter-spacing:4px;color:#ff1a1a;">WELCOME TO THE CIRCLE ✹</div><h1 style="font-size:32px;margin:16px 0 10px;">Welcome, ${displayName}</h1><p style="color:#ddd;font-size:16px;">Your membership has been sealed.<br>From the depths, relics arise.</p><div style="background:#140000;border:1px solid #ff1a1a;border-radius:16px;padding:26px 18px;margin:28px 0;"><div style="font-size:11px;letter-spacing:3px;color:#9a6a6a;">YOUR MEMBERSHIP CODE</div><div style="font-size:38px;font-weight:900;letter-spacing:2px;margin:10px 0;">${newCode}</div><div style="color:#4ade80;font-size:14px;">● ACTIVE • R650 TESTAMENT UNLOCKED</div></div><a href="https://illumilight.co.za/dodis/dodis.html" style="display:inline-block;background:#ff1a1a;color:#fff;padding:14px 30px;border-radius:99px;text-decoration:none;font-weight:bold;">SHOP @ DODIS ✹</a><p style="color:#555;font-size:11px;margin-top:24px;">AVE SATANAS • 666 • Johannesburg</p></div></div></div>`;

        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'ILLUMILIGHT', email: 'noreply@illumilight.co.za' },
            to: [{ email: app.email, name: displayName }],
            subject: `Welcome to IllumiLight ✹ Your Code ${newCode}`,
            htmlContent: htmlContent
          })
        });

        return res.json({ success: true, application: updated });
      }

      if (action === 'reject') {
        const updated = await db.updateDocument(DB_ID, COL_ID, body.rowId, { status: 'rejected' });
        return res.json({ success: true, application: updated });
      }
    }
    return res.json({ success: false, message: 'Invalid request' }, 400);
  } catch (e) {
    error('FAILED: ' + e.message);
    return res.json({ success: false, message: e.message }, 500);
  }
};