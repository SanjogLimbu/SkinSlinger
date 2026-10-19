import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations can't run through Supabase's pooler, so the CLI uses the direct URL.
    url: process.env["DIRECT_URL"],
  },
})
