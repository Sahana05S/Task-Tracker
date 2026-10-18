export class UnmeasuredProgressError extends Error {
 constructor(message='Historical applied progress or its captured scale is unknown. Reconciliation is required before performance analytics.') { super(message); this.name='UnmeasuredProgressError'; }
}
