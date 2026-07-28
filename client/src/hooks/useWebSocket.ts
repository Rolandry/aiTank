import { useEffect, useState, useCallback } from "react";
import { gameSocket, ConnectionState } from "../network/socket";

export function useWebSocket() {
  const [state, setState] = useState<ConnectionState>(gameSocket.getState());

  useEffect(() => {
    return gameSocket.onStateChange(setState);
  }, []);

  const connect = useCallback(() => gameSocket.connect(), []);
  const disconnect = useCallback(() => gameSocket.disconnect(), []);

  return {
    state,
    isConnected: state === ConnectionState.CONNECTED,
    isReconnecting: state === ConnectionState.RECONNECTING,
    connect,
    disconnect,
  };
}
