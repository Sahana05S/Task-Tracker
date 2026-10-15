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
 // A separator lost to a literal "?" between JSX expressions; a ternary cannot have this shape.
 const lostSeparator=/\} \? [a-z]+ \{/;
 const offenders=['app','components','lib'].flatMap(sources).filter(path=>{
  const text=readFileSync(path,'utf8');return MOJIBAKE.test(text)||lostSeparator.test(text);
 });
 expect(offenders).toEqual([]);
});
