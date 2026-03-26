import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { DiagnosticFilters } from "./features/diagnostics/DiagnosticFilters";
import { SupportTickets } from "./features/support/SupportTickets";
import { ChecklistTemplates } from "./features/checklists/ChecklistTemplates";
import { MyTasks } from "./features/checklists/MyTasks";
import { Settings } from "./features/settings/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="organisations" element={<Organisations />} />
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
        <Route path="diagnostics" element={<Navigate to="/diagnostics/packages" replace />} />
        <Route path="diagnostics/packages" element={<DiagnosticPackages />} />
        <Route path="diagnostics/filters" element={<DiagnosticFilters />} />
        <Route path="checklists" element={<ChecklistTemplates />} />
        <Route path="my-tasks" element={<MyTasks />} />
        <Route path="support" element={<SupportTickets />} />
        <Route path="settings" element={<Settings />} />
      </Route>
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
