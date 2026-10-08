import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import socket from './socket/socket.js';

import Login from './pages/login.jsx'
import Playground from './pages/playground.jsx';
import Lobby from './pages/lobby.jsx';
import { Backdrop } from './ui';
import SocketEvents from './components/SocketEvents.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';


function App() {

  // Every server-side rejection arrives through one `error` event and is shown as a toast.
  useEffect(() => {
    const handleServerError = (payload) => {
      const message = typeof payload === 'string' ? payload : payload?.message;
      if (message) toast.error(message, { id: message });
    };
    socket.on('error', handleServerError);
    return () => socket.off('error', handleServerError);
  }, []);

  return (
    <div className="app-bg">
      <Backdrop />
      <Toaster position="top-center"
        toastOptions={{duration: 2000,
          style: {
            background: '#0f1f44',
            color: '#fff',
            borderRadius: '14px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '700',
          },
        }}
      />
      <BrowserRouter>
        <SocketEvents />
        <ConnectionStatus />
        <Routes>
          <Route path='/' element={<Login />} />
          <Route path='/playground/:roomCode' element={<Playground />} />
          <Route path="/room/:roomCode" element={<Lobby />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
