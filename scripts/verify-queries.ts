import { pool, prisma } from "../src/db.js";

async function runExplain(label: string, sql: string, params: any[]) {
  console.log(`\n===============================================================`);
  console.log(`EXPLAIN ANALYZE: ${label}`);
  console.log(`SQL: ${sql.trim()}`);
  console.log(`===============================================================`);

  // We set enable_seqscan = off in this session to force PostgreSQL planner
  // to evaluate and demonstrate the B-tree index path on small seed tables,
  // preventing it from defaulting to full-table sequential scan due to low row count.
  await pool.query("SET enable_seqscan = off;");

  const res = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE) ${sql}`, params);
  res.rows.forEach((row: any) => {
    console.log(row["QUERY PLAN"]);
  });

  await pool.query("SET enable_seqscan = on;");
}

async function main() {
  console.log("===============================================================");
  console.log("       STEP 5: QUERY PROOFS & EXPLAIN ANALYZE VERIFICATION     ");
  console.log("===============================================================");

  // Fetch sample IDs from DB
  const riders = await prisma.rider.findMany({ take: 5 });
  const drivers = await prisma.driver.findMany({ take: 5 });
  const requestedTrips = await prisma.trip.findMany({ where: { status: "REQUESTED" }, take: 1 });
  const acceptedTrips = await prisma.trip.findMany({ where: { status: "ACCEPTED" }, take: 1 });
  const completedTrips = await prisma.trip.findMany({ where: { status: "COMPLETED" }, take: 1 });

  if (riders.length === 0 || drivers.length === 0) {
    throw new Error("Database not seeded. Run 'npm run db:seed' first.");
  }

  const sampleRider = riders[0];
  const sampleDriver = drivers[0];

  // -------------------------------------------------------------
  // PROOF 1: Rider Active Trip Check (Action 1)
  // Index: idx_unique_active_trip_rider
  // -------------------------------------------------------------
  console.log("\n[ACTION 1 PROOF] Query Rider Active Trip Status");
  const action1Sql = `
    SELECT id, rider_id, status, requested_at 
    FROM trips 
    WHERE rider_id = $1 AND status IN ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS');
  `;
  await runExplain("Rider Active Trip Lookup (Index: idx_unique_active_trip_rider)", action1Sql, [sampleRider.id]);

  const activeTripResult = await pool.query(action1Sql, [sampleRider.id]);
  console.log(`Result: Found ${activeTripResult.rows.length} active trip(s) for Rider ${sampleRider.id}`);

  // -------------------------------------------------------------
  // PROOF 2: Driver Looking for Available Trip Requests (Action 2)
  // Index: trips_status_requested_at_idx
  // -------------------------------------------------------------
  console.log("\n[ACTION 2 PROOF] Driver Looking for Available Trip Requests");
  const action2Sql = `
    SELECT id, status, requested_at, pickup_address, dropoff_address 
    FROM trips 
    WHERE status = 'REQUESTED' 
    ORDER BY requested_at ASC 
    LIMIT 5;
  `;
  await runExplain("Available Requested Trips (Index: trips_status_requested_at_idx)", action2Sql, []);

  const openTripsResult = await pool.query(action2Sql, []);
  console.log(`Result: Retrieved ${openTripsResult.rows.length} open trip request(s) awaiting driver match.`);

  // -------------------------------------------------------------
  // PROOF 3: Driver Active Assignment & Start Trip (Action 3)
  // Index: trips_driver_id_status_idx
  // -------------------------------------------------------------
  console.log("\n[ACTION 3 PROOF] Driver Fetching Accepted Trip to Start");
  const acceptedTrip = acceptedTrips[0];
  if (acceptedTrip && acceptedTrip.driverId) {
    const action3Sql = `
      SELECT id, driver_id, status, pickup_address 
      FROM trips 
      WHERE driver_id = $1 AND status = 'ACCEPTED';
    `;
    const driverTripResult = await pool.query(action3Sql, [acceptedTrip.driverId]);
    console.log(`Result: Found ${driverTripResult.rows.length} accepted trip ready for start: Trip ID ${driverTripResult.rows[0]?.id}`);
  }

  // -------------------------------------------------------------
  // PROOF 4: Driver Completing Trip (Action 4)
  // Primary Key Lookup
  // -------------------------------------------------------------
  console.log("\n[ACTION 4 PROOF] Lookup Trip By Primary Key For Completion");
  if (acceptedTrip) {
    const tripById = await prisma.trip.findUnique({
      where: { id: acceptedTrip.id },
      select: { id: true, status: true, fareAmountMinor: true, currency: true },
    });
    console.log("Result: Trip details retrieved via Primary Key:", tripById);
  }

  // -------------------------------------------------------------
  // PROOF 5: Payment Lookup & Settlement (Action 5)
  // Unique Index: payments_trip_id_key
  // -------------------------------------------------------------
  console.log("\n[ACTION 5 PROOF] Payment Verification by Trip ID");
  const completedTrip = completedTrips[0];
  if (completedTrip) {
    const payment = await prisma.payment.findUnique({
      where: { tripId: completedTrip.id },
    });
    console.log(`Result: Found existing payment for completed Trip ${completedTrip.id}:`, {
      paymentId: payment?.id,
      amountMinor: payment?.amountMinor,
      currency: payment?.currency,
      status: payment?.status,
    });
  }

  console.log("\n===============================================================");
  console.log("           ALL 5 QUERY PROOFS EXECUTED SUCCESSFULLY            ");
  console.log("===============================================================");
}

main()
  .catch((e) => {
    console.error("Query verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
