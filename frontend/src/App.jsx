import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app/*" element={<Dashboard />} />
            {/* Redirect old auth callbacks to /app */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
