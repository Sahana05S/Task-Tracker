import { readdirSync,readFileSync,statSync } from 'node:fs';
import { join } from 'node:path';
import { expect,it } from 'vitest';

// UTF-8 punctuation decoded as Windows-1252 and saved again (e.g. "·" -> "Â·").
const MOJIBAKE=/Â[ -¿]|â€[\u0080-⃿]/;
function sources(dir:string):string[] {
 return readdirSync(dir).flatMap(name=>{const path=join(dir,name);
  return statSync(path).isDirectory()?sources(path):/\.(ts|tsx)$/.test(name)?[path]:[];});
}
// Read once when the file loads, so a busy full run cannot push the disk scan past the test timeout.
const SOURCES=['app','modules','shared','types'].flatMap(sources).map(path=>({path,text:readFileSync(path,'utf8')}));
it('keeps user-facing source text free of mis-encoded punctuation',()=>{
 // A separator lost to a literal "?" between JSX expressions; a ternary cannot have this shape.
 const lostSeparator=/\} \? [a-z]+ \{/;
 // The same loss inside a string literal, e.g. ' ? Activity'.
 const lostInString=/' \? [A-Z][a-z]+'/;
 const offenders=SOURCES.filter(({text})=>MOJIBAKE.test(text)||lostSeparator.test(text)||lostInString.test(text)).map(({path})=>path);
 expect(offenders).toEqual([]);
});
