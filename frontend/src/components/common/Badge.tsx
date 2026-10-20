import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Flag,
  HelpCircle,
  Info,
  Minus,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { TONE_CLASS, UNVERIFIED_CLASS, type IconName, type Tone } from "@/lib/status";

const ICONS: Record<IconName, LucideIcon> = {
  check: Check,
  info: Info,
  flag: Flag,
  help: HelpCircle,
  alert: AlertTriangle,
  empty: Ban,
  x: X,
  clock: Clock,
  minus: Minus,
};

/** Icon + text, never colour alone. */
export function Badge({
  tone,
  icon,
  outline,
  children,
  title,
}: {
  tone: Tone;
  icon: IconName;
  outline?: boolean;
  children: ReactNode;
  title?: string;
}) {
  const Icon = ICONS[icon];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${outline ? UNVERIFIED_CLASS : TONE_CLASS[tone]}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </span>
  );
}
