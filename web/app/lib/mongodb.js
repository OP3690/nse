import { MongoClient } from "mongodb";

// Cache the client across hot-reloads (dev) and serverless invocations (prod)
// so we don't open a new connection on every request.
let clientPromise = null;

export function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null; // not configured — caller falls back to local JSON
  if (!clientPromise) {
    if (!globalThis._nseflowMongo) {
      globalThis._nseflowMongo = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect();
    }
    clientPromise = globalThis._nseflowMongo;
  }
  return clientPromise.then((c) => c.db(process.env.MONGODB_DB || "nseflow"));
}
