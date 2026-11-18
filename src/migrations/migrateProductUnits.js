import { connectDatabase } from "../config/db.js";
import { Product } from "../models/Product.js";
import { Unit } from "../models/Unit.js";

function normalizeKey(str, businessId){
  return `${str.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32)}-${businessId.slice(-4)}`;
}

async function migrate() {
  await connectDatabase();
  const cursor = Product.find({ unitId: { $exists: false }, unit: { $exists: true, $ne: null } }).cursor();
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const businessId = doc.businessId.toString();
    const key = normalizeKey(doc.unit, businessId);
    let u = await Unit.findOne({ businessId, key });
    if (!u) {
      u = await Unit.create({ businessId, outletId: null, name: doc.unit, key, abbreviation: doc.unit, isActive: true });
    }
    await Product.updateOne({ _id: doc._id }, { $set: { unitId: u._id } });
    console.log(`Migrated product ${doc._id} -> unit ${u._id}`);
  }
  console.log('Migration complete');
  process.exit(0);
}

migrate().catch(e=>{ console.error(e); process.exit(1); });
