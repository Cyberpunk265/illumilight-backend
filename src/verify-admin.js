
import {
  Client,
  Account,
  TablesDB,
  Users,
  Query,
  ID
} from "node-appwrite";

import { randomBytes } from "node:crypto";

const jsonError = (res, message, status = 400) =>
  res.json({ success: false, message }, status);

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

async function sendMembershipEmail({
  email,
  name,
  membershipCode,
  password
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo configuration is incomplete.");
  }

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Illumilight",
          email: senderEmail
        },
        to: [{ email, name }],
        subject: "Your Illumilight Membership Is Approved",
        htmlContent: `
          <div style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:auto">
            <h2 style="color:#b38a3c">Welcome to Illumilight!</h2>
            <p>Hello ${escapeHtml(name)},</p>
            <p>Your membership application has been approved.</p>
            <p><strong>Membership ID:</strong> ${escapeHtml(membershipCode)}</p>
            <p><strong>Your login email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Your generated password:</strong></p>
            <div style="padding:15px;background:#f3f0e8;font-size:20px;word-break:break-all">
              ${escapeHtml(password)}
            </div>
            <p>Use your email and password to access your Illumilight member account.</p>
            <p>Please change your password after your first login.</p>
            <p>Welcome aboard!<br>Illumilight Team</p>
          </div>
        `
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo email failed (${response.status}): ${details}`);
  }

  return true;
}

export default async ({ req, res, log, error }) => {
  let createdUserId = null;

  try {
    const payload =
      req.bodyJson ??
      JSON.parse(req.bodyText || "{}");

    const action = String(payload.action || "verify_admin")
      .trim()
      .toLowerCase();

    const jwt = payload.jwt;

    if (!jwt) {
      return jsonError(res, "Authentication required.", 401);
    }

    // Verify the administrator's identity.
    const authClient = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(authClient);
    const user = await account.get();

    if (
      !process.env.ADMIN_USER_ID ||
      user.$id !== process.env.ADMIN_USER_ID
    ) {
      return jsonError(
        res,
        "Administrator access denied.",
        403
      );
    }

    if (action === "verify_admin") {
      return res.json({
        success: true,
        message: "Administrator verified."
      });
    }

    // Validate server-side configuration.
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const tableId = process.env.APPWRITE_TABLE_ID;
    const serverKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !databaseId ||
        !tableId || !serverKey) {
      error("Appwrite configuration is incomplete.");
      return jsonError(
        res,
        "Server configuration is incomplete.",
        500
      );
    }

    const serverClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(serverKey);

    const tablesDB = new TablesDB(serverClient);
    const users = new Users(serverClient);

    // Retrieve applications.
    if (action === "get_applications") {
      const result = await tablesDB.listRows({
        databaseId,
        tableId,
        queries: [
          Query.orderDesc("$createdAt"),
          Query.limit(100)
        ]
      });

      return res.json({
        success: true,
        applications: result.rows
      });
    }

    // Approve or reject applications.
    if (action === "approve" || action === "reject") {
      const rowId = payload.rowId;

      if (!rowId || typeof rowId !== "string") {
        return jsonError(
          res,
          "A valid application ID is required."
        );
      }

      const application = await tablesDB.getRow({
        databaseId,
        tableId,
        rowId
      });

      if (
        String(application.status || "").toLowerCase() !== "pending"
      ) {
        return jsonError(
          res,
          "This application has already been processed.",
          409
        );
      }

      if (action === "reject") {
        const updated = await tablesDB.updateRow({
          databaseId,
          tableId,
          rowId,
          data: { status: "rejected" }
        });

        return res.json({
          success: true,
          message: "Application rejected.",
          application: updated
        });
      }

      // Validate applicant details.
      const email = String(application.email || "")
        .trim()
        .toLowerCase();

      const name = String(application.full_name || "").trim();

      if (!email || !name) {
        return jsonError(
          res,
          "The application is missing an email or name."
        );
      }

      // Generate the next membership ID.
      const year = new Date().getFullYear();

      const existing = await tablesDB.listRows({
        databaseId,
        tableId,
        queries: [Query.limit(100)]
      });

      let highestNumber = 0;

      const membershipPattern =
        new RegExp(`^ILL-${year}-(\\d{4})$`);

      for (const row of existing.rows) {
        const match = String(row.membership_code || "")
          .match(membershipPattern);

        if (match) {
          highestNumber = Math.max(
            highestNumber,
            Number(match[1])
          );
        }
      }

      const membershipCode =
        `ILL-${year}-${String(highestNumber + 1).padStart(4, "0")}`;

      // Generate a strong random permanent password.
      const password = randomBytes(24).toString("base64url");

      // Create the member's Appwrite Auth account.
      const newUser = await users.create({
        userId: ID.unique(),
        email,
        password,
        name
      });

  
      // Link the Auth account and approve the application first.
const updated = await tablesDB.updateRow({
  databaseId,
  tableId,
  rowId,
data: {
  status: "approved",
  membership_code: membershipCode,
  user_id: createdUserId,
  must_change_password: true
}
});

// The account is now linked. Do not delete it if email delivery fails.
createdUserId = null;

// Send the credentials after the database update.
await sendMembershipEmail({
  email,
  name,
  membershipCode,
  password
});

      return res.json({
        success: true,
        message: "Application approved and login credentials emailed.",
        application: updated
      });
    }

    return jsonError(
      res,
      `Unknown administrator action: ${action}`
    );

  } catch (err) {
    error(`Administrator function error: ${err.message}`);
    log("Administrator function request failed.");

    // Attempt cleanup if account creation succeeded but
    // a later step failed.
    if (createdUserId) {
      try {
        const cleanupClient = new Client()
          .setEndpoint(process.env.APPWRITE_ENDPOINT)
          .setProject(process.env.APPWRITE_PROJECT_ID)
          .setKey(process.env.APPWRITE_API_KEY);

        const cleanupUsers = new Users(cleanupClient);

        await cleanupUsers.delete({
          userId: createdUserId
        });
      } catch (cleanupError) {
        error(`Account cleanup failed: ${cleanupError.message}`);
      }
    }

    return res.json({
      success: false,
      message: "The request failed. Check the function logs before retrying."
    }, 500);
  }
};
