'use client';
import { useState } from 'react';
export function CopyReport({text}:{text:string}){const [state,setState]=useState('');return <div><button className="rounded border px-3 py-2" onClick={async()=>{try{await navigator.clipboard.writeText(text);setState('Report copied.');}catch{setState('Copy unavailable. Use the text download.');}}}>Copy report text</button><span role="status" className="ml-2 text-sm">{state}</span></div>;}
