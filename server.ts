import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Character, Order, BotSettings, BotLog, ChatMessage } from './src/types';

const app = express();
app.set('trust proxy', true);
const PORT = 3000;

function getAppUrl(req: any) {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  let proto = req.protocol;
  if (req.headers['x-forwarded-proto'] === 'https' || req.get('host')?.includes('.run.app')) {
    proto = 'https';
  }
  return `${proto}://${req.get('host')}`;
}

app.use(express.json());

// Persistent DB File Path
const DB_PATH = path.join(process.cwd(), 'db.json');

// Interface for DB file structure
interface DatabaseState {
  settings: BotSettings;
  characters: Character[];
  tokens: {
    [characterId: string]: {
      refresh_token: string;
      access_token: string;
      expires_at: number;
    };
  };
  orders: Order[];
  logs: BotLog[];
}

// Initial/default DB structure
const defaultState: DatabaseState = {
  settings: {
    telegramToken: '',
    intervalMinutes: 5,
    botUsername: 'EveMarketMonitorBot',
    isBotRunning: false,
    isSimulationMode: true,
  },
  characters: [
    {
      id: '95465499',
      name: 'Stogov Dmitry',
      avatar: 'https://images.evetech.net/characters/95465499/portrait?size=128',
      activeOrdersCount: 2,
      status: 'active',
      registeredAt: new Date().toISOString(),
      isSimulated: true,
    },
    {
      id: '91234567',
      name: 'Alt Jita Trader',
      avatar: 'https://images.evetech.net/characters/91234567/portrait?size=128',
      activeOrdersCount: 1,
      status: 'active',
      registeredAt: new Date().toISOString(),
      isSimulated: true,
    }
  ],
  tokens: {},
  orders: [
    {
      id: 'ord-101',
      characterId: '95465499',
      characterName: 'Stogov Dmitry',
      itemId: '34',
      itemName: 'Tritanium',
      isBuyOrder: false,
      price: 5.25,
      locationId: '60003760',
      locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      bestPrice: 5.25,
      status: 'best',
      volumeRemain: 500000,
      volumeTotal: 1000000,
      lastChecked: new Date().toISOString()
    },
    {
      id: 'ord-102',
      characterId: '95465499',
      characterName: 'Stogov Dmitry',
      itemId: '35',
      itemName: 'Pyerite',
      isBuyOrder: true,
      price: 12.50,
      locationId: '60003760',
      locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      bestPrice: 12.45,
      status: 'best',
      volumeRemain: 250000,
      volumeTotal: 500000,
      lastChecked: new Date().toISOString()
    },
    {
      id: 'ord-103',
      characterId: '91234567',
      characterName: 'Alt Jita Trader',
      itemId: '12005',
      itemName: 'Ishtar',
      isBuyOrder: false,
      price: 245000000,
      locationId: '60003760',
      locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      bestPrice: 245000000,
      status: 'best',
      volumeRemain: 5,
      volumeTotal: 10,
      lastChecked: new Date().toISOString()
    }
  ],
  logs: [
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      level: 'success',
      message: 'System loaded successfully. Simulation mode active with 2 demo characters.',
      type: 'system'
    }
  ]
};

// Memory cache of DB state to prevent redundant disk I/O
let dbState: DatabaseState = { ...defaultState };

// Load State
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      // Merge with defaultState to handle newly introduced keys gracefully
      dbState = {
        settings: { ...defaultState.settings, ...parsed.settings },
        characters: parsed.characters || defaultState.characters,
        tokens: parsed.tokens || defaultState.tokens,
        orders: parsed.orders || defaultState.orders,
        logs: parsed.logs || defaultState.logs
      };
    } else {
      dbState = { ...defaultState };
      saveDB();
    }
  } catch (err) {
    console.error('Error loading DB, resetting to default', err);
    dbState = { ...defaultState };
  }
}

// Save State
function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(dbState, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB file', err);
  }
}

// Write a log helper
function addLog(level: 'info' | 'warning' | 'error' | 'success', message: string, type: 'bot' | 'market' | 'sso' | 'system') {
  const newLog: BotLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    type
  };
  dbState.logs.unshift(newLog);
  if (dbState.logs.length > 150) {
    dbState.logs = dbState.logs.slice(0, 150);
  }
  saveDB();
  console.log(`[LOG - ${type.toUpperCase()} - ${level.toUpperCase()}] ${message}`);
}

// Initialize Database State
loadDB();

// Cache for resolved EVE Universe names (item type IDs and solar system/station IDs)
const nameCache: { [id: string]: string } = {
  '34': 'Tritanium',
  '35': 'Pyerite',
  '36': 'Mexallon',
  '37': 'Isogen',
  '38': 'Nocxium',
  '39': 'Zydrine',
  '40': 'Megacyon',
  '12005': 'Ishtar',
  '60003760': 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  '30000142': 'Jita',
  '10000002': 'The Forge'
};

// Helper to resolve EVE IDs one-by-one with intelligent caching and safety limits
async function resolveIndividualIds(ids: number[]) {
  // Resolve up to 15 items in parallel to avoid spamming / rate limiting
  const activeResolutions = ids.map(async (id) => {
    if (nameCache[String(id)]) return;

    try {
      if (id < 200000) {
        // Resolve Type name
        const res = await fetch(`https://esi.evetech.net/latest/universe/types/${id}/?datasource=tranquility`);
        if (res.ok) {
          const data = await res.json() as { name: string };
          if (data && data.name) {
            nameCache[String(id)] = data.name;
          }
        }
      } else if (id >= 60000000 && id < 64000000) {
        // Resolve NPC Station name
        const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${id}/?datasource=tranquility`);
        if (res.ok) {
          const data = await res.json() as { name: string };
          if (data && data.name) {
            nameCache[String(id)] = data.name;
          }
        }
      } else if (id >= 30000000 && id < 32000000) {
        // Resolve Solar System name
        const res = await fetch(`https://esi.evetech.net/latest/universe/systems/${id}/?datasource=tranquility`);
        if (res.ok) {
          const data = await res.json() as { name: string };
          if (data && data.name) {
            nameCache[String(id)] = data.name;
          }
        }
      } else if (id >= 10000000 && id < 12000000) {
        // Resolve Region name
        const res = await fetch(`https://esi.evetech.net/latest/universe/regions/${id}/?datasource=tranquility`);
        if (res.ok) {
          const data = await res.json() as { name: string };
          if (data && data.name) {
            nameCache[String(id)] = data.name;
          }
        }
      }
    } catch (err) {
      console.error(`Error resolving individual EVE ID ${id}:`, err);
    }

    // Default fallback if we failed to fetch
    if (!nameCache[String(id)]) {
      if (id < 200000) {
        nameCache[String(id)] = `Item ${id}`;
      } else {
        nameCache[String(id)] = `Entity ${id}`;
      }
    }
  });

  await Promise.all(activeResolutions);
}

// Resolve Name helper using EVE ESI bulk names resolver
async function resolveNames(ids: number[]): Promise<{ [id: string]: string }> {
  const uniqueIds = Array.from(new Set(ids));
  const unresolved = uniqueIds.filter(id => !nameCache[String(id)]);
  if (unresolved.length === 0) return nameCache;

  // Separate IDs into those suitable for bulk /universe/names/ and others
  const bulkCandidates = unresolved.filter(id => {
    const isType = id < 200000;
    const isSystem = id >= 30000000 && id < 32000000;
    const isStation = id >= 60000000 && id < 64000000;
    const isRegion = id >= 10000000 && id < 12000000;
    return isType || isSystem || isStation || isRegion;
  });

  const specialIds = unresolved.filter(id => !bulkCandidates.includes(id));

  // Map special IDs (like Citadels / player-owned structures) to friendly fallback names
  specialIds.forEach(id => {
    if (id > 1000000000000) {
      nameCache[String(id)] = `Player Structure (${id})`;
    } else {
      nameCache[String(id)] = `Entity (${id})`;
    }
  });

  if (bulkCandidates.length === 0) return nameCache;

  try {
    const chunkSize = 100;
    for (let i = 0; i < bulkCandidates.length; i += chunkSize) {
      const chunk = bulkCandidates.slice(i, i + chunkSize);
      const res = await fetch('https://esi.evetech.net/latest/universe/names/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });

      if (res.ok) {
        const data = await res.json() as { category: string, id: number, name: string }[];
        data.forEach(item => {
          nameCache[String(item.id)] = item.name;
        });
        addLog('info', `Resolved ${data.length} EVE universe entity names via bulk API.`, 'system');
      } else {
        const errorText = await res.text();
        addLog('warning', `Bulk name resolution failed (status ${res.status}): ${errorText}. Falling back to individual resolution.`, 'system');
        await resolveIndividualIds(chunk);
      }
    }
  } catch (err) {
    addLog('warning', `Error in bulk EVE name resolution: ${err instanceof Error ? err.message : String(err)}. Using individual resolution fallback.`, 'system');
    await resolveIndividualIds(bulkCandidates);
  }

  // Double check if any candidates remain unresolved (e.g. if ESI bulk skipped them)
  const remainingUnresolved = bulkCandidates.filter(id => !nameCache[String(id)]);
  if (remainingUnresolved.length > 0) {
    await resolveIndividualIds(remainingUnresolved);
  }

  return nameCache;
}

// Global variable holding the running Telegram long-polling context
let telegramPollTimeout: NodeJS.Timeout | null = null;
let lastUpdateId = 0;

// EVE ESI SSO exchange helper
async function exchangeAuthorizationCode(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://login.eveonline.com/v2/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SSO Code Exchange failed: ${response.statusText}. Response: ${errorBody}`);
  }

  return response.json() as Promise<{
    access_token: string;
    expires_in: number;
    refresh_token: string;
  }>;
}

// Fetch verify token details (Character ID & Name)
async function verifyCharacterToken(accessToken: string) {
  const response = await fetch('https://login.eveonline.com/oauth/verify', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Character Verification failed: ${response.statusText}`);
  }

  return response.json() as Promise<{
    CharacterID: number;
    CharacterName: string;
    Scopes: string;
    ExpiresOn: string;
  }>;
}

// Refresh token helper
async function refreshCharacterToken(characterId: string, refreshToken: string, clientId: string, clientSecret: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://login.eveonline.com/v2/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`SSO Token Refresh failed: ${response.statusText}`);
  }

  const data = await response.json() as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
  };

  dbState.tokens[characterId] = {
    refresh_token: data.refresh_token || refreshToken, // fallback to old refresh token if new one is omitted
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000)
  };
  saveDB();

  return data.access_token;
}

// Check EVE Market Orders engine (Actual + Simulated)
async function performMarketCheck() {
  addLog('info', 'Market check initiated.', 'market');
  const { isSimulationMode, telegramToken } = dbState.settings;

  // Track if any orders changed from "best" to "undercut" to trigger bot message
  const notificationsToSend: {
    characterName: string;
    itemName: string;
    systemName: string;
    myPrice: number;
    bestPrice: number;
    isBuyOrder: boolean;
  }[] = [];

  if (isSimulationMode) {
    // SIMULATION MODE CHECK
    dbState.orders = dbState.orders.map(order => {
      // 30% chance to flip status in simulation to test triggers
      const shouldFlip = Math.random() < 0.35;
      let newStatus = order.status;
      let newBestPrice = order.bestPrice;

      if (shouldFlip) {
        if (order.status === 'best') {
          newStatus = 'undercut';
          // Beaten: Sell price goes lower, Buy price goes higher
          newBestPrice = order.isBuyOrder 
            ? order.price + parseFloat((Math.random() * 0.1 + 0.01).toFixed(2))
            : order.price - parseFloat((Math.random() * 0.1 + 0.01).toFixed(2));
          
          notificationsToSend.push({
            characterName: order.characterName,
            itemName: order.itemName,
            systemName: 'Jita',
            myPrice: order.price,
            bestPrice: newBestPrice,
            isBuyOrder: order.isBuyOrder
          });
        } else {
          newStatus = 'best';
          newBestPrice = order.price;
        }
      }

      return {
        ...order,
        status: newStatus,
        bestPrice: newBestPrice,
        lastChecked: new Date().toISOString()
      };
    });

    addLog('success', 'Market check complete (Simulation Mode). Simulated undercuts evaluated.', 'market');
  } else {
    // REAL MARKET CHECK VIA EVE ONLINE ESI
    const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID;
    const clientSecret = dbState.settings.eveClientSecret || process.env.EVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      addLog('error', 'Cannot perform real market check: EVE Developer Client ID or Client Secret is not set in settings or env.', 'market');
      return;
    }

    const realCharacters = dbState.characters.filter(c => !c.isSimulated);
    if (realCharacters.length === 0) {
      addLog('warning', 'Real market check skipped: No real EVE characters added. Switch to Simulation mode or login via EVE SSO.', 'market');
      return;
    }

    // Process each character's orders
    for (const char of realCharacters) {
      try {
        const tokenDetails = dbState.tokens[char.id];
        if (!tokenDetails) {
          char.status = 'invalid_token';
          addLog('error', `Token details missing for character: ${char.name}`, 'sso');
          continue;
        }

        let accessToken = tokenDetails.access_token;
        // Refresh token if expired or close to expiring (within 1 min)
        if (Date.now() + 60000 > tokenDetails.expires_at) {
          addLog('info', `Refreshing EVE OAuth access token for ${char.name}...`, 'sso');
          accessToken = await refreshCharacterToken(char.id, tokenDetails.refresh_token, clientId, clientSecret);
          addLog('success', `EVE OAuth access token refreshed for ${char.name}.`, 'sso');
        }

        // Fetch character orders
        const ordersUrl = `https://esi.evetech.net/latest/characters/${char.id}/orders/?datasource=tranquility`;
        const ordersRes = await fetch(ordersUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!ordersRes.ok) {
          if (ordersRes.status === 401 || ordersRes.status === 403) {
            char.status = 'invalid_token';
            addLog('error', `Authorization error fetching orders for ${char.name}. Marking token invalid.`, 'sso');
            saveDB();
          } else {
            addLog('error', `Error fetching orders for ${char.name}: ${ordersRes.statusText}`, 'market');
          }
          continue;
        }

        const charOrders = await ordersRes.json() as any[];
        char.status = 'active';
        char.activeOrdersCount = charOrders.length;
        saveDB();

        // If character has no active orders, skip
        if (charOrders.length === 0) {
          // Remove outdated orders for this character from database
          dbState.orders = dbState.orders.filter(o => o.characterId !== char.id);
          saveDB();
          continue;
        }

        // Collect all EVE universe IDs that need naming resolution
        const universeIdsToResolve: number[] = [];
        charOrders.forEach(co => {
          universeIdsToResolve.push(co.type_id);
          universeIdsToResolve.push(co.location_id);
        });
        await resolveNames(universeIdsToResolve);

        // Process each active character order against public region markets
        const updatedOrders: Order[] = [];

        for (const co of charOrders) {
          // Keep track of names
          const itemName = nameCache[String(co.type_id)] || `Item ${co.type_id}`;
          const locationName = nameCache[String(co.location_id)] || `Station ${co.location_id}`;
          const systemName = co.location_id === 60003760 || co.location_id === 60003761 ? 'Jita' : 'The Forge';
          const isBuyOrder = !!co.is_buy_order;

          // We query market orders in Jita's region (The Forge = 10000002) for this specific type ID
          const regionId = 10000002;
          const marketUrl = `https://esi.evetech.net/latest/markets/${regionId}/orders/?datasource=tranquility&order_type=all&type_id=${co.type_id}`;
          
          let bestPrice = co.price;
          let orderStatus: 'best' | 'undercut' | 'error' = 'best';

          try {
            const marketRes = await fetch(marketUrl);
            if (marketRes.ok) {
              const marketOrders = await marketRes.json() as any[];
              
              // Filter orders specifically in the exact same location (NPC station or Upwell structure)
              const competingOrders = marketOrders.filter(mo => 
                mo.is_buy_order === isBuyOrder && 
                mo.location_id === co.location_id &&
                mo.order_id !== co.order_id // exclude our own order
              );

              // Logging and diagnostics for troubleshooting
              const sameLocationAll = marketOrders.filter(mo => mo.location_id === co.location_id && mo.is_buy_order === isBuyOrder);
              const isTargetItem = itemName.toLowerCase().includes('remote repair') || itemName.toLowerCase().includes('augmentor') || itemName.toLowerCase().includes('medium');
              
              if (isTargetItem) {
                const topPrices = [...marketOrders]
                  .filter(mo => mo.is_buy_order === isBuyOrder)
                  .sort((a, b) => isBuyOrder ? b.price - a.price : a.price - b.price)
                  .slice(0, 5)
                  .map(mo => `${mo.price.toLocaleString()} ISK (Loc: ${mo.location_id}, ID: ${mo.order_id}${mo.order_id === co.order_id ? ' [Mine]' : ''})`)
                  .join(' | ');

                addLog('info', `[MARKET DEBUG] "${itemName}" checked. Our Price: ${co.price.toLocaleString()} ISK at location ${co.location_id}. Found ${sameLocationAll.length} orders at this location. Top 5 region-wide prices: ${topPrices || 'None'}`, 'market');
              }

              if (isBuyOrder) {
                // For BUY order, we want our price to be the HIGHEST.
                // If there's a competing buy order with a higher price, we are undercut!
                if (competingOrders.length > 0) {
                  const highestPrice = Math.max(...competingOrders.map(mo => mo.price));
                  if (highestPrice > co.price) {
                    bestPrice = highestPrice;
                    orderStatus = 'undercut';
                  }
                }
              } else {
                // For SELL order, we want our price to be the LOWEST.
                // If there's a competing sell order with a lower price, we are undercut!
                if (competingOrders.length > 0) {
                  const lowestPrice = Math.min(...competingOrders.map(mo => mo.price));
                  if (lowestPrice < co.price) {
                    bestPrice = lowestPrice;
                    orderStatus = 'undercut';
                  }
                }
              }

              // Let the user know if their order is indeed undercut
              if (orderStatus === 'undercut') {
                addLog('warning', `Detected undercut for "${itemName}" at ${locationName}! Our price: ${co.price.toLocaleString()} ISK, Best price: ${bestPrice.toLocaleString()} ISK.`, 'market');
              }
            } else {
              orderStatus = 'error';
              addLog('error', `Failed to fetch public market details for ${itemName}: ${marketRes.statusText}`, 'market');
            }
          } catch (mErr) {
            console.error(`Error checking prices for item ${co.type_id}`, mErr);
            orderStatus = 'error';
          }

          // Look up if this order previously existed and was "best" but now "undercut" to trigger notification
          const previousOrder = dbState.orders.find(o => o.id === String(co.order_id));
          if (orderStatus === 'undercut' && (!previousOrder || previousOrder.status !== 'undercut')) {
            notificationsToSend.push({
               characterName: char.name,
               itemName,
               systemName,
               myPrice: co.price,
               bestPrice,
               isBuyOrder: isBuyOrder
            });
          }

          updatedOrders.push({
            id: String(co.order_id),
            characterId: char.id,
            characterName: char.name,
            itemId: String(co.type_id),
            itemName,
            isBuyOrder: isBuyOrder,
            price: co.price,
            locationId: String(co.location_id),
            locationName,
            bestPrice,
            status: orderStatus,
            volumeRemain: co.volume_remain,
            volumeTotal: co.volume_total,
            lastChecked: new Date().toISOString()
          });
        }

        // Clean out simulated or real orders for this character and append updated ones
        dbState.orders = dbState.orders.filter(o => o.characterId !== char.id).concat(updatedOrders);
        saveDB();
        addLog('success', `Completed market checking for ${char.name}. Verified ${charOrders.length} active orders.`, 'market');

      } catch (charErr) {
        addLog('error', `Error handling market check for character ${char.name}: ${charErr instanceof Error ? charErr.message : String(charErr)}`, 'market');
      }
    }
  }

  // Trigger Telegram messages for new undercuts!
  if (notificationsToSend.length > 0 && telegramToken) {
    addLog('info', `Sending ${notificationsToSend.length} undercut notifications to Telegram...`, 'bot');
    for (const notif of notificationsToSend) {
      const typeStr = notif.isBuyOrder ? 'BUY ORDER' : 'SELL ORDER';
      const indicatorStr = notif.isBuyOrder ? '🟢 Buy' : '🔴 Sell';
      const detailsStr = notif.isBuyOrder 
        ? `My Buy Price: ${notif.myPrice.toLocaleString()} ISK\n🔥 Highest Buy Price: ${notif.bestPrice.toLocaleString()} ISK (Beaten by ${(notif.bestPrice - notif.myPrice).toFixed(2)} ISK)`
        : `My Sell Price: ${notif.myPrice.toLocaleString()} ISK\n🔥 Lowest Sell Price: ${notif.bestPrice.toLocaleString()} ISK (Beaten by ${(notif.myPrice - notif.bestPrice).toFixed(2)} ISK)`;

      const messageText = `🚨 *EVE Market Monitor: UNDERCUT ALERT!*\n\n` +
                          `📦 *Item Name:* ${notif.itemName}\n` +
                          `🌌 *Solar System:* ${notif.systemName}\n` +
                          `📈 *Order Type:* ${typeStr}\n` +
                          `${detailsStr}\n` +
                          `👤 *Character:* ${notif.characterName}`;

      try {
        // Filter out any temporary non-numeric web chat IDs (e.g. "web_user_XXXXX")
        // Real Telegram chat IDs are numeric (e.g., "123456789" or "-1003765558697")
        const chatIds = Array.from(new Set(dbState.characters.map(c => (c as any).chatId).filter(Boolean)))
          .filter(id => /^-?\d+$/.test(id));
        
        if (chatIds.length === 0) {
          addLog('warning', `Could not send notification: No active, valid Telegram user chats have registered on this Telegram bot yet. Start the bot on Telegram and run /start first!`, 'bot');
          continue;
        }

        for (const chatId of chatIds) {
          const sendUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
          const response = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: messageText,
              parse_mode: 'Markdown'
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            addLog('error', `Telegram sendMessage failed for chat ${chatId}: ${response.status} (${errText})`, 'bot');
          } else {
            addLog('success', `Alert successfully sent to Telegram chat ${chatId} for item: ${notif.itemName}`, 'bot');
          }
        }
      } catch (tgErr) {
        addLog('error', `Failed to deliver Telegram message: ${tgErr instanceof Error ? tgErr.message : String(tgErr)}`, 'bot');
      }
    }
  }
}

// Background scheduler
let checkInterval: NodeJS.Timeout | null = null;
function startCheckScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  const ms = dbState.settings.intervalMinutes * 60 * 1000;
  checkInterval = setInterval(() => {
    performMarketCheck();
  }, ms);
  addLog('success', `Check scheduler running. Checking every ${dbState.settings.intervalMinutes} minutes.`, 'system');
}

// Start Scheduler
startCheckScheduler();

// Shared Command processing logic (used for both real Telegram API AND browser simulator!)
async function processBotMessage(chatId: string, username: string, text: string): Promise<string> {
  const cleanText = text.trim();
  const command = cleanText.split(' ')[0].toLowerCase();
  const args = cleanText.split(' ').slice(1);

  addLog('info', `Received command: "${cleanText}" from chatID: ${chatId} (${username})`, 'bot');

  // Automatically link any web-initiated characters to this real Telegram chatId when they interact with the bot!
  const isRealTelegram = chatId && !chatId.startsWith('simulation_user') && !chatId.startsWith('web_user') && chatId !== '123456789';
  if (isRealTelegram) {
    let linkedCount = 0;
    dbState.characters.forEach(c => {
      const charChatId = (c as any).chatId;
      if (!charChatId || charChatId.startsWith('web_user') || charChatId === 'unknown_web_user') {
        (c as any).chatId = chatId;
        linkedCount++;
      }
    });
    if (linkedCount > 0) {
      saveDB();
      addLog('success', `Automatically linked ${linkedCount} character(s) to Telegram Chat ID: ${chatId} (${username})`, 'bot');
    }
  }

  if (command === '/start') {
    return `👋 *Привет! Я EVE Market Monitor Bot!*\n\n` +
           `Я помогу тебе следить за твоими ордерами на покупку и продажу в Jita.\n` +
           `Если кто-то перебьет твою цену, я моментально пришлю тебе оповещение!\n\n` +
           `📋 *Доступные команды:*\n` +
           `🔹 /start - показать это меню и список всех команд\n` +
           `🔹 /add_character - добавить нового персонажа через EVE SSO\n` +
           `🔹 /characters - показать список добавленных персонажей\n` +
           `🔹 /delete_character <ID> - удалить персонажа по ID\n` +
           `🔹 /check - принудительно запустить проверку цен`;
  }

  if (command === '/add_character') {
    // Generate actual EVE SSO URL
    const appUrl = process.env.APP_URL || `http://localhost:3000`;
    const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID || 'MOCK_CLIENT_ID';
    const ssoUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(appUrl + '/api/auth/eve/callback')}&client_id=${clientId}&scope=esi-markets.read_character_orders.v1&state=${chatId}`;

    return `👤 *Добавление персонажа:*\n\n` +
           `Чтобы добавить персонажа, тебе нужно авторизовать его через официальный безопасный EVE SSO (Single Sign-On).\n\n` +
           `🔗 [Нажми сюда, чтобы войти с EVE SSO](${ssoUrl})\n\n` +
           `⚠️ *Важно:* Ссылка привяжет персонажа к твоему текущему Telegram-аккаунту (ID: \`${chatId}\`).\n` +
           `Если ты тестируешь в симуляторе, можешь добавить тестового персонажа прямо в веб-интерфейсе!`;
  }

  if (command === '/characters') {
    // Filter characters connected to this chat ID (or show all if in simulation/fallback)
    const chatChars = dbState.characters.filter(c => (c as any).chatId === chatId || c.isSimulated);
    
    if (chatChars.length === 0) {
      return `❌ *Список пуст!*\n\nУ тебя пока нет привязанных персонажей. Используй /add_character, чтобы добавить персонажа.`;
    }

    let responseText = `👤 *Мои привязанные персонажи:*\n\n`;
    chatChars.forEach((char, index) => {
      const simBadge = char.isSimulated ? ' 🧪 (Демо)' : '';
      responseText += `${index + 1}. *${char.name}* [ID: \`${char.id}\`]${simBadge}\n` +
                     `   └ Активных ордеров: ${char.activeOrdersCount} | Статус: ${char.status === 'active' ? '🟢 Активен' : '🔴 Нужен перезапуск'}\n\n`;
    });

    // Also append any currently undercut orders for these characters
    const charIds = chatChars.map(c => c.id);
    const undercutOrders = dbState.orders.filter(o => charIds.includes(o.characterId) && o.status === 'undercut');

    if (undercutOrders.length > 0) {
      responseText += `🚨 *ПЕРЕБИТЫЕ ОРДЕРА (${undercutOrders.length}):*\n\n`;
      undercutOrders.forEach(o => {
        const diff = Math.abs(o.bestPrice - o.price);
        const typeSymbol = o.isBuyOrder ? '🟢 Buy' : '🔴 Sell';
        responseText += `📦 *${o.itemName}* (${typeSymbol})\n` +
                       `  └ Твоя цена: \`${o.price.toLocaleString()}\` ISK\n` +
                       `  └ Лучшая цена: \`${o.bestPrice.toLocaleString()}\` ISK (Разница: \`-${diff.toLocaleString()}\` ISK)\n\n`;
      });
    } else {
      responseText += `✅ *Все твои ордера лидируют по цене на рынке!*`;
    }

    return responseText;
  }

  if (command === '/delete_character') {
    const charIdToDelete = args[0];
    if (!charIdToDelete) {
      return `❌ *Ошибка!*\n\nУкажи ID персонажа после команды, например:\n\`/delete_character 95465499\``;
    }

    const index = dbState.characters.findIndex(c => c.id === charIdToDelete);
    if (index === -1) {
      return `❌ *Персонаж с ID \`${charIdToDelete}\` не найден!*`;
    }

    const name = dbState.characters[index].name;
    dbState.characters.splice(index, 1);
    // Also remove any orders associated
    dbState.orders = dbState.orders.filter(o => o.characterId !== charIdToDelete);
    saveDB();

    addLog('success', `Character ${name} (ID: ${charIdToDelete}) deleted by command.`, 'bot');
    return `✅ Персонаж *${name}* (ID: \`${charIdToDelete}\`) успешно удален из мониторинга!`;
  }

  if (command === '/check') {
    // Ensure all characters of this user are mapped to this chat ID
    dbState.characters.forEach(c => {
      const charChatId = (c as any).chatId;
      if (!charChatId || charChatId.startsWith('web_user') || charChatId === 'unknown_web_user') {
        (c as any).chatId = chatId;
      }
    });

    // Reset order status in DB to 'checking' so that the upcoming check will force trigger notifications for any undercut orders!
    let resetCount = 0;
    dbState.orders.forEach(o => {
      const char = dbState.characters.find(c => c.id === o.characterId);
      if (char && (char as any).chatId === chatId) {
        o.status = 'checking';
        resetCount++;
      }
    });
    saveDB();

    if (resetCount > 0) {
      addLog('info', `Force-checking requested from Telegram. Reset ${resetCount} order statuses to trigger fresh alerts.`, 'bot');
    }

    // Trigger check asynchronously to respond to user fast
    performMarketCheck();

    return `🔍 *Запущена принудительная проверка рыночных ордеров...*\n\n` +
           `Проверяю цены в регионе Jita на наличие перебитых ордеров. ` +
           `Если будут найдены перебитые ордера, я пришлю новые алерты моментально!`;
  }

  // Fallback / Unknown command
  return `❓ *Неизвестная команда!*\n\nЯ не знаю команду \`${command}\`.\nИспользуй /start для вывода списка всех доступных команд.`;
}

// Telegram Bot Engine (Long Polling Client)
async function runTelegramPolling() {
  const token = dbState.settings.telegramToken;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId}&timeout=10`;
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json() as any;
      if (data.ok && data.result) {
        for (const update of data.result) {
          lastUpdateId = update.update_id + 1;
          const message = update.message;
          if (message && message.text) {
            const chatId = String(message.chat.id);
            const text = message.text;
            const fromUsername = message.from.username || message.from.first_name || 'EVE Pilot';

            // Generate reply
            const replyText = await processBotMessage(chatId, fromUsername, text);

            // Send reply back to user
            const sendUrl = `https://api.telegram.org/bot${token}/sendMessage`;
            await fetch(sendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: replyText,
                parse_mode: 'Markdown'
              })
            });
          }
        }
      }
    } else {
      const errorText = await response.text();
      
      if (response.status === 409) {
        addLog('warning', `Telegram longpoll returned 409 Conflict (overlapping instance detected). Retrying in 15 seconds...`, 'bot');
        // Do not disable bot in DB! Just schedule a retry in 15 seconds if bot is still supposed to run
        if (dbState.settings.isBotRunning && dbState.settings.telegramToken === token) {
          telegramPollTimeout = setTimeout(runTelegramPolling, 15000);
        }
        return;
      }

      addLog('error', `Telegram longpoll returned non-200 status: ${response.status} (${errorText}). Polling disabled permanently.`, 'bot');
      dbState.settings.isBotRunning = false;
      saveDB();
      return; // Stop polling on bad token
    }
  } catch (err) {
    console.error('Telegram polling loop error:', err);
  }

  // Continue polling if bot is still enabled
  if (dbState.settings.isBotRunning && dbState.settings.telegramToken === token) {
    telegramPollTimeout = setTimeout(runTelegramPolling, 1500);
  }
}

// Control starting/stopping of Telegram Polling Engine
function startTelegramBot() {
  const token = dbState.settings.telegramToken;
  if (token && dbState.settings.isBotRunning) {
    addLog('info', `Starting Telegram Bot engine with token: ${token.substring(0, 6)}...`, 'bot');
    if (telegramPollTimeout) {
      clearTimeout(telegramPollTimeout);
    }
    runTelegramPolling();
  } else {
    if (telegramPollTimeout) {
      clearTimeout(telegramPollTimeout);
      telegramPollTimeout = null;
    }
    addLog('info', 'Telegram Bot engine is stopped.', 'bot');
  }
}

// Initial bot startup
if (dbState.settings.isBotRunning) {
  startTelegramBot();
}


// --- REST API ENDPOINTS FOR CLIENT FRONTEND ---

// Get App Status
app.get('/api/status', (req, res) => {
  res.json({
    settings: dbState.settings,
    characters: dbState.characters,
    orders: dbState.orders,
    logs: dbState.logs
  });
});

// Update Settings
app.post('/api/settings', (req, res) => {
  const { telegramToken, intervalMinutes, isSimulationMode, eveClientId, eveClientSecret } = req.body;

  const oldToken = dbState.settings.telegramToken;
  const oldRunning = dbState.settings.isBotRunning;

  dbState.settings.telegramToken = telegramToken !== undefined ? telegramToken.trim() : dbState.settings.telegramToken;
  dbState.settings.intervalMinutes = intervalMinutes !== undefined ? Number(intervalMinutes) : dbState.settings.intervalMinutes;
  dbState.settings.isSimulationMode = isSimulationMode !== undefined ? Boolean(isSimulationMode) : dbState.settings.isSimulationMode;
  
  if (eveClientId !== undefined) dbState.settings.eveClientId = eveClientId.trim();
  if (eveClientSecret !== undefined) dbState.settings.eveClientSecret = eveClientSecret.trim();

  // If a Telegram Token is newly provided or removed, toggle run state
  if (dbState.settings.telegramToken) {
    dbState.settings.isBotRunning = true;
  } else {
    dbState.settings.isBotRunning = false;
  }

  saveDB();

  addLog('success', `Settings updated. Simulation: ${dbState.settings.isSimulationMode ? 'ON' : 'OFF'}. Bot active: ${dbState.settings.isBotRunning ? 'YES' : 'NO'}.`, 'system');

  // Trigger bot startup/restart if token or state changes
  if (oldToken !== dbState.settings.telegramToken || oldRunning !== dbState.settings.isBotRunning) {
    startTelegramBot();
  }

  // Trigger check scheduler update
  startCheckScheduler();

  res.json({
    success: true,
    settings: dbState.settings
  });
});

// Force Check
app.post('/api/check', async (req, res) => {
  await performMarketCheck();
  res.json({
    success: true,
    orders: dbState.orders,
    logs: dbState.logs
  });
});

// Manually Add Character (mainly for testing or public chars)
app.post('/api/characters/add', (req, res) => {
  const { id, name, isSimulated } = req.body;

  if (!id || !name) {
    return res.status(400).json({ success: false, error: 'Character ID and Name are required.' });
  }

  // Check if character already exists
  if (dbState.characters.some(c => c.id === String(id))) {
    return res.status(400).json({ success: false, error: 'Character already added.' });
  }

  const newChar: Character = {
    id: String(id),
    name,
    avatar: `https://images.evetech.net/characters/${id}/portrait?size=128`,
    activeOrdersCount: isSimulated ? Math.floor(Math.random() * 5) + 1 : 0,
    status: 'active',
    registeredAt: new Date().toISOString(),
    isSimulated: Boolean(isSimulated)
  };

  dbState.characters.push(newChar);

  // If simulated, create some random mock orders for them
  if (isSimulated) {
    const items = [
      { id: '36', name: 'Mexallon', price: 18.25, isBuy: false },
      { id: '37', name: 'Isogen', price: 112.00, isBuy: true },
      { id: '38', name: 'Nocxium', price: 420.50, isBuy: false }
    ];
    // Grab a random item
    const item = items[Math.floor(Math.random() * items.length)];
    const orderId = `ord-mock-${Date.now()}`;
    dbState.orders.push({
      id: orderId,
      characterId: String(id),
      characterName: name,
      itemId: item.id,
      itemName: item.name,
      isBuyOrder: item.isBuy,
      price: item.price,
      locationId: '60003760',
      locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      bestPrice: item.price,
      status: 'best',
      volumeRemain: Math.floor(Math.random() * 50000) + 1000,
      volumeTotal: 100000,
      lastChecked: new Date().toISOString()
    });
  }

  saveDB();
  addLog('success', `Character ${name} (ID: ${id}) added successfully.`, 'system');

  res.json({
    success: true,
    characters: dbState.characters,
    orders: dbState.orders
  });
});

// Delete Character
app.delete('/api/characters/:id', (req, res) => {
  const { id } = req.params;

  const index = dbState.characters.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Character not found.' });
  }

  const name = dbState.characters[index].name;
  dbState.characters.splice(index, 1);
  
  // Clean tokens and orders
  delete dbState.tokens[id];
  dbState.orders = dbState.orders.filter(o => o.characterId !== id);

  saveDB();
  addLog('success', `Character ${name} (ID: ${id}) deleted successfully.`, 'system');

  res.json({
    success: true,
    characters: dbState.characters,
    orders: dbState.orders
  });
});

// Simulate Telegram chat box message response
app.post('/api/chat/send', async (req, res) => {
  const { text, chatId } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text required' });
  }

  const userChatId = chatId || '123456789';
  const reply = await processBotMessage(userChatId, 'WebUser', text);

  res.json({
    reply,
    logs: dbState.logs,
    characters: dbState.characters,
    orders: dbState.orders
  });
});


// --- EVE SSO OAUTH REDIRECTS ---

// EVE Login Redirect Link Generator
app.get('/api/auth/eve/login', (req, res) => {
  const appUrl = getAppUrl(req);
  const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID;
  const userTelegramChatId = (req.query.chatId as string) || 'unknown_web_user';

  if (!clientId) {
    return res.status(400).send('EVE SSO Client ID is not configured in settings or environment variables.');
  }

  const ssoUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(appUrl + '/api/auth/eve/callback')}&client_id=${clientId}&scope=esi-markets.read_character_orders.v1&state=${userTelegramChatId}`;
  res.redirect(ssoUrl);
});

// EVE SSO Callback handler
app.get('/api/auth/eve/callback', async (req, res) => {
  const { code, state } = req.query; // state holds the telegram chatId if triggered from Telegram
  const appUrl = getAppUrl(req);
  const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID;
  const clientSecret = dbState.settings.eveClientSecret || process.env.EVE_CLIENT_SECRET;

  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  if (!clientId || !clientSecret) {
    addLog('error', 'EVE SSO authentication failed: Client ID or Client Secret not set in env or settings.', 'sso');
    return res.status(500).send('EVE SSO Client ID or Client Secret is not set on the server.');
  }

  try {
    // Check if this callback is for the simulated mock login to enable instant local SSO testing!
    if (code === 'mock_code_stogov' || dbState.settings.isSimulationMode) {
      // Mock Login Bypass
      const mockId = String(95000000 + Math.floor(Math.random() * 100000));
      const mockName = 'Pilot ' + ['Alex', 'Dmitry', 'Ivan', 'Valkyrie'][Math.floor(Math.random() * 4)];
      
      const newChar: Character = {
        id: mockId,
        name: mockName,
        avatar: `https://images.evetech.net/characters/${mockId}/portrait?size=128`,
        activeOrdersCount: 2,
        status: 'active',
        registeredAt: new Date().toISOString(),
        isSimulated: true
      };
      (newChar as any).chatId = String(state || '123456789');

      dbState.characters.push(newChar);

      // Create orders for them
      dbState.orders.push({
        id: `ord-mock-${Date.now()}-1`,
        characterId: mockId,
        characterName: mockName,
        itemId: '34',
        itemName: 'Tritanium',
        isBuyOrder: false,
        price: 5.15,
        locationId: '60003760',
        locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        bestPrice: 5.15,
        status: 'best',
        volumeRemain: 320000,
        volumeTotal: 500000,
        lastChecked: new Date().toISOString()
      });

      saveDB();
      addLog('success', `EVE SSO mock authorized for ${mockName} (ID: ${mockId})! Added to bot monitoring.`, 'sso');
      
      // Return HTML page to close popup and notify parent window via postMessage
      return res.send(`
        <html>
          <head>
            <title>EVE SSO Authorized</title>
            <style>
              body { background-color: #0d0f14; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { background-color: #1a2130; padding: 24px; border-radius: 12px; border: 1px solid #1e293b; max-width: 320px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
              h3 { color: #10b981; margin-top: 0; font-size: 18px; }
              p { font-size: 13px; color: #94a3b8; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <h3>Авторизация успешна!</h3>
              <p>Тестовый пилот <strong>${mockName}</strong> успешно подключен!</p>
              <p>Это окно закроется автоматически...</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', charName: '${mockName.replace(/'/g, "\\'")}' }, '*');
                setTimeout(function() { window.close(); }, 1200);
              } else {
                window.location.href = '/?sso_success=true&char_name=' + encodeURIComponent('${mockName.replace(/'/g, "\\'")}');
              }
            </script>
          </body>
        </html>
      `);
    }

    // Exchange actual OAuth code for Access + Refresh Tokens
    const tokenResponse = await exchangeAuthorizationCode(
      String(code),
      clientId,
      clientSecret,
      appUrl + '/api/auth/eve/callback'
    );

    // Verify token to get EVE Character ID and Name
    const verifyDetails = await verifyCharacterToken(tokenResponse.access_token);

    const characterId = String(verifyDetails.CharacterID);
    const characterName = verifyDetails.CharacterName;

    // Save tokens securely in server state
    dbState.tokens[characterId] = {
      refresh_token: tokenResponse.refresh_token,
      access_token: tokenResponse.access_token,
      expires_at: Date.now() + (tokenResponse.expires_in * 1000)
    };

    // Store character in db
    const existingCharIndex = dbState.characters.findIndex(c => c.id === characterId);
    const charData: Character = {
      id: characterId,
      name: characterName,
      avatar: `https://images.evetech.net/characters/${characterId}/portrait?size=128`,
      activeOrdersCount: 0,
      status: 'active',
      registeredAt: new Date().toISOString(),
      isSimulated: false
    };
    // Save associated Telegram Chat ID if SSO started from TG bot /state
    if (state && state !== 'unknown_web_user') {
      (charData as any).chatId = String(state);
    }

    if (existingCharIndex !== -1) {
      dbState.characters[existingCharIndex] = {
        ...dbState.characters[existingCharIndex],
        ...charData,
        status: 'active'
      };
    } else {
      dbState.characters.push(charData);
    }

    saveDB();
    addLog('success', `EVE SSO authorized and connected for character: ${characterName} (ID: ${characterId})!`, 'sso');

    // Perform check to populate active orders immediately for this new character
    performMarketCheck();

    // Return HTML page to close popup and notify parent window via postMessage
    res.send(`
      <html>
        <head>
          <title>EVE SSO Authorized</title>
          <style>
            body { background-color: #0d0f14; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background-color: #1a2130; padding: 24px; border-radius: 12px; border: 1px solid #1e293b; max-width: 320px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
            h3 { color: #10b981; margin-top: 0; font-size: 18px; }
            p { font-size: 13px; color: #94a3b8; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>Авторизация успешна!</h3>
            <p>Персонаж <strong>${characterName}</strong> успешно подключен!</p>
            <p>Это окно закроется автоматически...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', charName: '${characterName.replace(/'/g, "\\'")}' }, '*');
              setTimeout(function() { window.close(); }, 1200);
            } else {
              window.location.href = '/?sso_success=true&char_name=' + encodeURIComponent('${characterName.replace(/'/g, "\\'")}');
            }
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Error handling EVE SSO OAuth callback:', err);
    addLog('error', `EVE SSO authentication callback error: ${err instanceof Error ? err.message : String(err)}`, 'sso');
    res.send(`
      <html>
        <head>
          <title>EVE SSO Error</title>
          <style>
            body { background-color: #0d0f14; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background-color: #1a2130; padding: 24px; border-radius: 12px; border: 1px solid #991b1b; max-width: 320px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
            h3 { color: #f43f5e; margin-top: 0; font-size: 18px; }
            p { font-size: 13px; color: #fca5a5; line-height: 1.5; }
            button { background-color: #312e81; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 11px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>Ошибка авторизации!</h3>
            <p>${err instanceof Error ? err.message : String(err)}</p>
            <button onclick="window.close()">Закрыть окно</button>
          </div>
        </body>
      </html>
    `);
  }
});


// --- INTEGRATE VITE FOR MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    addLog('success', `Application server booted on port ${PORT}`, 'system');
  });
}

startServer();
