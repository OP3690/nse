import fs from "node:fs";
import path from "node:path";
import { getDb } from "./mongodb";

// Data source: MongoDB Atlas when MONGODB_URI is set (cloud-deployable), else
// the local web/data/ JSON the pipeline writes (zero-config local dev). Mongo
// docs and JSON files share the same shape, so callers don't care which it is.
const DATA_DIR = path.join(process.cwd(), "data");

function readJson(...parts) {
  const p = path.join(DATA_DIR, ...parts);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function strip(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc; // drop Mongo's _id; pages use the inner fields
  return rest;
}

export async function getLatest() {
  const db = getDb();
  if (db) {
    try {
      return strip(await (await db).collection("latest").findOne({ _id: "latest" }));
    } catch (e) {
      console.error("mongo getLatest failed, falling back to JSON:", e.message);
    }
  }
  return readJson("latest.json");
}

export async function getStock(symbol) {
  const safe = String(symbol).replace(/[^A-Za-z0-9&._-]/g, "");
  const db = getDb();
  if (db) {
    try {
      const doc = strip(await (await db).collection("stocks").findOne({ _id: safe }));
      if (doc) return doc;
    } catch (e) {
      console.error("mongo getStock failed, falling back to JSON:", e.message);
    }
  }
  return readJson("stocks", `${safe}.json`);
}

// Just the compact per-symbol hover-card map (price, 52W, indices, volume
// sparkline …). Served lazily to the client so symbol links anywhere can show
// a rich tooltip without the page shipping the whole map.
export async function getTooltips() {
  const db = getDb();
  if (db) {
    try {
      const doc = strip(await (await db).collection("latest").findOne(
        { _id: "latest" }, { projection: { tooltips: 1 } }));
      if (doc && doc.tooltips) return doc.tooltips;
    } catch (e) {
      console.error("mongo getTooltips failed, falling back to JSON:", e.message);
    }
  }
  const latest = readJson("latest.json");
  return latest?.tooltips || {};
}

export async function listStockSymbols() {
  const db = getDb();
  if (db) {
    try {
      return await (await db).collection("stocks").distinct("symbol");
    } catch (e) {
      console.error("mongo listStockSymbols failed, falling back to JSON:", e.message);
    }
  }
  const dir = path.join(DATA_DIR, "stocks");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export const fmtCr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: n >= 100 ? 0 : 1 })} Cr`;

export const fmtNum = (n) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN");

export const fmtPct = (n) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
