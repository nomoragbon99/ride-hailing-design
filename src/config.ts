import dotenv from "dotenv";

dotenv.config();

export const config = {
  databaseUrl: process.env.DATABASE_URL || "",
  seed: {
    ridersCount: 20,
    driversCount: 10,
    tripsCount: 40,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  trip: {
    defaultCurrency: "USD",
  },
} as const;
