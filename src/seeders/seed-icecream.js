import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import { User } from "../models/User.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { Unit } from "../models/Unit.js";
import { Inventory } from "../models/Inventory.js";

const MONGODB_URI = "mongodb://upalpatel0109_db_user:nyT7R99ENTLw1DJC@ac-8ym79eg-shard-00-00.28tdbfj.mongodb.net:27017,ac-8ym79eg-shard-00-01.28tdbfj.mongodb.net:27017,ac-8ym79eg-shard-00-02.28tdbfj.mongodb.net:27017/test?ssl=true&authSource=admin&replicaSet=atlas-zfqmmz-shard-0&retryWrites=true&w=majority";

const categoriesList = [
  "Cones", "Cups", "Sticks & Candies", "Family Packs", 
  "Party Packs (Party Tubs)", "Cassata", "Kulfis", 
  "Ice Cream Cakes", "Sundaes", "Sugar Free", 
  "Vegan & Dairy Free", "Premium Tubs", "Kids Specials", 
  "Thick Shakes", "Faloodas", "Novelties & Bars", 
  "Sandwiches", "Sorbet & Gelato", "Bulk Ice Creams", 
  "Festive Specials"
];

const brands = ["Havmor", "Hocco", "Amul", "Vadilal", "Baskin Robbins", "Kwality Wall's"];
const flavors = ["Vanilla", "Chocolate", "Strawberry", "Mango", "Pista", "Butterscotch", "Kesar Pista", "Black Current", "Cookies & Cream", "Coffee", "Tutti Frutti", "Rajbhog", "American Nuts"];

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Create or find User
  let user = await User.findOne({ email: "demo.icecream@minihisab.com" });
  if (!user) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("demo1234", salt);
    user = new User({
      name: "Ice Cream Demo Owner",
      email: "demo.icecream@minihisab.com",
      phone: faker.phone.number('9#########'),
      passwordHash: hash,
      role: "owner",
      emailVerified: true
    });
    await user.save();
    console.log("Created user.");
  } else {
    console.log("Found existing user.");
  }

  // Create or find Business
  let business = await Business.findOne({ email: "demo.icecream@minihisab.com" });
  if (!business) {
    business = new Business({
      name: "Cool Treats Ice Creams",
      code: "cooltreats_" + Date.now(),
      slug: "cooltreats_" + Date.now(),
      ownerId: user._id,
      email: "demo.icecream@minihisab.com",
      phone: faker.phone.number('9#########'),
      planType: "hybrid",
      subscriptionStatus: "active",
      isActive: true,
      features: ["retail_billing", "wholesale_billing", "packaging_units"],
      enabledFeatures: ["retail_billing", "wholesale_billing", "packaging_units"],
      address: faker.location.streetAddress() + ", " + faker.location.city()
    });
    await business.save();
    console.log("Created business.");
  } else {
    console.log("Found existing business.");
  }

  // Update user with businessId
  user.businessId = business._id;
  await user.save();

  // Create or find Outlet
  let outlet = await Outlet.findOne({ businessId: business._id });
  if (!outlet) {
    outlet = new Outlet({
      businessId: business._id,
      name: "Main Branch",
      code: "main_" + Date.now(),
      address: faker.location.streetAddress() + ", " + faker.location.city(),
      isActive: true,
      phone: faker.phone.number('9#########'),
      email: faker.internet.email(),
      billingModes: ["takeaway", "quick"]
    });
    await outlet.save();
    console.log("Created outlet.");
  }
  
  if (!user.outletIds.includes(outlet._id)) {
    user.outletIds.push(outlet._id);
    await user.save();
  }

  // Units
  let unitPcs = await Unit.findOne({ businessId: business._id, abbreviation: "pcs" });
  if (!unitPcs) {
    unitPcs = new Unit({ businessId: business._id, name: "Pieces", abbreviation: "pcs", key: "pcs", type: "count" });
    await unitPcs.save();
  }
  let unitBox = await Unit.findOne({ businessId: business._id, abbreviation: "box" });
  if (!unitBox) {
    unitBox = new Unit({ businessId: business._id, name: "Box", abbreviation: "box", key: "box", type: "count" });
    await unitBox.save();
  }

  // Clear old categories & products for this business to ensure fresh demo data
  await Category.deleteMany({ businessId: business._id });
  await Product.deleteMany({ businessId: business._id });
  await Inventory.deleteMany({ businessId: business._id });

  // Categories
  const categoryDocs = [];
  for (let i = 0; i < categoriesList.length; i++) {
    const cat = new Category({
      businessId: business._id,
      name: categoriesList[i],
      slug: faker.helpers.slugify(categoriesList[i]).toLowerCase() + "-" + faker.string.alphanumeric(4),
      isActive: true,
      description: faker.commerce.productDescription(),
      color: "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, "0")
    });
    await cat.save();
    categoryDocs.push(cat);
  }
  console.log(`Created ${categoryDocs.length} categories.`);

  // Products
  const products = [];
  for (let i = 0; i < 100; i++) {
    const brand = faker.helpers.arrayElement(brands);
    const flavor = faker.helpers.arrayElement(flavors);
    const cat = faker.helpers.arrayElement(categoryDocs);
    
    let typeName = cat.name.split(" ")[0]; // e.g. "Cones" -> "Cone"
    if (typeName.endsWith("s") && typeName.length > 1) typeName = typeName.substring(0, typeName.length - 1);

    const name = `${brand} ${flavor} ${typeName}`;
    const basePrice = faker.number.int({ min: 20, max: 500 });
    const costPrice = Math.floor(basePrice * faker.number.float({ min: 0.5, max: 0.8 }));
    
    // Some products get packaging units, some might not, but let's give most of them boxes.
    const qtyPerBox = faker.helpers.arrayElement([12, 24, 30, 48]);
    const boxDiscount = faker.number.float({ min: 0.85, max: 0.95 }); // 5% to 15% discount for bulk
    
    const prod = new Product({
      businessId: business._id,
      categoryId: cat._id,
      name: name,
      sku: faker.commerce.isbn(10), // Random 10 digit sku
      barcode: faker.commerce.isbn(13), // Random 13 digit barcode
      description: faker.commerce.productDescription(),
      unitId: unitPcs._id,
      unit: "pcs",
      price: basePrice,
      costPrice: costPrice,
      tags: [brand.toLowerCase(), flavor.toLowerCase(), typeName.toLowerCase()],
      packagingUnits: [
        {
          unitId: unitBox._id,
          qtyPerUnit: qtyPerBox,
          price: Math.floor(basePrice * qtyPerBox * boxDiscount),
          costPrice: costPrice * qtyPerBox,
          isActive: true
        }
      ],
      isActive: true,
      sortOrder: faker.number.int({ min: 1, max: 100 })
    });
    await prod.save();
    
    // Create inventory for the product in the outlet
    const inv = new Inventory({
      businessId: business._id,
      outletId: outlet._id,
      productId: prod._id,
      onHandQty: faker.number.int({ min: 10, max: 200 }),
      lowStockThreshold: 10,
      isActive: true
    });
    await inv.save();
    
    products.push(prod);
  }
  console.log(`Created ${products.length} products with inventory and packaging units.`);

  console.log("Seeding complete!");
  console.log("Login: demo.icecream@minihisab.com");
  console.log("Password: demo1234");
  
  mongoose.disconnect();
}

run().catch(console.error);
