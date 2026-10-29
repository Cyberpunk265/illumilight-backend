
import { Client, TablesDB, ID } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== "POST") {
      return res.json(
        { success: false, message: "POST requests only." },
        405
      );
    }

   let body;

try {
  body = req.bodyJson;
} catch (err) {
  error("Request JSON parsing failed: " + String(err.message || err));

  return res.json(
    { success: false, message: "Invalid request data." },
    400
  );
}

log("Request received. Method: " + req.method);
log("Request body parsed: " + Boolean(body));

    const fullName = String(body?.full_name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (
      fullName.length < 2 ||
      fullName.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.json(
        { success: false, message: "Enter a valid name and email." },
        400
      );
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers["x-appwrite-key"]);

    const tablesDB = new TablesDB(client);

    const application = await tablesDB.createRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: process.env.APPWRITE_TABLE_ID,
      rowId: ID.unique(),
      data: {
        full_name: fullName,
        email,
        status: "pending"
      }
    });

    log("Membership application created.");

    return res.json({
      success: true,
      message: "Your application has been submitted for review.",
      application_id: application.$id,
      status: "pending"
    });
  } catch (err) {
    error("Membership application failed: " + String(err.stack || err.message || err));

if (err.cause) {
  error("Network cause: " + String(err.cause.stack || err.cause.message || err.cause));
}

if (err.cause?.cause) {
  error("Deeper network cause: " + String(err.cause.cause.stack || err.cause.cause.message || err.cause.cause));
}
        return res.json(
      { success: false, message: "Unable to submit your application." },
      500
    );
  }
};
