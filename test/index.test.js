const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../index");

async function withServer(run) {
  const server = createServer({ initialRecords: [] });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function json(body) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

const validReturn = {
  taxpayerId: "TAX-2001",
  taxpayerName: "Taylor Sample",
  taxYear: 2024,
  income: 75000,
};

test("health endpoint reports service status", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("tax returns support create, list, get, update, and delete", async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/tax-returns`, json(validReturn));
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).data;
    assert.equal(created.taxpayerName, "Taylor Sample");
    assert.equal(created.status, "draft");
    assert.ok(created.id);

    const listResponse = await fetch(`${baseUrl}/api/tax-returns?taxYear=2024&page=1&limit=1`);
    const list = await listResponse.json();
    assert.equal(list.pagination.total, 1);
    assert.equal(list.data[0].id, created.id);

    const getResponse = await fetch(`${baseUrl}/api/tax-returns/${created.id}`);
    assert.equal((await getResponse.json()).data.taxpayerId, "TAX-2001");

    const updateResponse = await fetch(`${baseUrl}/api/tax-returns/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "submitted" }),
    });
    assert.equal((await updateResponse.json()).data.status, "submitted");

    const replaceResponse = await fetch(`${baseUrl}/api/tax-returns/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validReturn, taxpayerName: "Taylor Updated" }),
    });
    const replaced = (await replaceResponse.json()).data;
    assert.equal(replaced.taxpayerName, "Taylor Updated");
    assert.equal(replaced.status, "draft");

    const deleteResponse = await fetch(`${baseUrl}/api/tax-returns/${created.id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);
    const missingResponse = await fetch(`${baseUrl}/api/tax-returns/${created.id}`);
    assert.equal(missingResponse.status, 404);
  });
});

test("invalid models and pagination return structured validation errors", async () => {
  await withServer(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/api/tax-returns`, json({ ...validReturn, income: -10 }));
    assert.equal(invalidResponse.status, 400);
    assert.equal((await invalidResponse.json()).error.code, "VALIDATION_ERROR");

    const paginationResponse = await fetch(`${baseUrl}/api/tax-returns?limit=101`);
    assert.equal(paginationResponse.status, 400);
    assert.equal((await paginationResponse.json()).error.code, "VALIDATION_ERROR");
  });
});

test("list endpoint filters, sorts, and paginates seeded records", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/tax-returns?status=accepted&sortBy=taxYear&order=asc`);
    const result = await response.json();
    assert.equal(result.pagination.total, 1);
    assert.equal(result.data[0].taxpayerName, "Morgan Chen");

    const searchResponse = await fetch(`${baseUrl}/api/tax-returns?q=avery`);
    const searchResult = await searchResponse.json();
    assert.equal(searchResult.pagination.total, 1);
    assert.equal(searchResult.data[0].taxpayerId, "TAX-1001");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
