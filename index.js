const http = require("node:http");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 1024 * 1024;
const FILING_STATUSES = ["single", "married", "head_of_household"];
const RETURN_STATUSES = ["draft", "submitted", "accepted", "rejected"];
const WRITABLE_FIELDS = [
  "taxpayerId",
  "taxpayerName",
  "taxYear",
  "filingStatus",
  "income",
  "deductions",
  "taxDue",
  "status",
];
const SORT_FIELDS = ["taxpayerName", "taxYear", "createdAt", "taxDue", "status"];

const sampleReturns = [
  {
    id: "tr-1001",
    taxpayerId: "TAX-1001",
    taxpayerName: "Avery Johnson",
    taxYear: 2024,
    filingStatus: "single",
    income: 82000,
    deductions: 14600,
    taxDue: 9200,
    status: "submitted",
    createdAt: "2025-02-14T10:00:00.000Z",
    updatedAt: "2025-02-14T10:00:00.000Z",
  },
  {
    id: "tr-1002",
    taxpayerId: "TAX-1002",
    taxpayerName: "Morgan Chen",
    taxYear: 2024,
    filingStatus: "married",
    income: 128000,
    deductions: 29200,
    taxDue: 13400,
    status: "accepted",
    createdAt: "2025-02-15T10:00:00.000Z",
    updatedAt: "2025-02-18T10:00:00.000Z",
  },
  {
    id: "tr-1003",
    taxpayerId: "TAX-1003",
    taxpayerName: "Riley Patel",
    taxYear: 2023,
    filingStatus: "head_of_household",
    income: 96000,
    deductions: 21900,
    taxDue: 7800,
    status: "draft",
    createdAt: "2025-03-01T10:00:00.000Z",
    updatedAt: "2025-03-01T10:00:00.000Z",
  },
];

function errorResponse(response, statusCode, code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  sendJson(response, statusCode, { error });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];

    request.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body exceeds 1 MB."), { status: 413 }));
        return;
      }
      if (size === 0) {
        reject(Object.assign(new Error("A JSON request body is required."), { status: 400 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Request body must contain valid JSON."), { status: 400 }));
      }
    });

    request.on("error", reject);
  });
}

function validateReturn(input, partial = false) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["Request body must be a JSON object."];
  }

  for (const field of Object.keys(input)) {
    if (!WRITABLE_FIELDS.includes(field)) errors.push(`Unknown field: ${field}.`);
  }

  const requiredFields = ["taxpayerId", "taxpayerName", "taxYear", "income"];
  for (const field of requiredFields) {
    if (!partial && (input[field] === undefined || input[field] === null || input[field] === "")) {
      errors.push(`${field} is required.`);
    }
  }

  for (const field of ["taxpayerId", "taxpayerName"]) {
    if (input[field] !== undefined && (typeof input[field] !== "string" || !input[field].trim())) {
      errors.push(`${field} must be a non-empty string.`);
    }
  }

  if (input.taxYear !== undefined && (!Number.isInteger(input.taxYear) || input.taxYear < 1900 || input.taxYear > 2200)) {
    errors.push("taxYear must be an integer between 1900 and 2200.");
  }

  for (const field of ["income", "deductions", "taxDue"]) {
    if (input[field] !== undefined && (typeof input[field] !== "number" || !Number.isFinite(input[field]) || input[field] < 0)) {
      errors.push(`${field} must be a non-negative number.`);
    }
  }

  if (input.filingStatus !== undefined && !FILING_STATUSES.includes(input.filingStatus)) {
    errors.push(`filingStatus must be one of: ${FILING_STATUSES.join(", ")}.`);
  }
  if (input.status !== undefined && !RETURN_STATUSES.includes(input.status)) {
    errors.push(`status must be one of: ${RETURN_STATUSES.join(", ")}.`);
  }

  if (partial && Object.keys(input).length === 0) errors.push("Provide at least one field to update.");
  return errors;
}

function createServer({ initialRecords = sampleReturns } = {}) {
  const records = initialRecords.map((record) => ({ ...record }));

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      sendJson(response, 204);
      return;
    }

    if (pathname === "/" && request.method === "GET") {
      sendJson(response, 200, {
        name: "Mock Tax Returns API",
        status: "ok",
        endpoints: [
          { method: "GET", path: "/health", description: "Service health" },
          { method: "GET", path: "/api/tax-returns", description: "List, filter, sort, and paginate returns" },
          { method: "POST", path: "/api/tax-returns", description: "Create a return" },
          { method: "GET", path: "/api/tax-returns/:id", description: "Get a return" },
          { method: "PUT", path: "/api/tax-returns/:id", description: "Replace a return" },
          { method: "PATCH", path: "/api/tax-returns/:id", description: "Update supplied fields" },
          { method: "DELETE", path: "/api/tax-returns/:id", description: "Delete a return" },
        ],
      });
      return;
    }

    if (pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (pathname === "/api/tax-returns" && request.method === "GET") {
      const filters = {
        taxpayerName: url.searchParams.get("taxpayerName"),
        taxpayerId: url.searchParams.get("taxpayerId"),
        taxYear: url.searchParams.get("taxYear"),
        status: url.searchParams.get("status"),
        q: url.searchParams.get("q"),
      };

      if (filters.taxYear !== null && !/^\d{4}$/.test(filters.taxYear)) {
        errorResponse(response, 400, "VALIDATION_ERROR", "taxYear must be a four-digit year.");
        return;
      }
      if (filters.status !== null && !RETURN_STATUSES.includes(filters.status)) {
        errorResponse(response, 400, "VALIDATION_ERROR", `status must be one of: ${RETURN_STATUSES.join(", ")}.`);
        return;
      }

      const page = Number(url.searchParams.get("page") || 1);
      const limit = Number(url.searchParams.get("limit") || 10);
      const sortBy = url.searchParams.get("sortBy") || "createdAt";
      const order = (url.searchParams.get("order") || "desc").toLowerCase();
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        errorResponse(response, 400, "VALIDATION_ERROR", "page must be a positive integer; limit must be an integer from 1 to 100.");
        return;
      }
      if (!SORT_FIELDS.includes(sortBy) || !["asc", "desc"].includes(order)) {
        errorResponse(response, 400, "VALIDATION_ERROR", `sortBy must be one of: ${SORT_FIELDS.join(", ")}; order must be asc or desc.`);
        return;
      }

      const query = filters.q && filters.q.toLowerCase();
      const filtered = records.filter((record) => {
        if (filters.taxpayerName && !record.taxpayerName.toLowerCase().includes(filters.taxpayerName.toLowerCase())) return false;
        if (filters.taxpayerId && record.taxpayerId !== filters.taxpayerId) return false;
        if (filters.taxYear && record.taxYear !== Number(filters.taxYear)) return false;
        if (filters.status && record.status !== filters.status) return false;
        if (query && !`${record.id} ${record.taxpayerId} ${record.taxpayerName}`.toLowerCase().includes(query)) return false;
        return true;
      });

      filtered.sort((a, b) => {
        const left = a[sortBy];
        const right = b[sortBy];
        const comparison = typeof left === "string" ? left.localeCompare(right) : left - right;
        return order === "asc" ? comparison : -comparison;
      });

      const start = (page - 1) * limit;
      sendJson(response, 200, {
        data: filtered.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit),
        },
      });
      return;
    }

    if (pathname === "/api/tax-returns") {
      if (request.method !== "POST") {
        errorResponse(response, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
        return;
      }
      if (!request.headers["content-type"]?.includes("application/json")) {
        errorResponse(response, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
        return;
      }
      try {
        const input = await parseBody(request);
        const errors = validateReturn(input);
        if (errors.length) {
          errorResponse(response, 400, "VALIDATION_ERROR", "Tax return is invalid.", errors);
          return;
        }
        const now = new Date().toISOString();
        const record = {
          id: randomUUID(),
          taxpayerId: input.taxpayerId.trim(),
          taxpayerName: input.taxpayerName.trim(),
          taxYear: input.taxYear,
          filingStatus: input.filingStatus || "single",
          income: input.income,
          deductions: input.deductions || 0,
          taxDue: input.taxDue || 0,
          status: input.status || "draft",
          createdAt: now,
          updatedAt: now,
        };
        records.push(record);
        sendJson(response, 201, { data: record });
      } catch (error) {
        errorResponse(response, error.status || 400, error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", error.message);
      }
      return;
    }

    const match = pathname.match(/^\/api\/tax-returns\/([^/]+)$/);
    if (match) {
      let id;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        errorResponse(response, 400, "INVALID_ID", "Return ID is not valid URL encoding.");
        return;
      }
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) {
        errorResponse(response, 404, "NOT_FOUND", `Tax return '${id}' was not found.`);
        return;
      }
      if (request.method === "GET") {
        sendJson(response, 200, { data: records[index] });
        return;
      }
      if (request.method === "DELETE") {
        records.splice(index, 1);
        sendJson(response, 204);
        return;
      }
      if (request.method === "PUT" || request.method === "PATCH") {
        if (!request.headers["content-type"]?.includes("application/json")) {
          errorResponse(response, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
          return;
        }
        try {
          const input = await parseBody(request);
          const errors = validateReturn(input, request.method === "PATCH");
          if (errors.length) {
            errorResponse(response, 400, "VALIDATION_ERROR", "Tax return is invalid.", errors);
            return;
          }
          const existing = records[index];
          const updated = {
            ...existing,
            ...(request.method === "PUT"
              ? {
                  taxpayerId: input.taxpayerId.trim(),
                  taxpayerName: input.taxpayerName.trim(),
                  taxYear: input.taxYear,
                  filingStatus: input.filingStatus || "single",
                  income: input.income,
                  deductions: input.deductions || 0,
                  taxDue: input.taxDue || 0,
                  status: input.status || "draft",
                }
              : input),
            updatedAt: new Date().toISOString(),
          };
          if (updated.taxpayerName) updated.taxpayerName = updated.taxpayerName.trim();
          if (updated.taxpayerId) updated.taxpayerId = updated.taxpayerId.trim();
          records[index] = updated;
          sendJson(response, 200, { data: updated });
        } catch (error) {
          errorResponse(response, error.status || 400, error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", error.message);
        }
        return;
      }
      errorResponse(response, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
      return;
    }

    errorResponse(response, 404, "NOT_FOUND", "Route was not found.");
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Mock tax API listening on http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
