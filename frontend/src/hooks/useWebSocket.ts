import { useRef, useCallback, useEffect, useState } from 'react';
import type { Drawing, UndoMessage, ClearMessage, CursorPositionMessage } from '../types';

interface UseWebSocketOptions {
  roomId: string;
  onDrawingReceived: (drawing: Drawing) => void;
  onUndoReceived: (drawingId: string) => void;
  onClearReceived: () => void;
  onCursorReceived: (message: CursorPositionMessage) => void;
  onInit: (drawings: Drawing[]) => void;
  onRoomInvalid?: () => void;
  onReconnectFailed?: () => void;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;
const ROOM_INVALID_CODE = 4004;

export const useWebSocket = ({
  roomId,
  onDrawingReceived,
  onUndoReceived,
  onClearReceived,
  onCursorReceived,
  onInit,
  onRoomInvalid,
  onReconnectFailed,
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

    const host = window.location.hostname;
    const wsUrl = `ws://${host}:1111/ws/${roomId}`;

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
        } else if (data.type === 'undo') {
          onUndoReceived(data.drawingId);
        } else if (data.type === 'clear') {
          onClearReceived();
        } else if (data.type === 'cursor') {
          onCursorReceived(data);
        } else {
          onDrawingReceived(data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = (event) => {
      setStatus('disconnected');

      if (event.code === ROOM_INVALID_CODE) {
        onRoomInvalid?.();
        return;
      }

      if (!manualDisconnectRef.current) {
        if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else {
          onReconnectFailed?.();
        }
      }
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    wsRef.current = ws;
  }, [roomId, onDrawingReceived, onUndoReceived, onClearReceived, onCursorReceived, onInit, onRoomInvalid, onReconnectFailed, clearReconnectTimer]);

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

  const sendUndo = useCallback((drawingId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: UndoMessage = { type: 'undo', drawingId };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendClear = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: ClearMessage = { type: 'clear' };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendCursor = useCallback((message: CursorPositionMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (roomId) {
      connect();
    }
    return () => disconnect();
  }, [roomId, connect, disconnect]);

  return { sendDrawing, sendUndo, sendClear, sendCursor, status, reconnect: connect };
};
