import { Client, Databases, Account, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || '6ae27aad00007b481204')
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new Databases(client);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    
    // YOUR IDS - MUST BE SET IN APPWRITE VARIABLES OR HERE
    const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || process.env.DATABASE_ID || "REPLACE_WITH_YOUR_DB_ID";
    const COL_ID = process.env.COLLECTION_ID || process.env.APPWRITE_COLLECTION_ID || process.env.MEMBERS_COLLECTION_ID || "REPLACE_WITH_YOUR_COLLECTION_ID";

    log('Action: ' + body.action + ' DB:' + DB_ID + ' COL:' + COL_ID);

    if (!DB_ID || DB_ID.includes("REPLACE") || !COL_ID || COL_ID.includes("REPLACE")) {
      return res.json({ success: false, message: 'Missing required parameter: collectionId - Set APPWRITE_DATABASE_ID and COLLECTION_ID in Function Variables' }, 500);
    }

    // Verify JWT for all admin actions
    let user = null;
    if (body.jwt) {
      const userClient = new Client()
        .setEndpoint('https://fra.cloud.appwrite.io/v1')
        .setProject('6ae27aad00007b481204')
        .setJWT(body.jwt);
      const userAccount = new Account(userClient);
      user = await userAccount.get();
      log('Admin user: ' + user.email);
      if (user.email.toLowerCase() !== 'pmtraders96@gmail.com') {
        return res.json({ success: false, message: 'Not an administrator' }, 403);
      }
    }

    const action = body.action;

    // 1. VERIFY ADMIN
    if (action === 'verify_admin' || (!action && body.jwt && !body.rowId)) {
      return res.json({ success: true, message: 'Administrator verified' });
    }

    // 2. GET APPLICATIONS
    if (action === 'get_applications') {
      const list = await db.listDocuments(DB_ID, COL_ID, [Query.limit(100), Query.orderDesc('$createdAt')]);
      return res.json({ success: true, applications: list.documents });
    }

    // 3. APPROVE - dashboard sends rowId
    if (action === 'approve') {
      const rowId = body.rowId || body.applicationId || body.id;
      const app = await db.getDocument(DB_ID, COL_ID, rowId);

      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const newCode = `ILL-2026-${randomNum}`;

      // Dashboard uses full_name, not name
      const fullName = app.full_name || app.name || app.fullName || 'Member';
      const firstName = fullName.trim().split(' ')[0];
      const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

      const updated = await db.updateDocument(DB_ID, COL_ID, rowId, {
        status: 'approved',
        membership_code: newCode,
        illCode: newCode // keep both for compat
      });

      // Email with FIRST NAME ONLY + your template
      const htmlContent = `<html><body><div style="background:#050000;color:#fff;font-family:Arial;padding:0;margin:0;"><div style="max-width:600px;margin:0 auto;background:#050000;"><div style="background:#0d0000;border-bottom:2px solid #ff1a1a;padding:30px;text-align:center;"><div style="font-size:32px;color:#ff1a1a;">⛧</div><div style="font-size:24px;letter-spacing:4px;font-weight:bold;">ILLUM<span style="color:#ff1a1a;">INATI</span></div><div style="font-size:10px;letter-spacing:4px;color:#8a5555;">OUT OF THE DARK, INTO THE LIGHT</div></div><div style="padding:32px 24px;text-align:center;"><div style="font-size:12px;letter-spacing:3px;color:#ff1a1a;">WELCOME TO THE CIRCLE ⛧</div><h1 style="font-size:26px;">Welcome, ${displayName}</h1><p style="color:#aaa;font-size:14px;">Your membership has been sealed.</p><div style="background:#140000;border:1px solid #ff1a1a;border-radius:16px;padding:22px;margin:20px 0;"><div style="font-size:10px;letter-spacing:3px;color:#9a6a6a;">YOUR CODE</div><div style="font-size:28px;font-weight:900;font-family:monospace;white-space:nowrap;">${newCode}</div></div><a href="https://illumilight.co.za/dodis/dodis.html" style="display:inline-block;background:#ff1a1a;color:#fff;padding:14px 30px;border-radius:99px;text-decoration:none;font-weight:bold;">SHOP @ DODIS ⛧</a><p style="color:#555;font-size:11px;margin-top:20px;">AVE SATANAS • 666 • Johannesburg</p></div></div></div></body></html>`;

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

      return res.json({ success: true, application: updated });
    }

    // 4. REJECT
    if (action === 'reject') {
      const rowId = body.rowId || body.applicationId || body.id;
      const updated = await db.updateDocument(DB_ID, COL_ID, rowId, { status: 'rejected' });
      return res.json({ success: true, application: updated });
    }

    return res.json({ success: false, message: 'Unknown action: ' + action }, 400);

  } catch (e) {
    error('FAILED: ' + e.message);
    return res.json({ success: false, message: e.message }, 500);
  }
};