import { currentPeriod,resolvePeriod,type AnalyticsPeriod } from '@/lib/analytics/engine';
import { kolkataDate } from '@/lib/tasks/contract';
export interface ViewContext {period:AnalyticsPeriod;asOf:string;asOfLocalDate:string}
export const LIVE_AS_OF_LAG_MS=10_000;
export function viewContext(periodValue?:string,asOfValue?:string,now=new Date(),lagMs=LIVE_AS_OF_LAG_MS):ViewContext {
 // Hosted PostgreSQL may be a few seconds behind the app server. A small
 // observation lag keeps the default live request within the DB's nonfuture
 // boundary without admitting future evidence or changing explicit as-of input.
 // A database observation instant (see clock.ts) needs no lag.
 const observationNow=new Date(now.getTime()-lagMs);
 let period=currentPeriod(asOfValue?now:observationNow);
 if(periodValue){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodValue))throw new Error('Select a valid reporting month.');period=resolvePeriod(Number(periodValue.slice(0,4)),Number(periodValue.slice(5)));}
 const end=new Date(period.endDate+'T23:59:59.999+05:30');
 const asOf=asOfValue?new Date(asOfValue):new Date(Math.min(observationNow.getTime(),end.getTime()));
 if(!Number.isFinite(asOf.getTime())||asOf>now)throw new Error('Choose a valid nonfuture as-of time.');
 return {period,asOf:asOf.toISOString(),asOfLocalDate:kolkataDate(asOf)};
}
export function viewQuery(context:ViewContext):string {return new URLSearchParams({period:context.period.startDate.slice(0,7),asOf:context.asOf}).toString();}
export function nextDate(date:string):string {const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function previousDate(date:string):string {const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
