import { cva } from 'class-variance-authority';

/** Inline feedback beside a field (limits, ratios): neutral, or tinted when good or wrong. */
export const liveHint = cva('rounded-ui px-2.5 py-1.5 text-[0.85rem]', {
  variants: {
    tone: {
      neutral: 'bg-[#eef1f4]',
      bad: 'bg-app-danger-bg text-app-danger',
      good: 'bg-app-ok-bg text-app-ok',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
