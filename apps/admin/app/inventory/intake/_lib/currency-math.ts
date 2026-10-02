const banglaToEnglish = (str: string) => {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/[০-৯]/g, (match) => banglaDigits.indexOf(match).toString());
};

export function takaToPoisha(taka: string): number {
  if (typeof taka !== 'string' || taka.trim() === '') {
    throw new Error('Invalid amount');
  }

  let clean = taka.trim().replace(/,/g, '');
  clean = banglaToEnglish(clean);

  // Check if it's negative or has more than 2 decimals or invalid characters
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error('Invalid amount');
  }

  const parts = clean.split('.');
  const main = parts[0] || '0';
  let fraction = parts[1] || '';

  if (fraction.length === 1) {
    fraction += '0';
  } else if (fraction.length === 0) {
    fraction = '00';
  }

  const result = parseInt(main + fraction, 10);
  if (isNaN(result) || result < 0) {
    throw new Error('Invalid amount');
  }

  return result;
}

export function calculateProfit(sellingPriceTaka: string, unitCostTaka: string, transportCostTaka: string = '0'): number {
  if (!transportCostTaka || transportCostTaka.trim() === '') transportCostTaka = '0';
  const sellingPoisha = takaToPoisha(sellingPriceTaka);
  const costPoisha = takaToPoisha(unitCostTaka);
  const transportPoisha = takaToPoisha(transportCostTaka);
  
  return sellingPoisha - (costPoisha + transportPoisha);
}
