import { POLICIES, type Plan, type Policy } from '../types/policy.js';

export function policyFor(plan: Plan | undefined): Policy {
  return POLICIES[plan === 'PREMIUM' ? 'PREMIUM' : 'FREE'];
}
