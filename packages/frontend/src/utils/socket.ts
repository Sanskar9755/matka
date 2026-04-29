/**
 * Socket.IO client singleton.
 * Connects with the JWT from localStorage.
 */
import { io, Socket } from 'socket.io-client';

const TOKEN_KEY = 'matka_token';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem(TOKEN_KEY) ?? '';
    socket = io('/', {
      auth: { token },
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
