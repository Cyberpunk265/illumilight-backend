import { Client, TablesDB, Account, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const API_KEY = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY;
  const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "illumilight-db";
  const TABLE_ID = process.env.APPWRITE_TABLE_ID || "membership_applications";

  log("DB: " + DATABASE_ID + " Table: " + TABLE_ID);

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
    .setKey(API_KEY);

  const tables = new TablesDB(client);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { jwt, action, rowId } = body;

    if (!jwt) return res.json({ success: false, message: "No JWT" }, 401);
    
    const jwtClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);
    const user = await new Account(jwtClient).get().catch(() => null);
    if (!user) return res.json({ success: false, message: "Invalid JWT" }, 401);

    if (action === "get_applications") {
      const result = await tables.listRows(DATABASE_ID, TABLE_ID, [Query.limit(100)]);
      const apps = result.rows.map(r => {
        if (r.status !== "approved") return { ...r, membership_code: "" };
        return r;
      });
      return res.json({ success: true, applications: apps });
    }

    if (action === "approve") {
      const all = await tables.listRows(DATABASE_ID, TABLE_ID, [Query.limit(100)]);
      const approvedCount = all.rows.filter(r => r.status === "approved").length;
      const newCode = `ILL-2026-${String(approvedCount + 1).padStart(4, '0')}`;
      
      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "approved",
        membership_code: newCode
      });

      // === BREVO EMAIL - SEND CODE AUTOMATICALLY ===
      try {
        const memberEmail = updated.email;
        const memberName = updated.full_name || updated.name || "Member";
        log("Sending email to: " + memberEmail + " code: " + newCode);

        if (memberEmail && process.env.BREVO_API_KEY) {
          const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "accept": "application/json",
              "api-key": process.env.BREVO_API_KEY,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              sender: { name: "IllumiLight", email: process.env.BREVO_SENDER_EMAIL },
              to: [{ email: memberEmail, name: memberName }],
              subject: "Welcome to IllumiLight - Your Membership Code! ✨",
              htmlContent: `<html><body style="font-family: Arial; background: #fff8e1; padding: 20px;">
                <h2 style="color: #f9a825;">Welcome to IllumiLight, ${memberName}! ✨</h2>
                <p>Your membership has been <b>APPROVED</b>!</p>
                <p>Your official membership code is:</p>
                <h1 style="background: #000; color: #ffd700; padding: 15px; text-align: center; letter-spacing: 2px;">${newCode}</h1>
                <p>Keep this code safe - you will need it for IllumiLight events and benefits.</p>
                <p>With light,<br><b>IllumiLight Team</b></p>
              </body></html>`
            })
          });
          log("Brevo status: " + brevoRes.status);
        } else {
          log("Skipped email - no email or no BREVO_API_KEY");
        }
      } catch (emailErr) {
        error("Email failed but approval succeeded: " + emailErr.message);
        // Don't fail approval if email fails
      }
      // === END BREVO ===

      return res.json({ success: true, application: updated });
    }

    if (action === "reject") {
      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "rejected",
        membership_code: ""
      });
      return res.json({ success: true, application: updated });
    }

    if (action === "verify_admin") return res.json({ success: true });
    return res.json({ success: false, message: "Unknown action" }, 400);

  } catch (e) {
    error("FULL ERROR: " + e.message);
    return res.json({ success: false, message: e.message }, 500);
  }
};