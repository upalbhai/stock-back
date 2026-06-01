import { connectDatabase } from "../config/db.js";
import { Unit } from "../models/Unit.js";

function makeKey(name, businessId) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0,32)}-${businessId.slice(-4)}`;
}

const STANDARD_UNITS = [
  { name: "Kilogram", abbreviation: "kg", sortOrder: 0 },
  { name: "Gram", abbreviation: "g", sortOrder: 1 },
  { name: "Litre", abbreviation: "L", sortOrder: 2 },
  { name: "Packet", abbreviation: "pkt", sortOrder: 3 },
  { name: "Piece", abbreviation: "pc", sortOrder: 4 }
];

export async function seedStandardUnits(businessId) {
  if (!businessId) throw new Error("businessId required");
  await connectDatabase();

  for (const u of STANDARD_UNITS) {
    const key = makeKey(u.name, businessId);
    await Unit.updateOne(
      { businessId, key },
      {
        $setOnInsert: {
          businessId,
          outletId: null,
          name: u.name,
          key,
          abbreviation: u.abbreviation,
          sortOrder: u.sortOrder ?? 0,
          isActive: true
        }
      },
      { upsert: true }
    );
    console.log(`Upserted unit: ${u.name}`);
  }

  console.log("Seeding complete");
}

// If run directly from node, accept businessId argument
if (require.main === module) {
  const businessId = process.argv[2];
  seedStandardUnits(businessId).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
