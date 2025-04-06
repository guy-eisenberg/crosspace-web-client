import { io as _io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function io() {
  if (!socket)
    socket = _io(
      process.env.NODE_ENV === "production"
        ? process.env.NEXT_PUBLIC_SITE_URL
        : process.env.NEXT_PUBLIC_API_URL,
      {
        withCredentials: true,
        path:
          process.env.NODE_ENV === "production" ? "/api/socket.io" : undefined,
      },
    );

  return socket;
}
