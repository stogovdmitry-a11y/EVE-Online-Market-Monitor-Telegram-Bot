export interface Character {
  id: string; // Character ID in Eve Online
  name: string;
  avatar: string; // Image URL of the character
  activeOrdersCount: number;
  status: 'active' | 'invalid_token' | 'pending';
  registeredAt: string;
  isSimulated?: boolean;
  chatId?: string;
  corporationId?: number;
  corporationName?: string;
}

export interface IndustryJob {
  id: string; // job_id
  characterId: string;
  characterName: string;
  isCorporation: boolean;
  activityId: number;
  activityName: string;
  blueprintTypeId: number;
  blueprintTypeName: string;
  productTypeId?: number;
  productTypeName?: string;
  installerId: number;
  installerName: string;
  status: string; // active, completed, etc.
  startDate: string;
  endDate: string;
  completedDate?: string | null;
  notified?: boolean; // Have we already sent a Telegram notification about completion?
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
  industryNotificationsEnabled?: boolean;
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
