import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RootLayout } from "@/components/layout/RootLayout";
import { RouteError } from "@/components/common/FatalError";
import { RequireAccount } from "@/components/layout/RequireAccount";
import { LoadingSkeleton } from "@/components/common/States";
import About from "@/pages/About";
import Amendments from "@/pages/Amendments";
import AccessKey from "@/pages/AccessKey";
import Ask from "@/pages/Ask";
import Assistant from "@/pages/Assistant";
import AssessmentDetail from "@/pages/AssessmentDetail";
import Channels from "@/pages/Channels";
import Dashboard from "@/pages/Dashboard";
import Feedback from "@/pages/Feedback";
import ForgotPassword from "@/pages/ForgotPassword";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/NotFound";
import ProjectDetail from "@/pages/ProjectDetail";
import Projects from "@/pages/Projects";
import RuleDetail from "@/pages/RuleDetail";
import RuleSearch from "@/pages/RuleSearch";
import Sources from "@/pages/Sources";
import Workbench from "@/pages/Workbench";

// Route-level code splitting for the heavier pages.
const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const routes = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <LoadingSkeleton />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/login", element: <Login /> },
      { path: "/signup", element: <Signup /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/access-key", element: <AccessKey /> },
      {
        element: <AppShell />,
        children: [
          { path: "/workbench", element: <Workbench /> },
          { path: "/assistant", element: <Assistant /> },
          { path: "/ask", element: <Ask /> },
          { path: "/rules", element: <RuleSearch /> },
          { path: "/rules/:ruleId", element: <RuleDetail /> },
          { path: "/calculator", lazy: lazyPage(() => import("@/pages/Calculator")) },
          { path: "/plot-check", lazy: lazyPage(() => import("@/pages/PlotCheck")) },
          {
            element: <RequireAccount />,
            children: [
              { path: "/dashboard", element: <Dashboard /> },
              { path: "/projects", element: <Projects /> },
              { path: "/projects/:id", element: <ProjectDetail /> },
              { path: "/assessments/:id", element: <AssessmentDetail /> },
              { path: "/assessments/:id/report", lazy: lazyPage(() => import("@/pages/Report")) },
            ],
          },
          { path: "/amendments", element: <Amendments /> },
          { path: "/channels", element: <Channels /> },
          { path: "/feedback", element: <Feedback /> },
          { path: "/sources", element: <Sources /> },
          { path: "/about", element: <About /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
