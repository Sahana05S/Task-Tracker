'use client';
import { buttonVariants } from '@/shared/ui/button';
import { useState } from 'react';
import { cn } from '@/shared/utils';
export function CopyReport({text}:{text:string}){const [state,setState]=useState('');return <div className="flex flex-wrap items-center gap-2"><button className={cn(buttonVariants({ variant: 'outline' }), 'h-9')} onClick={async()=>{try{await navigator.clipboard.writeText(text);setState('Report copied.');}catch{setState('Copy unavailable. Use the text download.');}}}>Copy report text</button><span role="status" className="text-muted-foreground text-sm">{state}</span></div>;}
