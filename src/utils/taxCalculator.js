function round2(n) {
  return Math.round(n * 100) / 100;
}

/** First 2 characters of GSTIN = state code (e.g. 24 for Gujarat) */
export function extractStateCodeFromGstin(gstin) {
  if (!gstin || typeof gstin !== "string") return null;
  const code = gstin.trim().substring(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

/** Intra-state → CGST+SGST; inter-state → IGST */
export function resolveSupplyType(sellerGstin, buyerGstin) {
  const sellerState = extractStateCodeFromGstin(sellerGstin);
  const buyerState = extractStateCodeFromGstin(buyerGstin);
  if (!sellerState || !buyerState) return "intra";
  return sellerState === buyerState ? "intra" : "inter";
}

export function splitGstTax(taxTotal, supplyType = "intra") {
  const tax = round2(taxTotal || 0);
  if (supplyType === "inter") {
    return { cgst: 0, sgst: 0, igst: tax };
  }
  const half = round2(tax / 2);
  return { cgst: half, sgst: round2(tax - half), igst: 0 };
}

export function splitCgstSgst(taxTotal) {
  return splitGstTax(taxTotal, "intra");
}

/**
 * @param {{ qty: number, unitPrice: number, taxRatePercent?: number, taxMode?: 'exclusive'|'inclusive' }}
 */
export function calculateLineTax({
  qty,
  unitPrice,
  taxRatePercent = 0,
  taxMode = "exclusive"
}) {
  const rate = (taxRatePercent || 0) / 100;
  const gross = qty * unitPrice;

  if (taxMode === "inclusive") {
    const taxable = rate > 0 ? gross / (1 + rate) : gross;
    const tax = gross - taxable;
    return {
      taxableAmount: round2(taxable),
      taxTotal: round2(tax),
      lineTotal: round2(gross)
    };
  }

  const taxable = gross;
  const tax = taxable * rate;
  return {
    taxableAmount: round2(taxable),
    taxTotal: round2(tax),
    lineTotal: round2(taxable + tax)
  };
}

export function applySupplyTypeToLineItem(item, supplyType) {
  const split = splitGstTax(item.taxTotal || 0, supplyType);
  item.cgst = split.cgst;
  item.sgst = split.sgst;
  item.igst = split.igst;
  return item;
}
