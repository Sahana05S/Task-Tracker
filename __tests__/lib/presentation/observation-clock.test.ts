import { afterEach,describe,expect,it,vi } from 'vitest';

const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(async()=>({rpc}))}));
import { liveViewContext,observationInstant } from '@/lib/presentation/clock';

afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
describe('database-authoritative observation instant',()=>{
 it('truncates database microseconds so the instant never exceeds the database clock',async()=>{
  rpc.mockResolvedValue({data:'2026-10-15T09:59:58.123999+00:00',error:null});
  const observed=await observationInstant();
  expect(observed).toEqual({instant:new Date('2026-10-15T09:59:58.123Z'),source:'database'});
 });
 it('keeps whole-second and offset database values exact',async()=>{
  rpc.mockResolvedValue({data:'2026-10-15T15:29:58+05:30',error:null});
  expect((await observationInstant()).instant.toISOString()).toBe('2026-10-15T09:59:58.000Z');
 });
 it('falls back to the app clock minus the margin when the migration-30 function is unavailable',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:00.000Z'));
  rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
  expect(await observationInstant()).toEqual({instant:new Date('2026-10-15T09:59:50.000Z'),source:'margin'});
 });
 it('uses the database instant as the live as-of without an extra lag, even when the app clock runs ahead',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:30.000Z'));
  rpc.mockResolvedValue({data:'2026-10-15T09:59:58.123456+00:00',error:null});
  const context=await liveViewContext('2026-10');
  expect(context.asOf).toBe('2026-10-15T09:59:58.123Z');
 });
 it('still rejects an explicit as-of after the database clock',async()=>{
  rpc.mockResolvedValue({data:'2026-10-15T09:59:58.000000+00:00',error:null});
  await expect(liveViewContext('2026-10','2026-10-15T10:00:00.000Z')).rejects.toThrow(/nonfuture/);
 });
});
