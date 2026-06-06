/**
 * Resolve stock deduction qty and packaging metadata for an order line.
 */
export function normalizeOrderItem(item, product) {
  const baseAbbrev =
    product?.unitId?.abbreviation || product?.unit || item.unit || "pcs";

  if (item.baseQty != null && item.baseQty > 0) {
    item.soldQty = item.soldQty ?? item.qty;
    item.soldUnit = item.soldUnit ?? item.unit ?? baseAbbrev;
    item.conversionFactor = item.conversionFactor ?? 1;
    item.qty = item.soldQty;
    return item.baseQty;
  }

  if (item.packagingUnitId && product?.packagingUnits?.length) {
    const pkg = product.packagingUnits.find(
      (p) => p.unitId?.toString() === item.packagingUnitId.toString() && p.isActive !== false
    );
    if (pkg) {
      const soldQty = item.soldQty ?? item.qty;
      const pkgUnit =
        typeof pkg.unitId === "object"
          ? pkg.unitId?.abbreviation || pkg.unitId?.name
          : null;
      item.soldQty = soldQty;
      item.soldUnit = item.soldUnit ?? pkgUnit ?? item.unit ?? baseAbbrev;
      item.conversionFactor = pkg.qtyPerUnit;
      item.baseQty = soldQty * pkg.qtyPerUnit;
      item.qty = soldQty;
      if (item.price === undefined || item.price === null) {
        item.price = pkg.price ?? product.price * pkg.qtyPerUnit;
      }
      return item.baseQty;
    }
  }

  const soldQty = item.soldQty ?? item.qty;
  item.soldQty = soldQty;
  item.soldUnit = item.soldUnit ?? baseAbbrev;
  item.conversionFactor = item.conversionFactor ?? 1;
  item.baseQty = soldQty;
  item.qty = soldQty;
  return item.baseQty;
}

export function getItemStockQty(item) {
  if (item.baseQty != null) return item.baseQty;
  if (item.conversionFactor && item.soldQty) return item.soldQty * item.conversionFactor;
  return item.qty;
}
