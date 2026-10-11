import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const maxRequestBytes = 16 * 1024;
const sheetsScope = "https://www.googleapis.com/auth/spreadsheets";
const ordersTab = "الطلبات";
const orderHeaders = [
  "رقم الطلب", "تاريخ الطلب", "الاسم", "اللقب", "رقم الهاتف", "العنوان",
  "المدينة", "المقاس", "المنتج", "السعر (DH)", "حالة الطلب", "ملاحظات",
];
const allowedSizes = new Set(["31", "33", "34", "36"]);
const allowedCities = new Set([
  "Agadir", "Béni Mellal", "Casablanca", "Dakhla", "El Jadida", "Fès",
  "Khouribga", "Kénitra", "Laâyoune", "Marrakech", "Meknès", "Nador",
  "Oujda", "Rabat", "Safi", "Tanger", "Tétouan",
]);
const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/manus-routes.json", "manus-routes.json"],
  ["/brandmark.svg", "brandmark.svg"],
  ["/product-main.jpeg", "product-main.jpeg"],
  ["/product-02.jpeg", "product-02.jpeg"],
  ["/product-03.jpeg", "product-03.jpeg"],
  ["/product-04.jpeg", "product-04.jpeg"],
  ["/product-05.jpeg", "product-05.jpeg"],
  ["/product-06.jpeg", "product-06.jpeg"],
  ["/favicon.ico", "brandmark.svg"],
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

let cachedSheetsClient = null;
let cachedClientKey = "";
let sheetInitialization = new Map();

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function validText(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    const error = new Error("Unsupported content type");
    error.statusCode = 415;
    throw error;
  }

  const chunks = [];
  let byteCount = 0;
  for await (const chunk of request) {
    byteCount += chunk.length;
    if (byteCount > maxRequestBytes) {
      request.resume();
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON object");
    return value;
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function buildOrder(body) {
  const firstName = validText(body.firstName, 80);
  const lastName = validText(body.lastName, 80);
  const phone = validText(body.phone, 30);
  const address = validText(body.address, 300);
  const city = validText(body.city, 80);
  const size = validText(body.size, 2);

  if (!firstName || !lastName || !address || !phone || !city || !size) return null;
  const digits = phone.replace(/\D/g, "").length;
  if (!/^[+0-9() .-]{8,20}$/.test(phone) || digits < 9 || digits > 15) return null;
  if (!allowedCities.has(city) || !allowedSizes.has(size)) return null;

  return {
    orderId: randomUUID(),
    createdAt: new Date().toISOString(),
    firstName,
    lastName,
    phone,
    address,
    city,
    size,
    product: "Dark Indigo Baggy Jeans",
    price: 250,
    status: "Nouvelle commande",
    notes: "",
  };
}

function getGoogleConfiguration() {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!sheetId || !rawCredentials) throw new Error("google_sheets_configuration_missing");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(sheetId)) throw new Error("google_sheet_id_invalid");

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error("service_account_json_invalid");
  }

  const emailIsServiceAccount = typeof credentials?.client_email === "string"
    && /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email);
  const keyIsPem = typeof credentials?.private_key === "string"
    && /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(credentials.private_key);
  if (credentials?.type !== "service_account" || !emailIsServiceAccount || !keyIsPem) {
    throw new Error("service_account_json_invalid");
  }

  return { sheetId, credentials };
}

function getSheetsClient(configuration) {
  const { sheetId, credentials } = configuration;
  const cacheKey = `${sheetId}:${credentials.client_email}:${credentials.private_key_id || ""}`;
  if (cachedSheetsClient && cachedClientKey === cacheKey) return cachedSheetsClient;

  // Only validated email/key fields reach the JWT client; no external token URL is accepted.
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    keyId: credentials.private_key_id,
    scopes: [sheetsScope],
  });
  cachedSheetsClient = google.sheets({ version: "v4", auth });
  cachedClientKey = cacheKey;
  return cachedSheetsClient;
}

function quoteSheetTitle(title) {
  return `'${title.replace(/'/g, "''")}'`;
}

async function readSheetTitles(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
    timeout: 15000,
  });
  return (response.data.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean);
}

async function initializeOrdersTab(sheets, spreadsheetId) {
  let titles = await readSheetTitles(sheets, spreadsheetId);
  let createdByThisRequest = false;

  if (!titles.includes(ordersTab)) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: ordersTab } } }],
        },
        timeout: 15000,
      });
      createdByThisRequest = true;
    } catch (error) {
      // Another simultaneous order may have created the tab after our metadata read.
      titles = await readSheetTitles(sheets, spreadsheetId);
      if (!titles.includes(ordersTab)) throw error;
      createdByThisRequest = true;
    }
  }

  const headerRange = `${quoteSheetTitle(ordersTab)}!A1:L1`;
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
    valueRenderOption: "UNFORMATTED_VALUE",
    timeout: 15000,
  });
  const header = headerResponse.data.values?.[0] || [];
  const blankHeader = header.length === 0 || header.every((value) => String(value ?? "").trim() === "");

  if (blankHeader && createdByThisRequest) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange,
      valueInputOption: "RAW",
      requestBody: { majorDimension: "ROWS", values: [orderHeaders] },
      timeout: 15000,
    });
    return;
  }

  const matchesExpectedHeader = header.length === orderHeaders.length
    && orderHeaders.every((value, index) => header[index] === value);
  if (!matchesExpectedHeader) throw new Error("orders_tab_header_mismatch");
}

async function ensureOrdersTab(sheets, spreadsheetId) {
  const cached = sheetInitialization.get(spreadsheetId);
  if (cached) return cached;

  const pending = initializeOrdersTab(sheets, spreadsheetId);
  sheetInitialization.set(spreadsheetId, pending);
  try {
    await pending;
  } catch (error) {
    sheetInitialization.delete(spreadsheetId);
    throw error;
  }
}

async function appendOrderToGoogleSheet(order) {
  const configuration = getGoogleConfiguration();
  const sheets = getSheetsClient(configuration);
  await ensureOrdersTab(sheets, configuration.sheetId);

  const range = `${quoteSheetTitle(ordersTab)}!A:L`;
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId: configuration.sheetId,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      majorDimension: "ROWS",
      values: [[
        order.orderId,
        order.createdAt,
        order.firstName,
        order.lastName,
        order.phone,
        order.address,
        order.city,
        order.size,
        order.product,
        order.price,
        order.status,
        order.notes,
      ]],
    },
    timeout: 20000,
  });

  if (result.data.updates?.updatedRows !== 1) throw new Error("google_sheets_did_not_append_one_row");
}

function safeErrorCode(error) {
  const value = error?.response?.status || error?.code || error?.name || "unknown";
  return String(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "unknown";
}

async function submitOrder(request, response) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { ok: false, message: "Vérifiez les informations et réessayez." });
    return;
  }

  // Honeypot for simple bots; it never reaches Google Sheets.
  if (typeof body.website === "string" && body.website.trim()) {
    sendJson(response, 200, { ok: true, orderId: randomUUID() });
    return;
  }

  const order = buildOrder(body);
  if (!order) {
    sendJson(response, 422, { ok: false, message: "Certaines informations du formulaire sont invalides." });
    return;
  }

  try {
    await appendOrderToGoogleSheet(order);
  } catch (error) {
    // Do not log customer details, credentials, spreadsheet content, or the service-account key.
    console.warn("Google Sheets order write failed:", safeErrorCode(error));
    sendJson(response, 503, {
      ok: false,
      message: "Impossible d’enregistrer la commande pour le moment. Vos informations sont conservées dans le formulaire ; veuillez réessayer.",
    });
    return;
  }

  sendJson(response, 200, { ok: true, orderId: order.orderId });
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    sendJson(response, 400, { ok: false, message: "Requête invalide." });
    return;
  }

  if (pathname === "/_app/health" && request.method === "GET") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (pathname === "/api/orders") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST", "cache-control": "no-store" }).end();
      return;
    }
    await submitOrder(request, response);
    return;
  }

  const relativePath = staticFiles.get(pathname);
  if (!relativePath || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" }).end("Not found");
    return;
  }

  try {
    const target = resolve(root, relativePath);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    const contents = await readFile(target);
    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-length": contents.length,
      "content-type": mimeTypes[extname(target).toLowerCase()] || "application/octet-stream",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" }).end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`DILEONASTREET is listening on http://0.0.0.0:${port}`);
});
