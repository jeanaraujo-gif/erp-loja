// Exact decimal strings throughout: never convert monetary values to JS Number.
export function normalizeDecimal(value: string, scale: number) {
 const [integer,fraction='']=value.trim().replace(',','.').split('.');
 return `${BigInt(integer).toString()}.${fraction.padEnd(scale,'0')}`;
}
function cents(value: string) {return BigInt(value.replace('.',''));}
function fixed(value: bigint) {const sign=value<0n?'-':'';const digits=(value<0n?-value:value).toString().padStart(3,'0');return `${sign}${digits.slice(0,-2)}.${digits.slice(-2)}`;}
export function profit(cost: string, price: string) {
 const difference=cents(price)-cents(cost),sale=cents(price);
 const absolute=difference<0n?-difference:difference;
 const margin=sale===0n?null:fixed(((absolute*10000n+sale/2n)/sale)*(difference<0n?-1n:1n));
 return {grossProfit:fixed(difference),margin};
}
export function money(value: string) {
 const [integer,fraction='00']=value.split('.');
 return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${fraction.padEnd(2,'0')}`;
}
