import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  const client = connectionString
    ? new PrismaClient({
        adapter: new PrismaPg(new Pool({ connectionString })),
        log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
      })
    : new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
      });
  return client;
}

export const prisma =
  global.prisma ??
  createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
