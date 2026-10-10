// WebSocket service for real-time Ambulance–Hospital coordination
const WS_URL = 'ws://localhost:8000/ws';

export type WsEventType =
  | 'ambulance_request_created'
  | 'ambulance_request_updated'
  | 'hospital_resources_updated'
  | 'hospital_capacity_synced'
  | 'request_redirected';

export interface WsMessage {
  type: WsEventType;
  data: Record<string, unknown>;
  ts: string;
}

type WsListener = (msg: WsMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<WsListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnectDelay = 2000;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WS] Connected to MediCare AI real-time feed');
        this.reconnectDelay = 2000;
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          this.listeners.forEach(fn => fn(msg));
        } catch (err) {
          console.warn('[WS] Failed to parse message', err);
        }
      };

      this.ws.onclose = () => {
        console.warn('[WS] Disconnected — attempting reconnect...');
        this.ws = null;
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 15000);
            this.connect();
          }, this.reconnectDelay);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (err) {
      console.warn('[WS] Failed to create WebSocket', err);
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(listener: WsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsService = new WebSocketService();
