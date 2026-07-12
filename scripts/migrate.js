import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Product } from '../src/models/Product.js';
import { Inventory } from '../src/models/Inventory.js';

async function migrate() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI not found");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to DB");

  // Since we already modified the Product model to remove outletId, onHandQty etc.,
  // Mongoose will ignore those fields if we use the model to find them.
  // We MUST use the native mongodb driver or lean() to get the raw documents!
  // Actually, lean() just strips mongoose wrapper, it doesn't prevent mongoose from stripping unmapped fields during initial fetch if strict: true is on by default.
  // Wait, Mongoose returns what's in the DB if you use `.collection.find()`.
  
  const rawProducts = await mongoose.connection.collection('products').find({}).toArray();
  console.log(`Found ${rawProducts.length} raw products`);

  let migrated = 0;
  for (const raw of rawProducts) {
    if (raw.outletId) {
      // Check if inventory exists
      const existing = await Inventory.findOne({ productId: raw._id, outletId: raw.outletId });
      if (!existing) {
        await Inventory.create({
          businessId: raw.businessId,
          outletId: raw.outletId,
          productId: raw._id,
          onHandQty: raw.onHandQty || 0,
          lowStockThreshold: raw.lowStockThreshold || 10,
          isActive: raw.isActive !== false
        });
        migrated++;
      }
    }
  }

  console.log(`Migrated ${migrated} inventory records.`);
  
  // Optional: remove outletId and onHandQty from products collection?
  // We can leave them, Mongoose will ignore them, but to be clean:
  await mongoose.connection.collection('products').updateMany(
    {}, 
    { $unset: { outletId: 1, onHandQty: 1, lowStockThreshold: 1 } }
  );
  console.log("Cleaned up old fields from products collection.");

  mongoose.disconnect();
  console.log("Done.");
}

migrate().catch(console.error);
