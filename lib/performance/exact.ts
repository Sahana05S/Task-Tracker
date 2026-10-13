/** Exact decimal/rational arithmetic. No floating-point intermediate or implicit rounding. */
export interface ExactValue { numerator:string; denominator:string }
export type ExactInput=string|number|ExactValue;
export class Exact {
  readonly n:bigint;readonly d:bigint;
  constructor(n:bigint,d:bigint=BigInt(1)) {
    if(d===BigInt(0))throw new Error('Missing nonzero denominator.');
    const sign=d<BigInt(0)?BigInt(-1):BigInt(1);n*=sign;d*=sign;
    let a=n<BigInt(0)?-n:n,b=d;while(b!==BigInt(0)){const r=a%b;a=b;b=r;}
    this.n=n/a;this.d=d/a;
  }
  static from(value:ExactInput):Exact {
    if(typeof value==='object')return new Exact(BigInt(value.numerator),BigInt(value.denominator));
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Finite measured number required.');
    const match=/^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(value));
    if(!match)throw new Error('Explicit finite decimal required.');
    const places=(match[3]?.length??0)-Number(match[4]??0);
    if(Math.abs(places)>1000)throw new Error('Decimal exponent exceeds the source contract.');
    const n=BigInt((match[1]==='-'?'-':'')+match[2]+(match[3]??''));
    return places>=0?new Exact(n,BigInt(10)**BigInt(places)):new Exact(n*BigInt(10)**BigInt(-places));
  }
  add(b:Exact):Exact{return new Exact(this.n*b.d+b.n*this.d,this.d*b.d);}
  sub(b:Exact):Exact{return new Exact(this.n*b.d-b.n*this.d,this.d*b.d);}
  mul(b:Exact):Exact{return new Exact(this.n*b.n,this.d*b.d);}
  div(b:Exact):Exact{return new Exact(this.n*b.d,this.d*b.n);}
  compare(b:Exact):number {const delta=this.n*b.d-b.n*this.d;return delta<BigInt(0)?-1:delta>BigInt(0)?1:0;}
  json():ExactValue{return {numerator:this.n.toString(),denominator:this.d.toString()};}
  number():number {const value=Number(this.n)/Number(this.d);if(!Number.isFinite(value))throw new Error('Source exceeds display range.');return value;}
  /** Caller chooses an approved presentation boundary; exact stored results are unaffected. */
  display(places:number):string {
    if(!Number.isInteger(places)||places<0||places>20)throw new Error('Explicit display precision required.');
    const factor=BigInt(10)**BigInt(places),absolute=this.n<BigInt(0)?-this.n:this.n;
    let scaled=absolute*factor/this.d;if(absolute*factor%this.d*BigInt(2)>=this.d)scaled+=BigInt(1);
    const digits=scaled.toString().padStart(places+1,'0');
    return (this.n<BigInt(0)&&scaled!==BigInt(0)?'-':'')+(places?digits.slice(0,-places)+'.'+digits.slice(-places):digits);
  }
}
export function exactMedian(values:readonly Exact[]):Exact|null {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a.compare(b)),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:sorted[middle-1].add(sorted[middle]).div(Exact.from(2));
}
/** Approved presentation boundary for performance values; null stays visibly missing. */
export function displayPerformance(value:ExactInput|null,places=6):string {
  return value===null?'\u2014':Exact.from(value).display(places);
}
