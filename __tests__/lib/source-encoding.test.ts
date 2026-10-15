import { readdirSync,readFileSync,statSync } from 'node:fs';
import { join } from 'node:path';
import { expect,it } from 'vitest';

// UTF-8 punctuation decoded as Windows-1252 and saved again (e.g. "·" -> "Â·").
const MOJIBAKE=/Â[ -¿]|â€[\u0080-⃿]/;
function sources(dir:string):string[] {
 return readdirSync(dir).flatMap(name=>{const path=join(dir,name);
  return statSync(path).isDirectory()?sources(path):/\.(ts|tsx)$/.test(name)?[path]:[];});
}
it('keeps user-facing source text free of mis-encoded punctuation',()=>{
 const offenders=['app','components','lib'].flatMap(sources).filter(path=>MOJIBAKE.test(readFileSync(path,'utf8')));
 expect(offenders).toEqual([]);
});
