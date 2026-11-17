# Mock Tax Returns API

A dependency-free Node.js REST API backed by an in-memory JSON model. Changes are reset when the server restarts. The included sample records are for demonstration only; tax values are not calculated.

## Run

Requires Node.js 18 or later.

```sh
npm start
```

The service listens on `http://localhost:3000`. Set `PORT` to use a different port.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Service health |
| `GET` | `/api/tax-returns` | List, filter, sort, and paginate returns |
| `POST` | `/api/tax-returns` | Create a return |
| `GET` | `/api/tax-returns/:id` | Get a return |
| `PUT` | `/api/tax-returns/:id` | Replace a return |
| `PATCH` | `/api/tax-returns/:id` | Update supplied fields |
| `DELETE` | `/api/tax-returns/:id` | Delete a return |

List query parameters:

- `taxpayerName` (partial, case-insensitive), `taxpayerId`, `taxYear`, `status`, and `q` (searches ID/name/taxpayer ID)
- `page` (default `1`), `limit` (default `10`, maximum `100`)
- `sortBy`: `taxpayerName`, `taxYear`, `createdAt`, `taxDue`, or `status`
- `order`: `asc` or `desc` (default)

Example create request:

```json
{
  "taxpayerId": "TAX-2001",
  "taxpayerName": "Taylor Sample",
  "taxYear": 2024,
  "filingStatus": "single",
  "income": 75000,
  "deductions": 10000,
  "taxDue": 5000,
  "status": "draft"
}
```

`taxpayerId`, `taxpayerName`, `taxYear`, and `income` are required. Filing status can be `single`, `married`, or `head_of_household`; return status can be `draft`, `submitted`, `accepted`, or `rejected`. Monetary values must be non-negative numbers. Unspecified optional fields default to `single`, `0`, and `draft` as applicable.

Successful responses wrap records in `data`; list responses also include `pagination`. Errors use `{ "error": { "code": "...", "message": "...", "details": [] } }` where applicable. CORS is enabled for local mock/API exploration.

## Test

```sh
npm test
```
