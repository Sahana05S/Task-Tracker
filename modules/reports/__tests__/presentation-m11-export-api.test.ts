import { describe,it,expect,vi,beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({profile:vi.fn(),load:vi.fn(),archive:vi.fn()}));
vi.mock('@/shared/session/profile',()=>({getCurrentProfile:mocks.profile}));
vi.mock('@/modules/reports/internal/presentation/queries',()=>({getLivePresentation:mocks.load}));
vi.mock('@/modules/reports/internal/month/archive',()=>({monthRevision:mocks.archive,archivedReport:()=>({label:'Retained frozen revision'}),archivedText:()=> 'Retained frozen revision',archivedCsv:()=> 'revision\n2\n'}));
vi.mock('@/modules/reports/internal/presentation/clock',async()=>{const {viewContext}=await import('@/modules/reports/internal/presentation/context');return {liveViewContext:async(p?:string,a?:string)=>viewContext(p,a)};});
import { GET } from '@/app/api/reports/export/route';
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue({id:'own',role:'team_member',isActive:true});});
describe('M11 export API authorization and failure boundaries',()=>{
 it('denies unauthenticated and inactive callers before source reads',async()=>{for(const profile of [null,{id:'own',role:'team_member',isActive:false}]){mocks.profile.mockResolvedValue(profile);expect((await GET(new Request('http://localhost/api/reports/export'))).status).toBe(403);}expect(mocks.load).not.toHaveBeenCalled();});
 it('denies another employee to members and data managers',async()=>{for(const role of ['team_member','data_manager']){mocks.profile.mockResolvedValue({id:'own',role,isActive:true});expect((await GET(new Request('http://localhost/api/reports/export?employee=other'))).status).toBe(403);}expect(mocks.load).not.toHaveBeenCalled();});
 it('validates month and format without reading sources',async()=>{expect((await GET(new Request('http://localhost/api/reports/export?period=2026-99'))).status).toBe(400);expect((await GET(new Request('http://localhost/api/reports/export?format=exe'))).status).toBe(400);expect(mocks.load).not.toHaveBeenCalled();});
 it('returns a visible unavailable error when authorized source reading fails',async()=>{mocks.load.mockRejectedValue(new Error('database unavailable'));const r=await GET(new Request('http://localhost/api/reports/export?employee=own'));expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'Report evidence unavailable. Retry after the source or schema issue is resolved.'});});
 it('reads a selected immutable revision without querying live sources',async()=>{mocks.archive.mockResolvedValue({id:'retained'});const r=await GET(new Request('http://localhost/api/reports/export?period=2026-09&revision=2&format=json'));expect(r.status).toBe(200);expect(await r.json()).toEqual({label:'Retained frozen revision'});expect(mocks.archive).toHaveBeenCalledWith('2026-09-01',2,null);expect(mocks.load).not.toHaveBeenCalled();});
 it('rejects invalid revision input before archived or live source reads',async()=>{expect((await GET(new Request('http://localhost/api/reports/export?revision=0'))).status).toBe(400);expect(mocks.archive).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled();});
});
