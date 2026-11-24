import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  LayoutDashboard,
  Route,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  readonly href: "/" | "/simulation" | "/fleet" | "/missions" | "/incidents" | "/analytics" | "/settings";
  readonly label: string;
  readonly section: "Operate" | "Monitor" | "System";
  readonly description: string;
  readonly icon: LucideIcon;
  readonly shortcut: string;
  /** Whether the scenario selector is relevant in the top bar. */
  readonly scenarioScoped: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Overview",
    section: "Operate",
    description: "Fleet and mission status at a glance",
    icon: LayoutDashboard,
    shortcut: "1",
    scenarioScoped: true,
  },
  {
    href: "/simulation",
    label: "Simulation Studio",
    section: "Operate",
    description: "Warehouse canvas, playback and inspection",
    icon: Activity,
    shortcut: "2",
    // The studio toolbar carries its own scenario selector.
    scenarioScoped: false,
  },
  {
    href: "/fleet",
    label: "Fleet",
    section: "Monitor",
    description: "Robot roster, telemetry and utilisation",
    icon: Bot,
    shortcut: "3",
    scenarioScoped: true,
  },
  {
    href: "/missions",
    label: "Missions",
    section: "Monitor",
    description: "Pickup and drop-off lifecycle",
    icon: Route,
    shortcut: "4",
    scenarioScoped: true,
  },
  {
    href: "/incidents",
    label: "Incidents",
    section: "Monitor",
    description: "Faults, conflict holds and alerts",
    icon: AlertTriangle,
    shortcut: "5",
    scenarioScoped: true,
  },
  {
    href: "/analytics",
    label: "Analytics",
    section: "Monitor",
    description: "Throughput, cycle time and utilisation",
    icon: BarChart3,
    shortcut: "6",
    scenarioScoped: true,
  },
  {
    href: "/settings",
    label: "Settings",
    section: "System",
    description: "Display and playback preferences",
    icon: Settings,
    shortcut: "7",
    scenarioScoped: false,
  },
];

export function navItemFor(pathname: string): NavItem {
  return (
    NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href)) ??
    NAV_ITEMS[0]
  );
}
