export type ToolType = 'rectangle' | 'pen';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingBase {
  id: string;
  color: string;
  strokeWidth: number;
}

export interface RectangleDrawing extends DrawingBase {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PenDrawing extends DrawingBase {
  type: 'pen';
  points: Point[];
}

export type Drawing = RectangleDrawing | PenDrawing;

export interface UndoMessage {
  type: 'undo';
  drawingId: string;
}

export interface ClearMessage {
  type: 'clear';
}

export interface CursorPositionMessage {
  type: 'cursor';
  userId: string;
  userNumber: number;
  userColor: string;
  x: number;
  y: number;
}

export interface UserCursor {
  userId: string;
  userNumber: number;
  userColor: string;
  x: number;
  y: number;
  lastUpdate: number;
}

export type DrawingMessage =
  | Drawing
  | { type: 'init'; drawings: Drawing[] }
  | UndoMessage
  | ClearMessage
  | CursorPositionMessage;
