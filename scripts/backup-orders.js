// Exports every row in the "orders" table to a CSV file.
// Run automatically every 7 days by .github/workflows/backup-orders.yml
// Can also be run manually any time with: node scripts/backup-orders.js

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import process from "process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function main() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch orders:", error.message);
    process.exit(1);
  }

  const columns = ["id", "name", "phone", "event_type", "event_date", "details", "status", "source", "created_at"];
  const header = columns.join(",");
  const rows = data.map((row) => columns.map((col) => toCsvValue(row[col])).join(","));
  const csv = [header, ...rows].join("\n");

  mkdirSync("backups", { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `backups/orders-${timestamp}.csv`;
  writeFileSync(filename, csv);

  console.log(`Backed up ${data.length} orders to ${filename}`);
}

main();