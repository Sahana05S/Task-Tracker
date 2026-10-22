/**
 * One quoted CSV cell. A value that a spreadsheet would read as a formula
 * (leading =, +, -, @ or a control character) is prefixed with an apostrophe.
 */
export function csvCell(value:unknown):string {let s=value==null?'':String(value);if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
