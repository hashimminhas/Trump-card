import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;
  if (!socket) {
    socket = io('/', { auth: { token } });
  }
  return socket;
}

export function dropSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
