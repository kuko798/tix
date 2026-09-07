import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatabaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

const datasource = migrationDatabaseUrl
  ? { engine: "classic" as const, datasource: { url: migrationDatabaseUrl } }
  : {};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...datasource,
});
