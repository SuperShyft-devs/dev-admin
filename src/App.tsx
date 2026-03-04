import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AdminLayout } from "./layouts/AdminLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Organisations } from "./features/organisations/Organisations";
import { Engagements } from "./features/engagements/Engagements";
import { Employees } from "./features/employees/Employees";
import { AssessmentPackages } from "./features/assessments/AssessmentPackages";

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
        <Route path="assessment-packages" element={<AssessmentPackages />} />
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
