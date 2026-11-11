import { Client, Databases, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const databases = new Databases(client);
  const DB_ID = 'illumilight-db';
  const COLLECTION_ID = 'membership_applications';

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.searchParams.get('adminKey') !== 'illumi2026') {
        return res.json({ success: false, message: 'Unauthorized' }, 401);
      }
      const response = await databases.listDocuments(DB_ID, COLLECTION_ID, [
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ]);
      return res.json({ success: true, total: response.total, documents: response.documents });
    } catch (e) {
      error(e);
      return res.json({ success: false, message: e.message }, 500);
    }
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const reference = 'ILL-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();

    const doc = await databases.createDocument(DB_ID, COLLECTION_ID, 'unique()', {
      full_name: fullName,
      email: data.email,
      status: 'Pending',
      membership_code: reference,
      country: data.country || '',
      nationality: data.country || '',
      city: data.city || '',
      phone: data.phone || '',
      whatsapp: data.phone || '',
      contact_method: data.contactMethod || 'Email',
      occupation: data.occupation || '',
      reason: data.motivation || data.reason || '',
      heard_about: data.hearAbout || '',
      membership_category: 'Standard',
      must_change_password: false
    });

    return res.json({ success: true, reference: reference, membership_code: reference, $id: doc.$id });
  } catch (e) {
    error(e);
    return res.json({ success: false, message: e.message }, 500);
  }
};