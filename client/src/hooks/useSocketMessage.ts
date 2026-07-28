import { useEffect } from "react";
import { gameSocket } from "../network/socket";
import type { ServerMessage } from "../types/protocol";

export function useSocketMessage<T extends ServerMessage["type"]>(
  type: T,
  handler: (msg: Extract<ServerMessage, { type: T }>) => void
): void {
  useEffect(() => {
    return gameSocket.on(type, handler);
  }, [type, handler]);
}
