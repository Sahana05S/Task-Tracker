'use server';
import { writeDatedRecord } from '@/modules/records/actions';
export async function saveAttendanceRecord(form:FormData){form.set('kind','attendance');return writeDatedRecord(form);}
