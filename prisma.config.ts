import { config } from "./src/config.js";
import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url: config.databaseUrl,
  },
});
