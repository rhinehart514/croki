import { clsx, type ClassValue } from "clsx";

/**
 * Class-name joiner for the GTM IDE design system.
 *
 * Plain `clsx` — no `tailwind-merge`, because this DS does not use Tailwind:
 * styling comes from the hand-authored `styles.css` (tokens + component classes),
 * not from utility classes that would need merge-deduping.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
