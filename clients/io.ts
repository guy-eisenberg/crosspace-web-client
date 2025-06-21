import { io as _io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function io() {
  if (!socket)
    socket = _io(process.env.NEXT_PUBLIC_SITE_URL, {
      autoConnect: true,
      withCredentials: true,
      path: "/api/socket.io",
    });

  return socket;
}
