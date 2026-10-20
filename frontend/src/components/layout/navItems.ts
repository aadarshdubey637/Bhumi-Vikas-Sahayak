import { Calculator, FolderKanban, Hammer, Home, Ruler, Scale, type LucideIcon } from "lucide-react";

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
 * The core workflow only. Everything else keeps its route and stays reachable from where it is used:
 * Sources and Amendments from the Rulebook page, Feedback from every answer's "Report a problem", WhatsApp/Phone and About
 * from the sidebar footer. (Checked before removal: no page depends on a nav entry, only on its route.)
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groupWork",
    items: [
      { to: "/dashboard", key: "home", icon: Home, account: true },
      { to: "/assistant", key: "home", icon: Home, guestOnly: true },
      { to: "/workbench", key: "workbench", icon: Hammer },
      { to: "/plot-check", key: "plotCheck", icon: Ruler },
      { to: "/calculator", key: "calculator", icon: Calculator },
      { to: "/projects", key: "projects", icon: FolderKanban },
    ],
  },
  {
    labelKey: "nav.groupReference",
    items: [{ to: "/rules", key: "rules", icon: Scale }],
  },
];
