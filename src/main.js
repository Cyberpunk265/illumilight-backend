import { Client, Databases, Query } from 'node-appwrite';

export default async ({ req, res, log }) => {
  log("FIXED VERSION RUNNING - WITH DELETE");
  try {
    const key = process.env.MY_API_KEY;
    if (!key) return res.json({ success: false, error: "MY_API_KEY missing" });
    const client = new Client().setEndpoint('https://fra.cloud.appwrite.io/v1').setProject('6ae27aad00007b481204').setKey(key);
    const db = new Databases(client);
    const body = req.bodyJson || {};
    const action = body.action || 'get_applications';
    log("Action: " + action + " body: " + JSON.stringify(body));

    if (action === 'get_applications') {
      const result = await db.listDocuments('illumilight-db','membership_applications',[Query.orderDesc('$createdAt'), Query.limit(100)]);
      return res.json({ success: true, documents: result.documents, total: result.total });
    }

    // === DELETE - THIS WAS MISSING ===
    if (action === 'deleteApplication' || action === 'deleteMany') {
      const ids = body.ids || (body.id ? [body.id] : []);
      log("Deleting ids: " + JSON.stringify(ids));
      for (let id of ids) {
        await db.deleteDocument('illumilight-db','membership_applications', id);
      }
      return res.json({ success: true, deleted: ids.length });
    }

    if (action === 'sendEmail' || body.type || body.emailType || body.template) {
      const BREVO_KEY = process.env.BREVO_KEY;
      if (!BREVO_KEY) return res.json({ success: false, error: "BREVO_KEY missing" });

      const toEmail = body.toEmail || body.email;
      const toName = body.toName || body.name || "Member";
      const membershipCode = body.membershipCode || body.code || "ILL-2026-XXXX";
      const emailType = (body.type || body.emailType || body.template || "").toLowerCase();
      let subject = body.subject || "";
      let htmlContent = body.htmlContent || body.html || "";

      if (!subject) {
        if (emailType.includes("approv") || body.isApproved || membershipCode !== "ILL-2026-XXXX") {
          subject = `Illumilight - Welcome, You Are Approved ${toName}`;
          htmlContent = `<div style="background:#0a0a09;font-family:Arial;padding:30px;"><div style="max-width:600px;margin:0 auto;background:#13120f;border:1px solid #D6B36A;padding:35px;text-align:center;"><h1 style="color:#D6B36A;font-family:Georgia,serif;letter-spacing:3px;">ILLUMILIGHT</h1><h2 style="color:#fff;">Welcome ${toName},</h2><p style="color:#ccc;">You have been APPROVED.</p><p style="color:#fff;font-size:24px;letter-spacing:2px;">Your Code: <b style="color:#D6B36A;">${membershipCode}</b></p><p style="color:#888;">Template 1 RED - Premium Member</p></div></div>`;
        } else if (emailType.includes("reject")) {
          subject = `Illumilight - Application Update`;
          htmlContent = `<div style="background:#0a0a09;font-family:Arial;padding:30px;"><div style="max-width:600px;margin:0 auto;background:#13120f;border:1px solid #D6B36A;padding:35px;text-align:center;"><h1 style="color:#D6B36A;">ILLUMILIGHT</h1><h2 style="color:#fff;">Hi ${toName},</h2><p style="color:#ccc;">Unfortunately your application was not approved at this time.</p></div></div>`;
        } else {
          subject = `Illumilight - Application Received, ${toName}`;
          htmlContent = `<div style="background:#0a0a09;font-family:Arial;padding:30px;"><div style="max-width:600px;margin:0 auto;background:#13120f;border:1px solid #D6B36A;padding:35px;text-align:center;"><h1 style="color:#D6B36A;font-family:Georgia,serif;letter-spacing:3px;">ILLUMILIGHT</h1><h2 style="color:#fff;">Hi ${toName},</h2><p style="color:#ccc;">We received your application. Status: <b style="color:#facc15;">PENDING APPROVAL</b></p></div></div>`;
        }
      }
      if (!htmlContent) htmlContent = `<p>${subject}</p>`;

      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "accept": "application/json", "api-key": BREVO_KEY, "content-type": "application/json" },
        body: JSON.stringify({ sender: { name: "Illumilight", email: "pmtraders96@gmail.com" }, to: [{ email: toEmail, name: toName }], subject, htmlContent })
      });
      const data = await brevoRes.json();
      log("brevo sent " + JSON.stringify(data));
      return res.json({ success: true, data });
    }

    return res.json({ success: false, error: "Unknown action: " + action });
  } catch (e) {
    log("ERROR: " + e.message);
    return res.json({ success: false, error: e.message });
  }
};
