import dotenv from "dotenv";
import path from "node:path";

// Load dummy test env before any app module is imported by tests.
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });
process.env.NODE_ENV = process.env.NODE_ENV || "test";
