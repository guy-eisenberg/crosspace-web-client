import LogRocket from "logrocket";

export function initLogRocket() {
  if (typeof window !== "undefined") {
    LogRocket.init(process.env.NEXT_PUBLIC_LOGROCKET_ID as string);
  }
}
