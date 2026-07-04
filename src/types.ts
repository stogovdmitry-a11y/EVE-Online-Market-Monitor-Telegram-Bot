export interface Character {
  id: string; // Character ID in Eve Online
  name: string;
  avatar: string; // Image URL of the character
  activeOrdersCount: number;
  status: 'active' | 'invalid_token' | 'pending';
  registeredAt: string;
  isSimulated?: boolean;
}

export interface Order {
  id: string; // Order ID
  characterId: string;
  characterName: string;
  itemId: string; // EVE type_id
  itemName: string;
  isBuyOrder: boolean;
  price: number;
  locationId: string;
  locationName: string;
  bestPrice: number;
  status: 'best' | 'undercut' | 'checking' | 'error';
  volumeRemain: number;
  volumeTotal: number;
  lastChecked: string;
}

export interface BotSettings {
  telegramToken: string;
  intervalMinutes: number;
  botUsername?: string;
  isBotRunning: boolean;
  isSimulationMode: boolean;
  eveClientId?: string;
  eveClientSecret?: string;
}

export interface BotLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  type: 'bot' | 'market' | 'sso' | 'system';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}
