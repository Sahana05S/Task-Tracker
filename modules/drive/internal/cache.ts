// PRIVATE. Views that show Drive jobs and assets.
import { revalidatePath } from 'next/cache';

export function revalidateDriveViews(){revalidatePath('/task-tools');revalidatePath('/tasks/[taskTag]','page');}
