import { getMonthlyUsage, incrementMonthlyUsage } from './db/usage-repo.js';

export const PLAN_CAPS = {
  free_preview: {
    variantsPerTask: 100,
    tasksPerMonth: 3
  },
  standard: {
    variantsPerTask: 5000,
    tasksPerMonth: 20
  },
  founding_10: {
    variantsPerTask: 5000,
    tasksPerMonth: 20
  },
  pro: {
    variantsPerTask: 50000,
    tasksPerMonth: null
  },
  scale: {
    variantsPerTask: 250000,
    tasksPerMonth: null
  }
};

export function getYearMonth(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getPlanCaps(plan) {
  return PLAN_CAPS[plan] || PLAN_CAPS.free_preview;
}

export function incrementUsage(shop, affectedVariants, { now = new Date() } = {}) {
  const yearMonth = getYearMonth(now);
  incrementMonthlyUsage({
    shop,
    yearMonth,
    affectedVariants: Number(affectedVariants || 0)
  });
}

export function getUsage(shop, { now = new Date() } = {}) {
  const yearMonth = getYearMonth(now);
  return getMonthlyUsage({ shop, yearMonth });
}

export function getRemaining(shop, plan, { now = new Date(), affectedVariants = 0 } = {}) {
  const usage = getUsage(shop, { now });
  const planCaps = getPlanCaps(plan);
  const affectedVariantsInThisPreview = Number(affectedVariants || 0);
  const paywallDecision = evaluateUsageLimit({
    plan,
    affectedVariants: affectedVariantsInThisPreview,
    monthlyCompletedTasks: usage.completedTasks
  });
  const tasksLimit = planCaps.tasksPerMonth;
  const monthlyTasksRemaining = tasksLimit == null
    ? null
    : Math.max(0, tasksLimit - usage.completedTasks);

  return {
    currentPlan: plan || 'free_preview',
    planCaps,
    affectedVariantsInThisPreview,
    monthlyTasksUsed: usage.completedTasks,
    monthlyTasksRemaining,
    affectedVariantsTotalThisMonth: usage.affectedVariantsTotal,
    paywall: buildPaywall(paywallDecision, plan)
  };
}

export function evaluateUsageLimit({ plan, affectedVariants, monthlyCompletedTasks }) {
  const planCaps = getPlanCaps(plan);
  if (Number(affectedVariants || 0) > planCaps.variantsPerTask) {
    return {
      allowed: false,
      kind: 'variants_over_cap',
      cap: planCaps.variantsPerTask
    };
  }

  if (planCaps.tasksPerMonth != null && Number(monthlyCompletedTasks || 0) >= planCaps.tasksPerMonth) {
    return {
      allowed: false,
      kind: 'tasks_over_cap',
      cap: planCaps.tasksPerMonth
    };
  }

  return { allowed: true, kind: null, cap: null };
}

export function buildPaywall(decision, plan) {
  if (decision.allowed) {
    return {
      kind: null,
      shouldBlockApply: false,
      suggestedPlan: null,
      suggestedPlanPrice: null,
      upgradeUrl: null
    };
  }

  const suggestedPlan = plan === 'free_preview' ? 'standard' : 'pro';
  const suggestedPlanPrice = suggestedPlan === 'standard' ? '$9.99' : '$24.99';
  return {
    kind: decision.kind,
    shouldBlockApply: true,
    suggestedPlan,
    suggestedPlanPrice,
    upgradeUrl: `/billing/upgrade?plan=${suggestedPlan}`
  };
}
