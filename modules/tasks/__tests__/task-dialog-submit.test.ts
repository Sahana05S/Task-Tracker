import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';

// Behavioural coverage is the M13 browser harness (tools/test_m13_core_browser.mjs
// `task`, `timerlog`, `attendance`): a refused command keeps typed text and
// selected participants. React 19 resets a form after every action unless a
// default-prevented onSubmit dispatches the action itself; the `action` prop must
// stay so server HTML blocks a native GET submission before hydration.
it('task dialog keeps input after refusal and blocks pre-hydration native submit',()=>{
 const source=readFileSync('modules/tasks/components/task-dialog.tsx','utf8');
 expect(source).toMatch(/<form\s+action=\{action\}\s+onSubmit=/);
 expect(source).toMatch(/event\.preventDefault\(\);[\s\S]*React\.startTransition\(\(\) => action\(data\)\)/);
});
it('execution form keeps input after refusal, resets on success and blocks pre-hydration submit',()=>{
 const source=readFileSync('shared/ui/execution-form.tsx','utf8');
 expect(source).toMatch(/<form ref=\{formRef\} action=\{submit\}[\s\S]*?onSubmit=/);
 expect(source).toMatch(/new FormData\(event\.currentTarget,\(event\.nativeEvent as SubmitEvent\)\.submitter\)/);
 expect(source).toMatch(/if \(result\.success\) \{ confirmed\(\); formRef\.current\?\.reset\(\);/);
});
