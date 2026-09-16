import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

const expectedHeaders = ["barcode", "product_id", "slug", "url", "name", "product_json"];
// The label fields are compact. Keeping payload import opt-in lets the normal
// operational import finish quickly while retaining an escape hatch for a
// forensic copy of the 275 MB source JSON.
const batchSize = 1000;

function usage() {
  console.error("Usage: node --env-file=.env.local scripts/import-vegan-products.mjs <vegan_products.csv> [--dry-run] [--include-payload] [--skip-existing] [--skip-rows=N]");
}

function normalizeBarcode(value) {
  const barcode = value.trim();
  return /^\d+$/.test(barcode) ? barcode.replace(/^0+(?=\d)/, "") : null;
}

/**
 * Stream RFC 4180-style CSV without loading the 275 MB source file into
 * memory. Quoted newlines and escaped quotes in product_json are supported.
 */
async function* readCsvRows(filename) {
  let row = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;

  for await (const chunk of createReadStream(filename, { encoding: "utf8" })) {
    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index];

      if (afterQuote) {
        if (character === '"') {
          field += '"';
          inQuotes = true;
          afterQuote = false;
          continue;
        }
        inQuotes = false;
        afterQuote = false;
      }

      if (inQuotes) {
        if (character === '"') afterQuote = true;
        else field += character;
        continue;
      }

      if (character === '"' && field.length === 0) {
        inQuotes = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field);
        yield row;
        row = [];
        field = "";
      } else if (character !== "\r") {
        field += character;
      }
    }
  }

  if (afterQuote) inQuotes = false;
  if (inQuotes) throw new Error("CSV ended inside a quoted field.");
  if (field.length || row.length) {
    row.push(field);
    yield row;
  }
}

function parseSourceRow(fields, includePayload) {
  if (fields.length !== expectedHeaders.length || !fields[1].trim()) return null;

  const productJson = fields[5].trim();
  let parsedJson = null;
  if (productJson) {
    try {
      parsedJson = JSON.stringify(JSON.parse(productJson));
    } catch {
      // Keep metadata even if the optional source payload is malformed.
    }
  }

  const barcode = fields[0].trim() || null;
  return {
    sourceProductId: fields[1].trim(),
    barcode,
    canonicalBarcode: barcode ? normalizeBarcode(barcode) : null,
    slug: fields[2].trim() || null,
    sourceUrl: fields[3].trim() || null,
    productName: fields[4].trim() || null,
    productJson: includePayload ? parsedJson : null,
    payloadIsValid: parsedJson !== null,
  };
}

async function createSchema(client) {
  await client.query("CREATE SCHEMA IF NOT EXISTS food_catalog.app");
  await client.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.vegan_products (
    source_product_id STRING PRIMARY KEY,
    barcode STRING NULL,
    canonical_barcode STRING NULL,
    slug STRING NULL,
    source_url STRING NULL,
    product_name STRING NULL,
    product_json JSONB NULL,
    payload_is_valid BOOL NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await client.query("CREATE INDEX IF NOT EXISTS vegan_products_canonical_barcode_idx ON food_catalog.app.vegan_products (canonical_barcode)");
}

function insertStatement(rows) {
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const first = rowIndex * 8;
    values.push(
      row.sourceProductId,
      row.barcode,
      row.canonicalBarcode,
      row.slug,
      row.sourceUrl,
      row.productName,
      row.productJson,
      row.payloadIsValid,
    );
    return `($${first + 1}, $${first + 2}, $${first + 3}, $${first + 4}, $${first + 5}, $${first + 6}, $${first + 7}::JSONB, $${first + 8})`;
  });
  return {
    text: `INSERT INTO food_catalog.app.vegan_products
      (source_product_id, barcode, canonical_barcode, slug, source_url, product_name, product_json, payload_is_valid)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (source_product_id) DO UPDATE SET
        barcode = excluded.barcode,
        canonical_barcode = excluded.canonical_barcode,
        slug = excluded.slug,
        source_url = excluded.source_url,
        product_name = excluded.product_name,
        product_json = excluded.product_json,
        payload_is_valid = excluded.payload_is_valid,
        updated_at = now()`,
    values,
  };
}

async function insertWithRetry(pool, statement) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await pool.query(statement);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      console.warn(`Batch connection failed; retrying (${attempt}/2)…`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * attempt));
    }
  }
  throw lastError;
}

async function reportMatches(client) {
  const [source, exact, normalized] = await Promise.all([
    client.query(`SELECT
      count(*)::STRING AS source_products,
      count(*) FILTER (WHERE canonical_barcode IS NOT NULL)::STRING AS numeric_barcodes
      FROM food_catalog.app.vegan_products`),
    client.query(`SELECT
      count(DISTINCT vegan.source_product_id)::STRING AS vegan_products,
      count(DISTINCT food.id)::STRING AS typesense_products
      FROM food_catalog.app.vegan_products AS vegan
      JOIN food_catalog.public.typesense_foods AS food ON food.barcode = vegan.barcode
      WHERE vegan.canonical_barcode IS NOT NULL`),
    client.query(`SELECT
      count(DISTINCT vegan.source_product_id)::STRING AS vegan_products,
      count(DISTINCT food.id)::STRING AS typesense_products
      FROM food_catalog.app.vegan_products AS vegan
      JOIN food_catalog.public.typesense_foods AS food
        ON nullif(ltrim(food.barcode, '0'), '') = vegan.canonical_barcode
      WHERE vegan.canonical_barcode IS NOT NULL`),
  ]);

  const exactVegan = Number(exact.rows[0].vegan_products);
  const normalizedVegan = Number(normalized.rows[0].vegan_products);
  return {
    sourceProducts: Number(source.rows[0].source_products),
    numericBarcodes: Number(source.rows[0].numeric_barcodes),
    exact: {
      veganProductsMatched: exactVegan,
      typesenseProductsMatched: Number(exact.rows[0].typesense_products),
    },
    gtinNormalized: {
      veganProductsMatched: normalizedVegan,
      typesenseProductsMatched: Number(normalized.rows[0].typesense_products),
      additionalVeganProductsMatched: normalizedVegan - exactVegan,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const includePayload = args.includes("--include-payload");
  const skipExisting = args.includes("--skip-existing");
  const skipRowsArgument = args.find((argument) => argument.startsWith("--skip-rows="));
  const skipRows = skipRowsArgument ? Number.parseInt(skipRowsArgument.slice("--skip-rows=".length), 10) : 0;
  const filename = args.find((argument) => !["--dry-run", "--include-payload", "--skip-existing"].includes(argument) && !argument.startsWith("--skip-rows="));
  if (!filename) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!Number.isSafeInteger(skipRows) || skipRows < 0) throw new Error("--skip-rows must be a non-negative integer.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

  const client = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  const stats = { rowsRead: 0, malformedRows: 0, invalidBarcodes: 0, invalidJsonPayloads: 0, skippedExisting: 0, imported: 0 };
  const batch = [];

  try {
    const rows = readCsvRows(resolve(filename));
    const header = await rows.next();
    if (header.done || header.value.join(",") !== expectedHeaders.join(",")) {
      throw new Error(`Unexpected CSV header. Expected: ${expectedHeaders.join(",")}`);
    }

    if (dryRun) {
      console.log("CSV is valid. Dry run does not write to CockroachDB.");
      for await (const fields of rows) {
        stats.rowsRead += 1;
        const row = parseSourceRow(fields, includePayload);
        if (!row) stats.malformedRows += 1;
        else {
          if (!row.canonicalBarcode) stats.invalidBarcodes += 1;
          if (!row.payloadIsValid) stats.invalidJsonPayloads += 1;
        }
      }
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    await createSchema(client);
    console.log(includePayload ? "Importing metadata and raw product_json payloads." : "Importing label metadata; raw product_json is skipped (use --include-payload to retain it).");
    const existingProductIds = skipExisting
      ? new Set((await client.query("SELECT source_product_id FROM food_catalog.app.vegan_products")).rows.map((row) => row.source_product_id))
      : null;
    if (existingProductIds) console.log(`Resuming after ${existingProductIds.size.toLocaleString()} existing rows.`);
    for await (const fields of rows) {
      stats.rowsRead += 1;
      if (stats.rowsRead <= skipRows) continue;
      const row = parseSourceRow(fields, includePayload);
      if (!row) {
        stats.malformedRows += 1;
        continue;
      }
      if (!row.canonicalBarcode) stats.invalidBarcodes += 1;
      if (!row.payloadIsValid) stats.invalidJsonPayloads += 1;
      if (existingProductIds?.has(row.sourceProductId)) {
        stats.skippedExisting += 1;
        continue;
      }
      batch.push(row);

      if (batch.length === batchSize) {
        await insertWithRetry(client, insertStatement(batch));
        stats.imported += batch.length;
        batch.length = 0;
        if (stats.imported % 5_000 === 0) console.log(`Imported ${stats.imported.toLocaleString()} rows…`);
      }
    }
    if (batch.length) {
      await insertWithRetry(client, insertStatement(batch));
      stats.imported += batch.length;
    }

    console.log(JSON.stringify({ ...stats, matches: await reportMatches(client) }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
