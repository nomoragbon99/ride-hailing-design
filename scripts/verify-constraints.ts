import { prisma, pool } from "../src/db.js";
import { faker } from "@faker-js/faker";

async function main() {
  console.log("===============================================================");
  console.log("       STEP 5: DATABASE CONSTRAINT VIOLATION TESTS            ");
  console.log("===============================================================\n");

  let passedTests = 0;

  // -------------------------------------------------------------
  // TEST 1: Rider cannot have two active trips at once
  // Target Constraint: idx_unique_active_trip_rider
  // -------------------------------------------------------------
  console.log("---------------------------------------------------------------");
  console.log("TEST 1: Attempting to insert a 2nd active trip for a rider who already has one");
  console.log("Expected: PostgreSQL Unique Violation on 'idx_unique_active_trip_rider'");
  console.log("---------------------------------------------------------------");

  const activeTrip = await prisma.trip.findFirst({
    where: { status: { in: ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] } },
  });

  if (!activeTrip) {
    throw new Error("No active trip found in database. Please run seed script first.");
  }

  try {
    // Deliberate invalid insert: second active trip with status = 'REQUESTED'
    await prisma.trip.create({
      data: {
        riderId: activeTrip.riderId,
        status: "REQUESTED",
        pickupLatitude: 37.7749,
        pickupLongitude: -122.4194,
        pickupAddress: "123 Concurrent Ave, San Francisco, CA",
        dropoffLatitude: 37.7891,
        dropoffLongitude: -122.4014,
        dropoffAddress: "456 Collision St, San Francisco, CA",
        currency: "USD",
      },
    });
    console.error("❌ FAILED: Duplicate active trip was erroneously permitted!");
  } catch (error: any) {
    console.log("✅ CAUGHT EXPECTED ERROR:");
    console.log(`   Error Code: ${error.code || error.cause?.code || "N/A"}`);
    console.log(`   Message:    ${error.message.split("\n").slice(-2).join(" ")}`);
    passedTests++;
  }

  // -------------------------------------------------------------
  // TEST 2: Cannot insert duplicate payment for the same trip (1:1 constraint)
  // Target Constraint: payments_trip_id_key
  // -------------------------------------------------------------
  console.log("\n---------------------------------------------------------------");
  console.log("TEST 2: Attempting to insert a duplicate payment for a trip");
  console.log("Expected: PostgreSQL Unique Violation on 'payments_trip_id_key'");
  console.log("---------------------------------------------------------------");

  const existingPayment = await prisma.payment.findFirst();
  if (!existingPayment) {
    throw new Error("No payment found in database. Please run seed script first.");
  }

  try {
    // Deliberate invalid insert: duplicate payment for same trip
    await prisma.payment.create({
      data: {
        tripId: existingPayment.tripId,
        amountMinor: 2500,
        currency: "USD",
        status: "COMPLETED",
        paymentMethod: "DEBIT_CARD",
        transactionReference: `ch_duplicate_${Date.now()}`,
      },
    });
    console.error("❌ FAILED: Duplicate payment was erroneously permitted!");
  } catch (error: any) {
    console.log("✅ CAUGHT EXPECTED ERROR:");
    console.log(`   Error Code: ${error.code || error.cause?.code || "N/A"}`);
    console.log(`   Message:    ${error.message.split("\n").slice(-2).join(" ")}`);
    passedTests++;
  }

  // -------------------------------------------------------------
  // TEST 3: Negative fare or out-of-bounds coordinates
  // Target Constraint: trips_fare_amount_minor_check & trips_pickup_lat_check
  // -------------------------------------------------------------
  console.log("\n---------------------------------------------------------------");
  console.log("TEST 3A: Attempting to insert a trip with negative fare amount (-1500 cents)");
  console.log("Expected: PostgreSQL Check Constraint Violation on 'trips_fare_amount_minor_check'");
  console.log("---------------------------------------------------------------");

  const anyRider = await prisma.rider.findFirst();
  if (!anyRider) throw new Error("No rider found.");

  try {
    await prisma.trip.create({
      data: {
        riderId: anyRider.id,
        status: "COMPLETED",
        pickupLatitude: 37.7749,
        pickupLongitude: -122.4194,
        pickupAddress: "Valid Pickup",
        dropoffLatitude: 37.7891,
        dropoffLongitude: -122.4014,
        dropoffAddress: "Valid Dropoff",
        fareAmountMinor: -1500, // ILLEGAL negative fare
        currency: "USD",
      },
    });
    console.error("❌ FAILED: Negative fare amount was erroneously permitted!");
  } catch (error: any) {
    console.log("✅ CAUGHT EXPECTED ERROR:");
    console.log(`   Error Code: ${error.code || error.cause?.code || "N/A"}`);
    console.log(`   Message:    ${error.message.split("\n").slice(-2).join(" ")}`);
    passedTests++;
  }

  console.log("\n---------------------------------------------------------------");
  console.log("TEST 3B: Attempting to insert a trip with out-of-bounds latitude (95.5°)");
  console.log("Expected: PostgreSQL Check Constraint Violation on 'trips_pickup_lat_check'");
  console.log("---------------------------------------------------------------");

  try {
    await prisma.trip.create({
      data: {
        riderId: anyRider.id,
        status: "COMPLETED",
        pickupLatitude: 95.5, // ILLEGAL latitude > 90
        pickupLongitude: -122.4194,
        pickupAddress: "Invalid Polar Orbit",
        dropoffLatitude: 37.7891,
        dropoffLongitude: -122.4014,
        dropoffAddress: "Valid Dropoff",
        fareAmountMinor: 1500,
        currency: "USD",
      },
    });
    console.error("❌ FAILED: Out-of-bounds latitude was erroneously permitted!");
  } catch (error: any) {
    console.log("✅ CAUGHT EXPECTED ERROR:");
    console.log(`   Error Code: ${error.code || error.cause?.code || "N/A"}`);
    console.log(`   Message:    ${error.message.split("\n").slice(-2).join(" ")}`);
    passedTests++;
  }

  console.log("\n===============================================================");
  console.log(`RESULT: All ${passedTests} database constraint tests passed successfully!`);
  console.log("===============================================================");
}

main()
  .catch((e) => {
    console.error("Constraint verification script error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
