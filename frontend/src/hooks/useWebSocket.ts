import { useRef, useCallback, useEffect, useState } from 'react';
import type { Drawing } from '../types';

interface UseWebSocketOptions {
  roomId: string;
  onDrawingReceived: (drawing: Drawing) => void;
  onInit: (drawings: Drawing[]) => void;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const useWebSocket = ({
  roomId,
  onDrawingReceived,
  onInit,
}: UseWebSocketOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//localhost:1111/ws/${roomId}`;

    setStatus('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          onInit(data.drawings);
        } else {
          onDrawingReceived(data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    wsRef.current = ws;
  }, [roomId, onDrawingReceived, onInit]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendDrawing = useCallback((drawing: Drawing) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(drawing));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { sendDrawing, status, reconnect: connect };
};
