import { lazy } from "react";
import {
  Home,
  MessageSquare,
  Building2,
  Plug,
  BookOpen,
  GraduationCap,
  Wallet,
  Target,
  CalendarDays,
  RefreshCw,
  Gauge,
  BrainCircuit,
  Trophy,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "../../types";

export const ICON_ROUTE: Record<Route, LucideIcon> = {
  inicio: Home,
  chat: MessageSquare,
  escritorio: Building2,
  conexoes: Plug,
  journal: BookOpen,
  estudos: GraduationCap,
  financas: Wallet,
  metas: Target,
  calendario: CalendarDays,
  atualizacao: RefreshCw,
  ia: BrainCircuit,
  consumo: Gauge,
  conquistas: Trophy,
  configuracoes: Settings,
};

export const PAGE_ROUTE: Record<Route, React.LazyExoticComponent<() => React.JSX.Element>> = {
  inicio: lazy(() => import("../../features/home/Home")),
  chat: lazy(() => import("../../features/chat/Chat")),
  escritorio: lazy(() => import("../../features/office/Office")),
  conexoes: lazy(() => import("../../features/connections/Connections")),
  journal: lazy(() => import("../../features/journal/Journal")),
  estudos: lazy(() => import("../../features/studies/Studies")),
  financas: lazy(() => import("../../features/finances/Finances")),
  metas: lazy(() => import("../../features/goals/Goals")),
  calendario: lazy(() => import("../../features/calendar/Calendar")),
  atualizacao: lazy(() => import("../../features/updates/Update")),
  ia: lazy(() => import("../../features/ai/AiProviders")),
  consumo: lazy(() => import("../../features/ai-usage/AiUsage")),
  conquistas: lazy(() => import("../../features/achievements/Achievements")),
  configuracoes: lazy(() => import("../../features/settings/Settings")),
};
