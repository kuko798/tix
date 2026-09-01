import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(projectRoot, ".env");
const productionSchemaPath = join(projectRoot, "prisma", "schema.prisma");
const localDirectory = join(projectRoot, "prisma", ".local");
const localSchemaPath = join(localDirectory, "schema.prisma");
const prismaCliPath = join(projectRoot, "node_modules", "prisma", "build", "index.js");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const usesLocalSqlite = databaseUrl.startsWith("file:");

if (process.env.NODE_ENV === "production" && usesLocalSqlite) {
  throw new Error("Local SQLite cannot be prepared with NODE_ENV=production. Configure PostgreSQL instead.");
}

if (!usesLocalSqlite) {
  rmSync(localDirectory, { recursive: true, force: true });
  console.log("Preparing the PostgreSQL Prisma client...");
  runPrisma("generate", "--schema", productionSchemaPath);
  process.exit(0);
}

const productionSchema = readFileSync(productionSchemaPath, "utf8");
const localSchema = productionSchema.replace(
  /provider\s*=\s*"postgresql"/,
  'provider = "sqlite"',
);

if (localSchema === productionSchema) {
  throw new Error("Could not derive the local SQLite schema from prisma/schema.prisma.");
}

mkdirSync(localDirectory, { recursive: true });
writeFileSync(localSchemaPath, localSchema, "utf8");

console.log("Preparing an empty local SQLite database (production remains PostgreSQL)...");
runPrisma("generate", "--schema", localSchemaPath);
runPrisma("db", "push", "--schema", localSchemaPath, "--skip-generate", "--accept-data-loss");

function runPrisma(...args) {
  execFileSync(process.execPath, [prismaCliPath, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
}
