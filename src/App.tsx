import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AdminLayout } from "./layouts/AdminLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Organisations } from "./features/organisations/Organisations";
import { Engagements } from "./features/engagements/Engagements";
import { Employees } from "./features/employees/Employees";
import { AssessmentPackages } from "./features/assessments/AssessmentPackages";
import { Users } from "./features/users/Users";
import { ParticipantJourneyPage } from "./features/users/ParticipantJourneyPage";
import { DiagnosticPackages } from "./features/diagnostics/DiagnosticPackages";
import { Bookings } from "./features/payments/Bookings";
import { DiagnosticFilterChips } from "./features/diagnostics/DiagnosticFilterChips";
import { SupportTickets } from "./features/support/SupportTickets";
import { ChecklistTemplates } from "./features/checklists/ChecklistTemplates";
import { HealthMetrics } from "./features/health-metrics/HealthMetrics";
import { MyTasks } from "./features/checklists/MyTasks";
import { Settings } from "./features/settings/Settings";
import { Experts } from "./features/experts/Experts";
import { Notifications } from "./features/notifications/Notifications";
import { EngagementConsolePage } from "./features/console/EngagementConsolePage";
import { ConsoleEngagementsPage } from "./features/console/ConsoleEngagementsPage";

import { loginPathWithRedirect } from "./lib/authStorage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        to={loginPathWithRedirect(location.pathname, location.search)}
        replace
      />
    );
  }
  return <>{children}</>;
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { employeeRole, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }
  if (employeeRole === "onboarding_assistant") {
    return <Navigate to="/engagements/console" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminOnlyRoute>
              <AdminLayout />
            </AdminOnlyRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="organisations" element={<Navigate to="/organisations/organizations" replace />} />
        <Route path="organisations/:tab" element={<Organisations />} />
        <Route path="engagements" element={<Engagements />} />
        <Route path="employees" element={<Employees />} />
        <Route
          path="assessments"
          element={<Navigate to="/assessments/packages" replace />}
        />
        <Route path="assessments/:tab" element={<AssessmentPackages />} />
        <Route
          path="assessment"
          element={<Navigate to="/assessments/packages" replace />}
        />
        <Route
          path="assessment/packages"
          element={<Navigate to="/assessments/packages" replace />}
        />
        <Route
          path="assessment/categories"
          element={<Navigate to="/assessments/categories" replace />}
        />
        <Route
          path="assessment/questions"
          element={<Navigate to="/assessments/questions" replace />}
        />
        <Route
          path="assessment-packages"
          element={<Navigate to="/assessments/packages" replace />}
        />
        <Route
          path="assessment-packages/packages"
          element={<Navigate to="/assessments/packages" replace />}
        />
        <Route
          path="assessment-packages/categories"
          element={<Navigate to="/assessments/categories" replace />}
        />
        <Route
          path="assessment-packages/questions"
          element={<Navigate to="/assessments/questions" replace />}
        />
        <Route path="users/:userId/journey" element={<ParticipantJourneyPage />} />
        <Route path="users" element={<Users />} />
        <Route path="experts" element={<Experts />} />
        <Route path="diagnostics" element={<Navigate to="/diagnostics/packages" replace />} />
        <Route path="diagnostics/packages" element={<DiagnosticPackages />} />
        <Route path="diagnostics/filters-chips" element={<DiagnosticFilterChips />} />
        <Route path="payments" element={<Navigate to="/payments/bookings" replace />} />
        <Route path="payments/bookings" element={<Bookings />} />
        <Route path="checklists" element={<ChecklistTemplates />} />
        <Route path="library/health-metrics" element={<HealthMetrics />} />
        <Route path="notifications" element={<Navigate to="/notifications/notifications" replace />} />
        <Route path="notifications/:tab" element={<Notifications />} />
        <Route
          path="admin/library/health-metrics"
          element={<Navigate to="/library/health-metrics" replace />}
        />
        <Route path="my-tasks" element={<MyTasks />} />
        <Route path="support" element={<SupportTickets />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route
        path="/engagements/console"
        element={
          <ProtectedRoute>
            <ConsoleEngagementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engagements/:engagementId/console"
        element={
          <ProtectedRoute>
            <EngagementConsolePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
