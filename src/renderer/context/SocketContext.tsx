import React, { createContext, useContext } from 'react';
import { useSocket, UseSocketReturn } from '../hooks/useSocket';

const SocketContext = createContext<UseSocketReturn | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const socketValue = useSocket();

  return (
    <SocketContext.Provider value={socketValue}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext(): UseSocketReturn {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return ctx;
}
