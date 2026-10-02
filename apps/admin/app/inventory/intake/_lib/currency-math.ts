export function takaToPoisha(taka: string): number {
  if (!taka) return 0;
  const clean = taka.replace(/,/g, '');
  const parts = clean.split('.');
  
  let main = parts[0] || '0';
  let fraction = parts[1] || '';
  fraction = fraction.padEnd(2, '0').slice(0, 2);

  return parseInt(main + fraction, 10);
}

export function calculateProfit(sellingPriceTaka: string, unitCostTaka: string, transportCostTaka: string = '0'): number {
  const sellingPoisha = takaToPoisha(sellingPriceTaka);
  const costPoisha = takaToPoisha(unitCostTaka);
  const transportPoisha = takaToPoisha(transportCostTaka);
  
  return sellingPoisha - (costPoisha + transportPoisha);
}
