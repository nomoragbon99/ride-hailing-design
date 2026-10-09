-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'WALLET', 'CASH');

-- CreateTable
CREATE TABLE "riders" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" DECIMAL(3,2),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "vehicle_model" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',
    "rating" DECIMAL(3,2),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "driver_id" UUID,
    "driver_name_snapshot" TEXT,
    "driver_vehicle_snapshot" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickup_latitude" DECIMAL(9,6) NOT NULL,
    "pickup_longitude" DECIMAL(9,6) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "dropoff_latitude" DECIMAL(9,6) NOT NULL,
    "dropoff_longitude" DECIMAL(9,6) NOT NULL,
    "dropoff_address" TEXT NOT NULL,
    "fare_amount_minor" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod" NOT NULL,
    "transaction_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(255) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "request_path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "riders_email_key" ON "riders"("email");

-- CreateIndex
CREATE UNIQUE INDEX "riders_phone_number_key" ON "riders"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_number_key" ON "drivers"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_number_key" ON "drivers"("license_number");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_plate_key" ON "drivers"("license_plate");

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE INDEX "trips_status_requested_at_idx" ON "trips"("status", "requested_at");

-- CreateIndex
CREATE INDEX "trips_driver_id_status_idx" ON "trips"("driver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_trip_id_key" ON "payments"("trip_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom Rules: Partial Unique Indexes for Mutual Exclusion
CREATE UNIQUE INDEX "idx_unique_active_trip_rider" ON "trips"("rider_id") WHERE "status" IN ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS');
CREATE UNIQUE INDEX "idx_unique_active_trip_driver" ON "trips"("driver_id") WHERE "status" IN ('ACCEPTED', 'IN_PROGRESS');

-- Custom Rules: Check Constraints for Money and Geo Coordinates
ALTER TABLE "trips" ADD CONSTRAINT "trips_fare_amount_minor_check" CHECK ("fare_amount_minor" IS NULL OR "fare_amount_minor" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_minor_check" CHECK ("amount_minor" >= 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_pickup_lat_check" CHECK ("pickup_latitude" BETWEEN -90.0 AND 90.0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_pickup_lng_check" CHECK ("pickup_longitude" BETWEEN -180.0 AND 180.0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_dropoff_lat_check" CHECK ("dropoff_latitude" BETWEEN -90.0 AND 90.0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_dropoff_lng_check" CHECK ("dropoff_longitude" BETWEEN -180.0 AND 180.0);

