import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { IdentityProvider } from './context/IdentityContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <ThemeProvider>
      <IdentityProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/room/:channelId" element={<ChatPage />} />
              <Route path="/join" element={<JoinRedirect />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </IdentityProvider>
    </ThemeProvider>
  );
}

/**
 * /join?room=xxx&pubkey=yyy  → /room/xxx?pubkey=yyy
 * Handles the OOB invitation link format.
 */
function JoinRedirect() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const pubkey = params.get('pubkey');
  if (room) {
    return <Navigate to={`/room/${room}?pubkey=${pubkey ?? ''}`} replace />;
  }
  return <Navigate to="/" replace />;
}
