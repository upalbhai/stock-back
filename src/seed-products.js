import mongoose from "mongoose";
import dotenv from "dotenv";
import { Category } from "./models/Category.js";
import { Product } from "./models/Product.js";

dotenv.config();

// Edit these to match the target business / outlet
const BUSINESS_ID = "6a146b68fad778b59e20e321";
const OUTLET_ID = "6a146b68fad778b59e20e323";

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in .env file");
    }

    console.log("Connecting to Database...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully!");

    // Create categories (20)
    console.log("Creating categories (20)...");
    const CATEGORY_NAMES = [
      "Beverages",
      "Desserts",
      "Snacks",
      "Main Course",
      "Breakfast",
      "Salads",
      "Soups",
      "Sides",
      "Breads",
      "Seafood",
      "Poultry",
      "Vegetarian",
      "Vegan",
      "Sauces",
      "Condiments",
      "Frozen",
      "Drinks",
      "Sweets",
      "Kids Menu",
      "Combos"
    ];
    const emojiSet = [
      "🍹","🍰","🍿","🍛","🥐","🥗","🍜","🍟","🍞","🦞",
      "🍗","🥦","🌱","🧂","🫙","🧊","🥤","🍩","🧒","🍱"
    ];
    const categoryDocs = [];
    for (let i = 0; i < CATEGORY_NAMES.length; i++) {
      const name = CATEGORY_NAMES[i];
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const c = await Category.create({
        businessId: new mongoose.Types.ObjectId(BUSINESS_ID),
        outletId: new mongoose.Types.ObjectId(OUTLET_ID),
        name,
        slug,
        icon: emojiSet[i % emojiSet.length],
        color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`
      });
      categoryDocs.push(c);
    }

    console.log(`Created ${categoryDocs.length} categories`);

    // Create products in batches
    const total = 500;
    const batchSize = 100;
    console.log(`Creating ${total} products in batches of ${batchSize}...`);

    const units = ["pcs", "kg", "liter", "packet", "dozen", "box", "bottle", "gm"];
    const adjectives = ["Fresh","Classic","Spicy","Creamy","Crispy","Zesty","Sweet","Savoury","Hot","Chilled","Cocoa","Buttery","Tangy","Herbed","Smoky"];
    const nouns = ["Lassi","Shake","Sandwich","Roll","Biryani","Curry","Pancake","Wrap","Tikka","Burger","Pizza","Pie","Nuggets","Fries","Salad","Soup"];

    for (let start = 0; start < total; start += batchSize) {
      const batch = [];
      const end = Math.min(start + batchSize, total);
      for (let i = start; i < end; i++) {
        const idx = i + 1;
        const adj = adjectives[idx % adjectives.length];
        const noun = nouns[idx % nouns.length];
        const name = `${adj} ${noun} ${String(idx).padStart(3, "0")}`;
        const price = rand(20, 300);
        const costPrice = Math.max(0, price - rand(5, 50));
        const onHandQty = rand(0, 200);
        const lowStockThreshold = rand(5, 20);
        const category = categoryDocs[rand(0, categoryDocs.length - 1)];
        batch.push({
          businessId: new mongoose.Types.ObjectId(BUSINESS_ID),
          outletId: new mongoose.Types.ObjectId(OUTLET_ID),
          categoryId: category._id,
          name,
          description: `Auto-seeded product ${name}`,
          sku: `SKU-${String(idx).padStart(6, "0")}`,
          unit: units[idx % units.length],
          price,
          costPrice,
          taxRate: 0,
          gstRate: 0,
          onHandQty,
          lowStockThreshold,
          isActive: true,
          sortOrder: 0
        });
      }
      await Product.insertMany(batch);
      console.log(`Inserted products ${start + 1} - ${end}`);
    }

    console.log("Seeding complete!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
}

seed();
