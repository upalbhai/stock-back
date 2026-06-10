/** Resolve per-unit cost for base or packaging unit. */
export function resolveUnitCost(product, packagingUnitId) {
  if (packagingUnitId && product.packagingUnits?.length) {
    const pkgId = packagingUnitId.toString();
    const pkg = product.packagingUnits.find((p) => {
      const id = p.unitId?.toString?.() || String(p.unitId);
      return id === pkgId && p.isActive !== false;
    });
    if (pkg) {
      return pkg.costPrice ?? (product.costPrice ?? 0) * pkg.qtyPerUnit;
    }
  }
  return product.costPrice ?? 0;
}

/** Resolve per-unit sell price for base or packaging unit. */
export function resolveUnitSellPrice(product, packagingUnitId) {
  if (packagingUnitId && product.packagingUnits?.length) {
    const pkgId = packagingUnitId.toString();
    const pkg = product.packagingUnits.find((p) => {
      const id = p.unitId?.toString?.() || String(p.unitId);
      return id === pkgId && p.isActive !== false;
    });
    if (pkg) {
      return pkg.price ?? product.price * pkg.qtyPerUnit;
    }
  }
  return product.price ?? 0;
}

/** COGS for an order line. */
export function getOrderLineCost(product, item) {
  if (!product) return 0;
  const soldQty = item.soldQty ?? item.qty ?? 0;
  if (item.packagingUnitId) {
    return soldQty * resolveUnitCost(product, item.packagingUnitId);
  }
  const baseQty = item.baseQty ?? item.qty ?? 0;
  return baseQty * (product.costPrice ?? 0);
}

export function getMovementCount(entry) {
  if (entry.soldQty != null) return entry.soldQty;
  return Math.abs(entry.qty);
}

export const LOSS_REASONS = [
  "spoilage",
  "expiry",
  "damage",
  "customer_return_spoiled",
  "owner_replacement",
  "other"
];

export function lossReasonLabel(reason) {
  const map = {
    spoilage: "Spoilage",
    expiry: "Expired",
    damage: "Damaged",
    customer_return_spoiled: "Customer return (spoiled)",
    owner_replacement: "Owner replacement",
    other: "Other loss"
  };
  return map[reason] || reason || "Loss";
}
