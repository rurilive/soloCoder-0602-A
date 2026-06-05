import { useRef, useCallback, useEffect, useState } from 'react';
import type { Drawing } from '../types';

interface UseWebSocketOptions {
  roomId: string;
  onDrawingReceived: (drawing: Drawing) => void;
  onInit: (drawings: Drawing[]) => void;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

export const useWebSocket = ({
  roomId,
  onDrawingReceived,
  onInit,
}: UseWebSocketOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectCountRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!roomId) return;

    clearReconnectTimer();
    manualDisconnectRef.current = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:1111/ws/${roomId}`;

    setStatus('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('connected');
      reconnectCountRef.current = 0;
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
      if (!manualDisconnectRef.current && reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCountRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    wsRef.current = ws;
  }, [roomId, onDrawingReceived, onInit, clearReconnectTimer]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearReconnectTimer]);

  const sendDrawing = useCallback((drawing: Drawing) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(drawing));
    }
  }, []);

  useEffect(() => {
    if (roomId) {
      connect();
    }
    return () => disconnect();
  }, [roomId, connect, disconnect]);

  return { sendDrawing, status, reconnect: connect };
};
