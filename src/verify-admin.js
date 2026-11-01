
import { Client, Account, TablesDB, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    // Read and validate the request.
    const payload =
      req.bodyJson ??
      JSON.parse(req.bodyText || "{}");

    const jwt = payload.jwt;
    const action = String(payload.action || "verify_admin")
      .trim()
      .toLowerCase();

    if (!jwt) {
      return res.json(
        {
          success: false,
          message: "Authentication required."
        },
        401
      );
    }

    // Verify administrator identity using the user's JWT.
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
      return res.json(
        {
          success: false,
          message: "Administrator access denied."
        },
        403
      );
    }

    // Login verification does not require database access.
    if (action === "verify_admin") {
      return res.json({
        success: true,
        message: "Administrator verified."
      });
    }

    // Validate server-side database configuration.
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const tableId = process.env.APPWRITE_TABLE_ID;
    const serverKey = process.env.APPWRITE_API_KEY;

    if (
      !endpoint ||
      !projectId ||
      !databaseId ||
      !tableId ||
      !serverKey
    ) {
      error("Appwrite database configuration is incomplete.");

      return res.json(
        {
          success: false,
          message: "Server configuration is incomplete."
        },
        500
      );
    }

    // Create the privileged server-side database connection.
    const databaseClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(serverKey);

    const tablesDB = new TablesDB(databaseClient);

    // Retrieve membership applications.
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
        message: "Applications retrieved successfully.",
        applications: result.rows
      });
    }

    // Handle application approval and rejection.
    if (action === "approve" || action === "reject") {
      const rowId = payload.rowId;

      if (!rowId || typeof rowId !== "string") {
        return res.json(
          {
            success: false,
            message: "A valid application ID is required."
          },
          400
        );
      }

      // Retrieve the selected application.
      const application = await tablesDB.getRow({
        databaseId,
        tableId,
        rowId
      });

      // Prevent processing an application twice.
      if (
        String(application.status || "").toLowerCase() !== "pending"
      ) {
        return res.json(
          {
            success: false,
            message: "This application has already been processed."
          },
          409
        );
      }

      let data;

      // Reject application.
      if (action === "reject") {
        data = {
          status: "rejected"
        };
      }

      // Approve application and generate membership ID.
      if (action === "approve") {
        const year = new Date().getFullYear();

        const existing = await tablesDB.listRows({
          databaseId,
          tableId,
          queries: [
            Query.limit(100)
          ]
        });

        let highestNumber = 0;

        const membershipPattern = new RegExp(
          `^ILL-${year}-(\\d{4})$`
        );

        for (const row of existing.rows) {
          const code = row.membership_code || "";
          const match = code.match(membershipPattern);

          if (match) {
            highestNumber = Math.max(
              highestNumber,
              Number(match[1])
            );
          }
        }

        const nextNumber = String(highestNumber + 1)
          .padStart(4, "0");

        const membershipCode =
          `ILL-${year}-${nextNumber}`;

        data = {
          status: "approved",
          membership_code: membershipCode
        };
      }

      // Save the updated application.
      const updated = await tablesDB.updateRow({
        databaseId,
        tableId,
        rowId,
        data
      });

      return res.json({
        success: true,
        message: action === "approve"
          ? "Application approved successfully."
          : "Application rejected successfully.",
        application: updated
      });
    }

    // Handle unsupported actions.
    return res.json(
      {
        success: false,
        message: `Unknown administrator action: ${action}`
      },
      400
    );

  } catch (err) {
    error(`Administrator function error: ${err.message}`);
    log("Administrator function request failed.");

    return res.json(
      {
        success: false,
        message: "The request could not be completed. Check the function logs."
      },
      500
    );
  }
};
