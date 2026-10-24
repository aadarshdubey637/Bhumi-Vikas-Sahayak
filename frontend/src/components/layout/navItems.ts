import { Hammer, Scale, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  key: string; // i18n key under nav.*
  icon: LucideIcon;
  end?: boolean;
  /** shown only to signed-in users (or when the server does not enforce accounts) */
  account?: boolean;
  /** shown only to visitors who are not signed in (they have no dashboard) */
  guestOnly?: boolean;
}
export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

/**
 * The core workflow only: the workbench and the rule book (saved projects are in the account menu). Everything else keeps its route and stays
 * reachable from where it is used (Sources and Amendments from the Rulebook page, Feedback from every answer's "Report a problem").
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groupWork",
    items: [
      { to: "/workbench", key: "workbench", icon: Hammer },
      { to: "/rules", key: "rules", icon: Scale },
    ],
  },
];
