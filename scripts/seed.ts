import { faker } from "@faker-js/faker";
import { prisma, pool } from "../src/db.js";
import { config } from "../src/config.js";

async function main() {
  console.log("--- Starting Database Seeding ---");

  // Clean existing records in reverse dependency order
  await prisma.payment.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.rider.deleteMany();
  await prisma.idempotencyKey.deleteMany();

  console.log("Existing tables cleaned.");

  // 1. Seed Riders (at least 20)
  const ridersCount = Math.max(config.seed.ridersCount, 20);
  const ridersData = [];
  for (let i = 0; i < ridersCount; i++) {
    ridersData.push({
      email: faker.internet.email().toLowerCase(),
      phoneNumber: faker.phone.number({ style: "international" }),
      name: faker.person.fullName(),
      rating: faker.number.float({ min: 4.2, max: 5.0, fractionDigits: 2 }),
    });
  }

  const riders = [];
  for (const data of ridersData) {
    const rider = await prisma.rider.create({ data });
    riders.push(rider);
  }
  console.log(`Seeded ${riders.length} riders.`);

  // 2. Seed Drivers (at least 10)
  const driversCount = Math.max(config.seed.driversCount, 10);
  const driversData = [];
  for (let i = 0; i < driversCount; i++) {
    driversData.push({
      email: faker.internet.email().toLowerCase(),
      phoneNumber: faker.phone.number({ style: "international" }),
      name: faker.person.fullName(),
      licenseNumber: `DL-${faker.string.alphanumeric(8).toUpperCase()}`,
      vehicleModel: `${faker.vehicle.manufacturer()} ${faker.vehicle.model()}`,
      licensePlate: `${faker.string.alphanumeric(3).toUpperCase()}-${faker.string.numeric(4)}`,
      status: i < 8 ? "BUSY" : "AVAILABLE",
      rating: faker.number.float({ min: 4.5, max: 5.0, fractionDigits: 2 }),
    });
  }

  const drivers = [];
  for (const data of driversData) {
    const driver = await prisma.driver.create({ data });
    drivers.push(driver);
  }
  console.log(`Seeded ${drivers.length} drivers.`);

  // 3. Seed Trips (40 trips)
  // To strictly obey the partial unique indexes:
  // - A rider can have at most ONE active trip ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS')
  // - A driver can have at most ONE active trip ('ACCEPTED', 'IN_PROGRESS')
  // Distribution:
  // 25 COMPLETED (historical, unconstrained)
  // 5 CANCELLED (historical, unconstrained)
  // 5 IN_PROGRESS (active: riders[0..4], drivers[0..4])
  // 3 ACCEPTED (active: riders[5..7], drivers[5..7])
  // 2 REQUESTED (active: riders[8..9], driver = null)

  const trips = [];
  const payments = [];

  // Helper for coordinates around San Francisco
  const baseLat = 37.7749;
  const baseLng = -122.4194;

  const randomCoords = () => {
    return {
      pickupLat: +(baseLat + (Math.random() - 0.5) * 0.08).toFixed(6),
      pickupLng: +(baseLng + (Math.random() - 0.5) * 0.08).toFixed(6),
      dropoffLat: +(baseLat + (Math.random() - 0.5) * 0.08).toFixed(6),
      dropoffLng: +(baseLng + (Math.random() - 0.5) * 0.08).toFixed(6),
    };
  };

  // A. 25 Completed Trips
  for (let i = 0; i < 25; i++) {
    const rider = riders[i % riders.length];
    const driver = drivers[i % drivers.length];
    const coords = randomCoords();
    const fare = faker.number.int({ min: 1200, max: 6500 });
    const requestedAt = faker.date.recent({ days: 10 });
    const startedAt = new Date(requestedAt.getTime() + 5 * 60 * 1000);
    const completedAt = new Date(startedAt.getTime() + 18 * 60 * 1000);

    const trip = await prisma.trip.create({
      data: {
        riderId: rider.id,
        driverId: driver.id,
        driverNameSnapshot: driver.name,
        driverVehicleSnapshot: `${driver.vehicleModel} - ${driver.licensePlate}`,
        status: "COMPLETED",
        pickupLatitude: coords.pickupLat,
        pickupLongitude: coords.pickupLng,
        pickupAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        dropoffLatitude: coords.dropoffLat,
        dropoffLongitude: coords.dropoffLng,
        dropoffAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        fareAmountMinor: fare,
        currency: "USD",
        requestedAt,
        startedAt,
        completedAt,
      },
    });
    trips.push(trip);

    // Corresponding Payment
    const payment = await prisma.payment.create({
      data: {
        tripId: trip.id,
        amountMinor: fare,
        currency: "USD",
        status: "COMPLETED",
        paymentMethod: faker.helpers.arrayElement(["CREDIT_CARD", "DEBIT_CARD", "WALLET"]),
        transactionReference: `ch_${faker.string.alphanumeric(20)}`,
        createdAt: completedAt,
      },
    });
    payments.push(payment);
  }

  // B. 5 Cancelled Trips
  for (let i = 0; i < 5; i++) {
    const rider = riders[(10 + i) % riders.length];
    const driver = drivers[(i) % drivers.length];
    const coords = randomCoords();
    const requestedAt = faker.date.recent({ days: 3 });

    const trip = await prisma.trip.create({
      data: {
        riderId: rider.id,
        driverId: driver.id,
        driverNameSnapshot: driver.name,
        driverVehicleSnapshot: `${driver.vehicleModel} - ${driver.licensePlate}`,
        status: "CANCELLED",
        pickupLatitude: coords.pickupLat,
        pickupLongitude: coords.pickupLng,
        pickupAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        dropoffLatitude: coords.dropoffLat,
        dropoffLongitude: coords.dropoffLng,
        dropoffAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        fareAmountMinor: null,
        currency: "USD",
        requestedAt,
      },
    });
    trips.push(trip);
  }

  // C. 5 IN_PROGRESS Active Trips (distinct riders 0..4, distinct drivers 0..4)
  for (let i = 0; i < 5; i++) {
    const rider = riders[i];
    const driver = drivers[i];
    const coords = randomCoords();
    const requestedAt = new Date(Date.now() - 15 * 60 * 1000);
    const startedAt = new Date(Date.now() - 10 * 60 * 1000);

    const trip = await prisma.trip.create({
      data: {
        riderId: rider.id,
        driverId: driver.id,
        driverNameSnapshot: driver.name,
        driverVehicleSnapshot: `${driver.vehicleModel} - ${driver.licensePlate}`,
        status: "IN_PROGRESS",
        pickupLatitude: coords.pickupLat,
        pickupLongitude: coords.pickupLng,
        pickupAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        dropoffLatitude: coords.dropoffLat,
        dropoffLongitude: coords.dropoffLng,
        dropoffAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        fareAmountMinor: null,
        currency: "USD",
        requestedAt,
        startedAt,
      },
    });
    trips.push(trip);
  }

  // D. 3 ACCEPTED Active Trips (distinct riders 5..7, distinct drivers 5..7)
  for (let i = 0; i < 3; i++) {
    const rider = riders[5 + i];
    const driver = drivers[5 + i];
    const coords = randomCoords();
    const requestedAt = new Date(Date.now() - 5 * 60 * 1000);

    const trip = await prisma.trip.create({
      data: {
        riderId: rider.id,
        driverId: driver.id,
        driverNameSnapshot: driver.name,
        driverVehicleSnapshot: `${driver.vehicleModel} - ${driver.licensePlate}`,
        status: "ACCEPTED",
        pickupLatitude: coords.pickupLat,
        pickupLongitude: coords.pickupLng,
        pickupAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        dropoffLatitude: coords.dropoffLat,
        dropoffLongitude: coords.dropoffLng,
        dropoffAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        fareAmountMinor: null,
        currency: "USD",
        requestedAt,
      },
    });
    trips.push(trip);
  }

  // E. 2 REQUESTED Active Trips (distinct riders 8..9, no driver)
  for (let i = 0; i < 2; i++) {
    const rider = riders[8 + i];
    const coords = randomCoords();
    const requestedAt = new Date(Date.now() - 2 * 60 * 1000);

    const trip = await prisma.trip.create({
      data: {
        riderId: rider.id,
        driverId: null,
        status: "REQUESTED",
        pickupLatitude: coords.pickupLat,
        pickupLongitude: coords.pickupLng,
        pickupAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        dropoffLatitude: coords.dropoffLat,
        dropoffLongitude: coords.dropoffLng,
        dropoffAddress: `${faker.location.streetAddress()}, San Francisco, CA`,
        fareAmountMinor: null,
        currency: "USD",
        requestedAt,
      },
    });
    trips.push(trip);
  }

  console.log(`Seeded ${trips.length} trips total.`);
  console.log(`Seeded ${payments.length} payments for completed trips.`);
  console.log("--- Database Seeding Completed Successfully ---");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
