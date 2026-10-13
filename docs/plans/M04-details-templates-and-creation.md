# M04 — Task details, templates and both creation paths

Status: implemented awaiting native verification. Required predecessors: M03.

## Outcome

Create complete native task pages with structured SMART/IPO data and make manual and automatic generation converge on one initializer.

## Existing code and confirmed problems

Task-tools detail creation writes smart_goals/inputs/outputs but the detail page reads smart_specific etc. and prefixed IPO sections. Existing forms require manual tags; automatic initialization and genuine template population are not established.

## Implementation steps

1. Define one typed detail schema for SMART fields, description, Inputs/Process/Outputs, dependencies, reviewer notes, carryover and task links. Separate actual content from template instructions.
2. Map legacy detail keys to canonical fields without overwriting existing user content; flag ambiguous free text for review. Render all mapped fields in the native page.
3. Version task-detail/checklist templates and provide native template selection/clone semantics. Keep task instance content independent of later template edits unless migration is explicit.
4. Implement an idempotent initializer called by explicit Create Details and by the accepted valid-entry trigger. Validate minimal required fields; drafts/incomplete entries do not start external work.
5. Create task/detail/participant/template instances atomically and enqueue optional provider jobs. Multiple event deliveries create one initialized task page/checklist and one provider request.
6. Use stable task/report/profile links instead of spreadsheet-sheet names. Make carryover a real relation plus displayed link, not only text.
7. Align input labels, loading states and error recovery. Use readable selectors instead of section keys/UUIDs in routine user flows.

## Data and interface contract

Initializer input includes task ID/version, chosen template version and initialization operation ID. Result identifies native detail/checklist state and any queued provider job separately. Store canonical keys in one contract shared by actions and components.

## Acceptance and verification

- [x] Saving Specific/Measurable/etc. shows exactly those values in the matching panels.
- [x] Template seed instructions do not masquerade as completed SMART content.
- [x] Manual initialization and automatic valid-entry initialization produce equivalent native records.
- [x] Retries and concurrent triggers do not duplicate details/checklists/jobs.
- [x] Existing detail values survive migration; legacy mismatched keys are reconciled or visibly flagged.
- [x] Creating a task needs no Drive permission when only native functionality is requested.

## UI / workflow integration

Add structured editors, template selection and visible initialization status. Display provider work as pending/failed/succeeded independently of native task creation.

## Scope boundaries

Do not send provider requests here or import private sample task content as production defaults. Reuse current page structure rather than redesigning the entire app.

## Decisions and rollout

D07, D11, D12 settle template authority and auto validity. First implement native correctness; provider execution integrates in M10.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.

## Actual bounded implementation

Migration17_native_task_details_and_templates.sql implements the shared native
initializer, immutable template publication, content/link/relation commands and
legacy mapping/review flags. New task creation defaults to automatic native
initialization; explicit manual mode defers it. Both preserve valid Not Started
entries and converge without duplicates. Blank scaffolds remain uninitialized;
reviewed template nodes remain incomplete. No M05 rollup or provider execution.

See [M04 evidence](M04-evidence.md) and STATUS for actual checks. Native auth/API/
browser verification remains outstanding. Legacy template section conversion,
ambiguous content and source references require review, not invented defaults.
