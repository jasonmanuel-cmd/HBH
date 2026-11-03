// Deployment history, NOT a runtime feature flag. See docs/designs/lead-reliability.md.
// Once protocol can admit work, preactivation builds must never be served again.
export const COMMAND_PHASE = 'preactivation';
export function assertCommandBuild(env, phase = COMMAND_PHASE) {
  if (!['preactivation', 'protocol'].includes(phase)) throw new Error('Invalid command phase');
  if (phase === 'preactivation' && ['LEAD_RELIABILITY_ENABLED', 'LEAD_RELIABILITY_DISPATCH_ENABLED', 'SELLER_COMMAND_RECOVERY_ENABLED', 'SELLER_OUTBOX_DISPATCH_ENABLED'].some(key => env[key] === 'true')) {
    throw new Error('Protocol activation requires a reviewed protocol-phase release first');
  }
}
