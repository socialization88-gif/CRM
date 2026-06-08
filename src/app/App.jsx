import { AuthProvider } from './providers/AuthProvider.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
