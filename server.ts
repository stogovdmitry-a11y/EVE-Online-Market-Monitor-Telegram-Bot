import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Character, Order, BotSettings, BotLog, ChatMessage, IndustryJob } from './src/types';

const app = express();
app.set('trust proxy', true);
const PORT = 3000;

let lastKnownAppUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';

function getAppUrl(req: any) {
  let proto = req.protocol;
  if (req.headers['x-forwarded-proto'] === 'https' || req.get('host')?.includes('.run.app')) {
    proto = 'https';
  }
  const host = req.get('host');
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const detectedUrl = `${proto}://${host}`;
    lastKnownAppUrl = detectedUrl;
    return detectedUrl;
  }
  if (process.env.APP_URL) {
    const envUrl = process.env.APP_URL.replace(/\/$/, '');
    if (!lastKnownAppUrl) {
      lastKnownAppUrl = envUrl;
    }
    return envUrl;
  }
  return 'http://localhost:3000';
}

app.use(express.json());

// Persistent DB File Path
const DB_PATH = path.join(process.cwd(), 'db.json');

interface TrackedSkill {
  id: string; // charId-skillId-finishedLevel
  characterId: string;
  characterName: string;
  skillId: number;
  skillName: string;
  finishedLevel: number;
  finishDate: string;
  notified: boolean;
}

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
  projects: IndustryJob[];
  logs: BotLog[];
  trackedSkills?: TrackedSkill[];
}

// Initial/default DB structure
const defaultState: DatabaseState = {
  settings: {
    telegramToken: '',
    intervalMinutes: 5,
    botUsername: 'EveMarketMonitorBot',
    isBotRunning: false,
    isSimulationMode: false,
    industryNotificationsEnabled: true,
    skillsNotificationsEnabled: true,
  },
  characters: [],
  tokens: {},
  orders: [],
  logs: [
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      level: 'success',
      message: 'System loaded successfully. App ready.',
      type: 'system'
    }
  ],
  projects: []
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
        projects: parsed.projects || defaultState.projects || [],
        logs: parsed.logs || defaultState.logs,
        trackedSkills: parsed.trackedSkills || []
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
      } else if (id < 1000000000000) {
        // Resolve Character, Corporation, Alliance etc via bulk POST names endpoint individually
        const res = await fetch('https://esi.evetech.net/latest/universe/names/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([id])
        });
        if (res.ok) {
          const data = await res.json() as { category: string, id: number, name: string }[];
          if (data && data[0] && data[0].name) {
            nameCache[String(id)] = data[0].name;
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
      } else if (id >= 1000000000000) {
        nameCache[String(id)] = `Player Structure (${id})`;
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

  // Separate IDs into those suitable for bulk /universe/names/ (all standard EVE IDs below 1 trillion)
  // and others (like Citadels / player structures > 1,000,000,000,000)
  const bulkCandidates = unresolved.filter(id => id < 1000000000000);
  const specialIds = unresolved.filter(id => id >= 1000000000000);

  // Map special IDs (like Citadels / player-owned structures) to friendly fallback names
  specialIds.forEach(id => {
    nameCache[String(id)] = `Player Structure (${id})`;
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

// Fetch and check EVE Industry Projects (Jobs)
async function performIndustryCheck() {
  addLog('info', 'Industry projects check initiated.', 'market');
  const { isSimulationMode, telegramToken } = dbState.settings;

  const notificationsToSend: {
    characterName: string;
    installerName: string;
    blueprintTypeName: string;
    productTypeName?: string;
    activityName: string;
    isCorporation: boolean;
  }[] = [];

  if (isSimulationMode) {
    // Ensure simulated jobs exist
    if (!dbState.projects || dbState.projects.length === 0) {
      const now = Date.now();
      dbState.projects = [
        {
          id: 'job-sim-1',
          characterId: '95465499',
          characterName: 'Stogov Dmitry',
          isCorporation: false,
          activityId: 1,
          activityName: 'Производство',
          blueprintTypeId: 681,
          blueprintTypeName: 'Apocalypse Blueprint',
          productTypeId: 640,
          productTypeName: 'Apocalypse',
          installerId: 95465499,
          installerName: 'Stogov Dmitry',
          status: 'active',
          startDate: new Date(now - 3600000).toISOString(),
          endDate: new Date(now + 7200000).toISOString(), // Ends in 2 hours
          notified: false
        },
        {
          id: 'job-sim-2',
          characterId: '95465499',
          characterName: 'Stogov Dmitry',
          isCorporation: true,
          activityId: 3,
          activityName: 'Исследование эффективности времени (TE)',
          blueprintTypeId: 12006,
          blueprintTypeName: 'Ishtar Blueprint',
          installerId: 95465499,
          installerName: 'Stogov Dmitry',
          status: 'active',
          startDate: new Date(now - 7200000).toISOString(),
          endDate: new Date(now + 120000).toISOString(), // Ends in 2 minutes
          notified: false
        },
        {
          id: 'job-sim-3',
          characterId: '91234567',
          characterName: 'Alt Jita Trader',
          isCorporation: false,
          activityId: 5,
          activityName: 'Копирование',
          blueprintTypeId: 587,
          blueprintTypeName: 'Rifter Blueprint',
          installerId: 91234567,
          installerName: 'Alt Jita Trader',
          status: 'active',
          startDate: new Date(now - 1800000).toISOString(),
          endDate: new Date(now - 30000).toISOString(), // Completed 30 seconds ago
          notified: false
        }
      ];
      saveDB();
    }

    // Update simulated jobs
    dbState.projects = dbState.projects.map(job => {
      if (job.status === 'active') {
        const endMs = new Date(job.endDate).getTime();
        if (Date.now() >= endMs) {
          job.status = 'completed';
          if (!job.notified) {
            notificationsToSend.push({
              characterName: job.characterName,
              installerName: job.installerName,
              blueprintTypeName: job.blueprintTypeName,
              productTypeName: job.productTypeName,
              activityName: job.activityName,
              isCorporation: job.isCorporation
            });
            job.notified = true;
          }
        }
      }
      return job;
    });
    saveDB();
    addLog('success', 'Industry check complete (Simulation Mode). Simulated jobs updated.', 'market');
  } else {
    // REAL INDUSTRY CHECK VIA EVE ONLINE ESI
    const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID;
    const clientSecret = dbState.settings.eveClientSecret || process.env.EVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      addLog('error', 'Cannot perform real industry check: EVE Developer Client ID or Client Secret is not set in settings or env.', 'market');
      return;
    }

    const realCharacters = dbState.characters.filter(c => !c.isSimulated);
    if (realCharacters.length === 0) {
      return;
    }

    const fetchedJobsMap = new Map<string, IndustryJob>();

    for (const char of realCharacters) {
      try {
        const tokenDetails = dbState.tokens[char.id];
        if (!tokenDetails) continue;

        let accessToken = tokenDetails.access_token;
        if (Date.now() + 60000 > tokenDetails.expires_at) {
          accessToken = await refreshCharacterToken(char.id, tokenDetails.refresh_token, clientId, clientSecret);
        }

        // Fetch corporation info if not cached yet
        if (!char.corporationId) {
          const charPublicUrl = `https://esi.evetech.net/latest/characters/${char.id}/?datasource=tranquility`;
          const charPublicRes = await fetch(charPublicUrl);
          if (charPublicRes.ok) {
            const charPublicData = await charPublicRes.json() as { corporation_id: number };
            if (charPublicData.corporation_id) {
              char.corporationId = charPublicData.corporation_id;
              
              const corpNameRes = await resolveNames([char.corporationId]);
              char.corporationName = corpNameRes[String(char.corporationId)] || `Corporation ${char.corporationId}`;
              saveDB();
            }
          }
        }

        // 1. Fetch Personal Industry Jobs
        const personalJobsUrl = `https://esi.evetech.net/latest/characters/${char.id}/industry/jobs/?datasource=tranquility&include_completed=true`;
        const personalJobsRes = await fetch(personalJobsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const activePersonalJobs: any[] = [];
        if (personalJobsRes.ok) {
          const jobs = await personalJobsRes.json() as any[];
          activePersonalJobs.push(...jobs);
        } else {
          addLog('error', `Failed to fetch personal jobs for ${char.name}: ${personalJobsRes.statusText}`, 'market');
        }

        // 2. Fetch Corporation Industry Jobs if corporationId exists
        const activeCorpJobs: any[] = [];
        if (char.corporationId) {
          const corpJobsUrl = `https://esi.evetech.net/latest/corporations/${char.corporationId}/industry/jobs/?datasource=tranquility&include_completed=true`;
          const corpJobsRes = await fetch(corpJobsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (corpJobsRes.ok) {
            const jobs = await corpJobsRes.json() as any[];
            const myCorpJobs = jobs.filter(job => job.installer_id === Number(char.id));
            activeCorpJobs.push(...myCorpJobs);
          } else {
            addLog('info', `Could not fetch corporation industry jobs for ${char.name}: character may lack corporation roles/permissions.`, 'market');
          }
        }

        // Combine and map
        const allFetchedJobs = [
          ...activePersonalJobs.map(j => ({ ...j, isCorporation: false })),
          ...activeCorpJobs.map(j => ({ ...j, isCorporation: true }))
        ];

        // Resolve blueprint/product type names and installer names
        const idsToResolve: number[] = [];
        allFetchedJobs.forEach(j => {
          idsToResolve.push(j.blueprint_type_id);
          if (j.product_type_id) idsToResolve.push(j.product_type_id);
          idsToResolve.push(j.installer_id);
        });

        await resolveNames(idsToResolve);

        for (const j of allFetchedJobs) {
          const activityNames: { [id: number]: string } = {
            1: 'Производство',
            2: 'Исследование технологий',
            3: 'Исследование эффективности времени (TE)',
            4: 'Исследование эффективности материалов (ME)',
            5: 'Копирование',
            7: 'Обратный инжиниринг',
            8: 'Изобретение',
            9: 'Реакции'
          };

          const activityName = activityNames[j.activity_id] || `Проект (ID ${j.activity_id})`;
          const blueprintTypeName = nameCache[String(j.blueprint_type_id)] || `Blueprint ${j.blueprint_type_id}`;
          const productTypeName = j.product_type_id ? (nameCache[String(j.product_type_id)] || `Product ${j.product_type_id}`) : undefined;
          const installerName = nameCache[String(j.installer_id)] || `Character ${j.installer_id}`;

          const key = `job-${j.job_id}`;
          const existingJob = dbState.projects?.find(p => p.id === key);
          
          let notified = existingJob?.notified || false;
          let currentStatus = j.status;

          const endMs = new Date(j.end_date).getTime();
          if (currentStatus === 'active' && Date.now() >= endMs) {
            currentStatus = 'completed';
          }

          if (currentStatus === 'completed' && !notified) {
            notificationsToSend.push({
              characterName: char.name,
              installerName,
              blueprintTypeName,
              productTypeName,
              activityName,
              isCorporation: j.isCorporation
            });
            notified = true;
          }

          fetchedJobsMap.set(key, {
            id: key,
            characterId: char.id,
            characterName: char.name,
            isCorporation: j.isCorporation,
            activityId: j.activity_id,
            activityName,
            blueprintTypeId: j.blueprint_type_id,
            blueprintTypeName,
            productTypeId: j.product_type_id,
            productTypeName,
            installerId: j.installer_id,
            installerName,
            status: currentStatus,
            startDate: j.start_date,
            endDate: j.end_date,
            completedDate: j.completed_date,
            notified
          });
        }

      } catch (err) {
        addLog('error', `Error handling industry check for character ${char.name}: ${err instanceof Error ? err.message : String(err)}`, 'market');
      }
    }

    if (!dbState.projects) {
      dbState.projects = [];
    }

    const currentProjects = dbState.projects.filter(p => {
      const charExists = dbState.characters.some(c => c.id === p.characterId);
      if (!charExists) return false;

      if (p.status === 'active') return true;
      const finishedTime = p.completedDate ? new Date(p.completedDate).getTime() : new Date(p.endDate).getTime();
      return Date.now() - finishedTime < 24 * 3600 * 1000; // 24 hours
    });

    const updatedProjects = currentProjects.map(p => {
      if (fetchedJobsMap.has(p.id)) {
        const fresh = fetchedJobsMap.get(p.id)!;
        fetchedJobsMap.delete(p.id);
        return fresh;
      }
      return p;
    });

    dbState.projects = [...updatedProjects, ...Array.from(fetchedJobsMap.values())];
    saveDB();
    addLog('success', `Real industry check complete. Verified ${dbState.projects.length} jobs.`, 'market');
  }

  // Send Completion Notifications to Telegram
  const industryEnabled = dbState.settings.industryNotificationsEnabled !== false;
  if (industryEnabled && notificationsToSend.length > 0 && telegramToken) {
    addLog('info', `Sending ${notificationsToSend.length} industry completion notifications to Telegram...`, 'bot');
    for (const notif of notificationsToSend) {
      const typeLabel = notif.isCorporation ? '🏢 Корпоративный проект' : '👤 Личный проект';
      const nameLabel = notif.productTypeName || notif.blueprintTypeName;

      const messageText = `📦 *${nameLabel}* — ЗАВЕРШЕН!\n\n` +
                          `🎉 *EVE Industry Monitor*\n` +
                          `⚙️ *Тип:* ${notif.activityName} (${typeLabel})\n` +
                          `👤 *Запустил:* ${notif.installerName}\n` +
                          `✅ *Статус:* Готов к получению!`;

      try {
        const chatIds = Array.from(new Set(dbState.characters.map(c => (c as any).chatId).filter(Boolean)))
          .filter(id => /^-?\d+$/.test(id));
        
        if (chatIds.length === 0) continue;

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
            addLog('success', `Industry completion alert sent to Telegram chat ${chatId} for: ${nameLabel}`, 'bot');
          }
        }
      } catch (tgErr) {
        addLog('error', `Failed to deliver Telegram industry notification: ${tgErr instanceof Error ? tgErr.message : String(tgErr)}`, 'bot');
      }
    }
  }
}

function romanize(num: number): string {
  const lookup: { [key: number]: string } = { 5: 'V', 4: 'IV', 3: 'III', 2: 'II', 1: 'I' };
  return lookup[num] || String(num);
}

// Fetch and check EVE Skills Training Queue (Actual + Simulated)
async function performSkillsCheck() {
  addLog('info', 'Skills check initiated.', 'market');
  const { isSimulationMode, telegramToken } = dbState.settings;

  const notificationsToSend: {
    characterName: string;
    skillName: string;
    finishedLevel: number;
  }[] = [];

  if (isSimulationMode) {
    if (!dbState.trackedSkills || dbState.trackedSkills.length === 0) {
      const now = Date.now();
      dbState.trackedSkills = [
        {
          id: '95465499-3428-5',
          characterId: '95465499',
          characterName: 'Stogov Dmitry',
          skillId: 3428,
          skillName: 'Advanced Weapon Upgrades',
          finishedLevel: 5,
          finishDate: new Date(now + 30000).toISOString(), // Ends in 30 seconds
          notified: false
        },
        {
          id: '95465499-3411-5',
          characterId: '95465499',
          characterName: 'Stogov Dmitry',
          skillId: 3411,
          skillName: 'Cybernetics',
          finishedLevel: 5,
          finishDate: new Date(now + 18000000).toISOString(), // 5 hours
          notified: false
        },
        {
          id: '91234567-16596-5',
          characterId: '91234567',
          characterName: 'Alt Jita Trader',
          skillId: 16596,
          skillName: 'Wholesale',
          finishedLevel: 5,
          finishDate: new Date(now + 120000).toISOString(), // Ends in 2 minutes
          notified: false
        }
      ];
      saveDB();
    }

    dbState.trackedSkills = dbState.trackedSkills.map(ts => {
      if (!ts.notified) {
        const finishMs = new Date(ts.finishDate).getTime();
        if (Date.now() >= finishMs) {
          notificationsToSend.push({
            characterName: ts.characterName,
            skillName: ts.skillName,
            finishedLevel: ts.finishedLevel
          });
          ts.notified = true;
        }
      }
      return ts;
    });
    saveDB();
    addLog('success', 'Skills check complete (Simulation Mode). Simulated queues updated.', 'market');
  } else {
    // REAL SKILLS QUEUE CHECK
    const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID;
    const clientSecret = dbState.settings.eveClientSecret || process.env.EVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      addLog('error', 'Cannot perform real skills check: EVE Developer Client ID or Client Secret is not set in settings or env.', 'market');
      return;
    }

    const realCharacters = dbState.characters.filter(c => !c.isSimulated);
    if (realCharacters.length === 0) {
      return;
    }

    for (const char of realCharacters) {
      try {
        const tokenDetails = dbState.tokens[char.id];
        if (!tokenDetails) continue;

        let accessToken = tokenDetails.access_token;
        if (Date.now() + 60000 > tokenDetails.expires_at) {
          accessToken = await refreshCharacterToken(char.id, tokenDetails.refresh_token, clientId, clientSecret);
        }

        const skillQueueUrl = `https://esi.evetech.net/latest/characters/${char.id}/skillqueue/?datasource=tranquility`;
        const skillQueueRes = await fetch(skillQueueUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (skillQueueRes.ok) {
          const queue = await skillQueueRes.json() as any[];
          
          // Resolve skill names via name resolver
          const idsToResolve = queue.map(q => q.skill_id);
          if (idsToResolve.length > 0) {
            await resolveNames(idsToResolve);
          }

          if (!dbState.trackedSkills) {
            dbState.trackedSkills = [];
          }

          for (const item of queue) {
            if (item.finish_date) {
              const key = `${char.id}-${item.skill_id}-${item.finished_level}`;
              const existing = dbState.trackedSkills.find(ts => ts.id === key);
              const skillName = nameCache[String(item.skill_id)] || `Skill ${item.skill_id}`;

              if (!existing) {
                dbState.trackedSkills.push({
                  id: key,
                  characterId: char.id,
                  characterName: char.name,
                  skillId: item.skill_id,
                  skillName,
                  finishedLevel: item.finished_level,
                  finishDate: item.finish_date,
                  notified: false
                });
              } else if (existing.finishDate !== item.finish_date) {
                existing.finishDate = item.finish_date;
                if (new Date(item.finish_date).getTime() > Date.now()) {
                  existing.notified = false;
                }
              }
            }
          }
          saveDB();

          // Evaluate notifications for this character
          dbState.trackedSkills.forEach(ts => {
            if (ts.characterId === char.id && !ts.notified) {
              const finishMs = new Date(ts.finishDate).getTime();
              if (Date.now() >= finishMs) {
                notificationsToSend.push({
                  characterName: ts.characterName,
                  skillName: ts.skillName,
                  finishedLevel: ts.finishedLevel
                });
                ts.notified = true;
              }
            }
          });
          saveDB();
        } else {
          addLog('error', `Failed to fetch skill queue for ${char.name}: ${skillQueueRes.statusText}`, 'market');
        }
      } catch (err) {
        addLog('error', `Error handling skills check for character ${char.name}: ${err instanceof Error ? err.message : String(err)}`, 'market');
      }
    }
    addLog('success', 'Real skills check complete.', 'market');
  }

  // Send skill completion notifications to Telegram
  const skillsEnabled = dbState.settings.skillsNotificationsEnabled !== false;
  if (skillsEnabled && notificationsToSend.length > 0 && telegramToken) {
    addLog('info', `Sending ${notificationsToSend.length} skill completion notifications to Telegram...`, 'bot');
    for (const notif of notificationsToSend) {
      // First line MUST be the skill name as requested
      const messageText = `⚡️ *${notif.skillName} ${romanize(notif.finishedLevel)}* — ИЗУЧЕН!\n\n` +
                          `🎉 *EVE Skill Monitor*\n` +
                          `👤 *Персонаж:* ${notif.characterName}\n` +
                          `📈 Поздравляем, изучение навыка успешно завершено!`;

      try {
        const chatIds = Array.from(new Set(dbState.characters.map(c => (c as any).chatId).filter(Boolean)))
          .filter(id => /^-?\d+$/.test(id));
        
        if (chatIds.length === 0) continue;

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
            addLog('error', `Telegram sendMessage failed for skill notif: ${response.status} (${errText})`, 'bot');
          } else {
            addLog('success', `Skill completion alert sent to Telegram chat ${chatId} for: ${notif.skillName}`, 'bot');
          }
        }
      } catch (tgErr) {
        addLog('error', `Failed to deliver Telegram skill notification: ${tgErr instanceof Error ? tgErr.message : String(tgErr)}`, 'bot');
      }
    }
  }
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
          if (co.region_id) {
            universeIdsToResolve.push(co.region_id);
          }
        });
        await resolveNames(universeIdsToResolve);

        // Process each active character order against public region markets
        const updatedOrders: Order[] = [];

        for (const co of charOrders) {
          // Keep track of names
          const itemName = nameCache[String(co.type_id)] || `Item ${co.type_id}`;
          const locationName = nameCache[String(co.location_id)] || `Station ${co.location_id}`;
          
          const regionId = co.region_id || 10000002;
          const regionName = nameCache[String(regionId)] || 'The Forge';
          
          // Determine friendly solar system / location name from station name prefix or region name
          let systemName = regionName;
          if (locationName.startsWith('Jita')) {
            systemName = 'Jita';
          } else if (locationName.startsWith('Amarr')) {
            systemName = 'Amarr';
          } else if (locationName.startsWith('Dodixie')) {
            systemName = 'Dodixie';
          } else if (locationName.startsWith('Rens')) {
            systemName = 'Rens';
          } else if (locationName.startsWith('Hek')) {
            systemName = 'Hek';
          }
          
          const isBuyOrder = !!co.is_buy_order;

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
      const typeStr = notif.isBuyOrder ? 'ПОКУПКА' : 'ПРОДАЖА';
      const detailsStr = notif.isBuyOrder 
        ? `Моя цена: \`${notif.myPrice.toLocaleString()} ISK\`\n🔥 Лучшая цена: \`${notif.bestPrice.toLocaleString()} ISK\` (Перебит на ${(notif.bestPrice - notif.myPrice).toFixed(2)} ISK)`
        : `Моя цена: \`${notif.myPrice.toLocaleString()} ISK\`\n🔥 Лучшая цена: \`${notif.bestPrice.toLocaleString()} ISK\` (Перебит на ${(notif.myPrice - notif.bestPrice).toFixed(2)} ISK)`;

      const messageText = `🚨 *${notif.itemName}* — ПЕРЕБИТ!\n\n` +
                          `📊 *EVE Market Monitor*\n` +
                          `🌌 *Система:* ${notif.systemName}\n` +
                          `📈 *Тип ордера:* ${typeStr}\n` +
                          `${detailsStr}\n` +
                          `👤 *Персонаж:* ${notif.characterName}`;

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

  // Run the industry projects check as part of the market check cycle
  await performIndustryCheck();

  // Run the skills queue check as part of the market check cycle
  await performSkillsCheck();
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

async function fetchCharacterSkills(char: Character): Promise<{
  totalSp: number;
  unallocatedSp: number;
  skillsList: { name: string; level: number; sp: number }[];
  error?: string;
}> {
  const { isSimulationMode } = dbState.settings;

  let totalSp = 0;
  let unallocatedSp = 0;
  let skillsList: { name: string; level: number; sp: number }[] = [];

  if (isSimulationMode || char.isSimulated) {
    if (char.id === '95465499') {
      totalSp = 45230100;
      unallocatedSp = 120000;
      skillsList = [
        { name: 'Caldari Cruiser', level: 5, sp: 256000 },
        { name: 'Heavy Assault Cruisers', level: 5, sp: 1280000 },
        { name: 'Medium Hybrid Turret', level: 5, sp: 256000 },
        { name: 'Weapon Upgrades', level: 5, sp: 256000 },
        { name: 'Advanced Weapon Upgrades', level: 4, sp: 256000 },
        { name: 'Cybernetics', level: 4, sp: 45200 },
        { name: 'Astrometrics', level: 4, sp: 135000 }
      ];
    } else {
      totalSp = 12450000;
      unallocatedSp = 0;
      skillsList = [
        { name: 'Trade', level: 5, sp: 256000 },
        { name: 'Retail', level: 5, sp: 256000 },
        { name: 'Wholesale', level: 4, sp: 181000 },
        { name: 'Marketing', level: 4, sp: 120000 }
      ];
    }
  } else {
    // REAL EVE ONLINE CHARACTER SKILLS FETCH
    const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID;
    const clientSecret = dbState.settings.eveClientSecret || process.env.EVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { totalSp: 0, unallocatedSp: 0, skillsList: [], error: 'Ошибка конфигурации EVE Developer Client ID/Secret на сервере!' };
    }

    const tokenDetails = dbState.tokens[char.id];
    if (!tokenDetails) {
      return { totalSp: 0, unallocatedSp: 0, skillsList: [], error: `Токен авторизации для персонажа ${char.name} отсутствует. Переподключите персонажа с помощью /add_character.` };
    }

    try {
      let accessToken = tokenDetails.access_token;
      if (Date.now() + 60000 > tokenDetails.expires_at) {
        accessToken = await refreshCharacterToken(char.id, tokenDetails.refresh_token, clientId, clientSecret);
      }

      // Fetch Skills list
      const skillsUrl = `https://esi.evetech.net/latest/characters/${char.id}/skills/?datasource=tranquility`;
      const skillsRes = await fetch(skillsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!skillsRes.ok) {
        if (skillsRes.status === 403) {
          return { totalSp: 0, unallocatedSp: 0, skillsList: [], error: `Ошибка доступа (403)! Персонажу *${char.name}* требуются дополнительные права на навыки. Пожалуйста, переподключите его через /add_character.` };
        }
        return { totalSp: 0, unallocatedSp: 0, skillsList: [], error: `Не удалось загрузить навыки с EVE ESI: ${skillsRes.statusText}` };
      }

      const skillsData = await skillsRes.json() as { skills: any[]; total_sp: number; unallocated_sp?: number };
      totalSp = skillsData.total_sp;
      unallocatedSp = skillsData.unallocated_sp || 0;

      const rawSkills = skillsData.skills || [];
      const idsToResolve = rawSkills.map(s => s.skill_id);

      if (idsToResolve.length > 0) {
        await resolveNames(idsToResolve);
      }

      rawSkills.forEach(s => {
        const name = nameCache[String(s.skill_id)] || `Skill ${s.skill_id}`;
        skillsList.push({
          name,
          level: s.trained_skill_level,
          sp: s.skillpoints_in_skill
        });
      });

    } catch (err) {
      return { totalSp: 0, unallocatedSp: 0, skillsList: [], error: `Ошибка получения навыков: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Sort alphabetically
  skillsList.sort((a, b) => a.name.localeCompare(b.name));

  return { totalSp, unallocatedSp, skillsList };
}

function formatSkillsForEVE(skills: { name: string; level: number }[]): string {
  const roman = ['I', 'II', 'III', 'IV', 'V'];
  return skills.map(s => `${s.name} ${roman[s.level - 1] || s.level}`).join('\n');
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const sendUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      addLog('error', `Failed to send Telegram message: ${res.status} (${errText})`, 'bot');
    }
  } catch (err) {
    addLog('error', `Error sending Telegram message: ${err instanceof Error ? err.message : String(err)}`, 'bot');
  }
}

async function getCharacterSkillsString(char: Character, chatId?: string, isRealTelegram?: boolean): Promise<string> {
  const result = await fetchCharacterSkills(char);
  if (result.error) {
    return `❌ *${result.error}*`;
  }

  const { totalSp, unallocatedSp, skillsList } = result;
  const token = dbState.settings.telegramToken;

  const levelEmojis: { [key: number]: string } = {
    5: '🔵',
    4: '🟢',
    3: '🟡',
    2: '🟠',
    1: '⚪'
  };

  const lines = skillsList.map(s => {
    const emoji = levelEmojis[s.level] || '🔘';
    return `${emoji} *${s.name}* — Уровень ${romanize(s.level)}`;
  });

  const CHUNK_SIZE = 35;
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    chunks.push(lines.slice(i, i + CHUNK_SIZE));
  }

  if (isRealTelegram && chatId && token) {
    // Send the first message with summary info
    let firstMsg = `🎓 *НАВЫКИ ПИЛОТА: ${char.name.toUpperCase()}*\n\n` +
                   `📊 *Всего Skill Points:* \`${totalSp.toLocaleString()}\` SP\n`;
    if (unallocatedSp > 0) {
      firstMsg += `✨ *Нераспределенные SP:* \`${unallocatedSp.toLocaleString()}\` SP\n`;
    }
    firstMsg += `\n`;

    if (chunks.length === 0) {
      firstMsg += `📚 *ИЗУЧЕННЫЕ НАВЫКИ:*\n  _Информация о выученных навыках отсутствует._`;
      await sendTelegramMessage(token, chatId, firstMsg);
    } else {
      firstMsg += `📚 *ИЗУЧЕННЫЕ НАВЫКИ (Часть 1/${chunks.length}):*\n` + chunks[0].join('\n');
      await sendTelegramMessage(token, chatId, firstMsg);

      for (let i = 1; i < chunks.length; i++) {
        const chunkMsg = `📚 *ИЗУЧЕННЫЕ НАВЫКИ (Часть ${i + 1}/${chunks.length}):*\n` + chunks[i].join('\n');
        await sendTelegramMessage(token, chatId, chunkMsg);
      }
    }

    // Now send the document
    try {
      const fileContent = formatSkillsForEVE(skillsList);
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = new Blob([fileContent], { type: 'text/plain' });
      formData.append('document', blob, `${char.name.replace(/[^a-zA-Z0-9]/g, '_')}_skills.txt`);
      formData.append('caption', `📋 Файл со списком навыков пилота ${char.name} для импорта в EVE Online.`);
      
      const sendDocUrl = `https://api.telegram.org/bot${token}/sendDocument`;
      const docRes = await fetch(sendDocUrl, {
        method: 'POST',
        body: formData
      });
      if (docRes.ok) {
        addLog('success', `Skills document sent to Telegram chat ${chatId} for character: ${char.name}`, 'bot');
      } else {
        const errText = await docRes.text();
        addLog('error', `Failed to send skills document: ${docRes.status} (${errText})`, 'bot');
      }
    } catch (docErr) {
      addLog('error', `Error sending skills document: ${docErr instanceof Error ? docErr.message : String(docErr)}`, 'bot');
    }

    const appUrl = lastKnownAppUrl || process.env.APP_URL || `http://localhost:3000`;
    return `✅ *Все навыки успешно отправлены выше!*\n\n` +
           `📎 Прикреплен текстовый файл со всеми навыками в формате для импорта в игру.\n` +
           `🔗 [Ссылка на скачивание файла](${appUrl}/api/skills/export/${char.id})`;
  } else {
    // Web simulator or fallback
    let outputText = `🎓 *НАВЫКИ ПИЛОТА: ${char.name.toUpperCase()}*\n\n` +
                     `📊 *Всего Skill Points:* \`${totalSp.toLocaleString()}\` SP\n`;
    if (unallocatedSp > 0) {
      outputText += `✨ *Нераспределенные SP:* \`${unallocatedSp.toLocaleString()}\` SP\n`;
    }
    outputText += `\n`;

    const appUrl = lastKnownAppUrl || process.env.APP_URL || `http://localhost:3000`;
    outputText += `📎 *Полный список навыков доступен для скачивания в формате EVE:* [Скачать .txt файл](${appUrl}/api/skills/export/${char.id})\n\n`;

    if (chunks.length === 0) {
      outputText += `📚 *ИЗУЧЕННЫЕ НАВЫКИ:*\n  _Информация о выученных навыках отсутствует._`;
    } else {
      outputText += `📚 *ИЗУЧЕННЫЕ НАВЫКИ (Часть 1/${chunks.length}):*\n` + chunks[0].join('\n');
      if (chunks.length > 1) {
        outputText += `\n\n⚠️ *Остальные навыки (${lines.length - chunks[0].length} шт.) скрыты в веб-чате. Используйте ссылку выше для скачивания полного файла или посмотрите их в Telegram.*`;
      }
    }

    return outputText;
  }
}

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
    return `👋 *Привет! Я EVE Market, Industry & Skill Monitor Bot!*\n\n` +
           `Я помогу тебе следить за ордерами в Jita, индустриальными проектами и изучением навыков персонажей.\n` +
           `Если кто-то перебьет твою цену, проект завершится или изучится навык, я моментально пришлю тебе оповещение!\n\n` +
           `📋 *Доступные команды:*\n` +
           `🔹 /start - показать это меню и список всех команд\n` +
           `🔹 /add_character - добавить нового персонажа через EVE SSO\n` +
           `🔹 /list (или /characters) - показать список персонажей и перебитых ордеров\n` +
           `🔹 /projects - показать активные индустриальные проекты\n` +
           `🔹 /projects on (или /projects_off) - включить/выключить оповещения о проектах\n` +
           `🔹 /skills [персонаж] - получить полный список изученных навыков и файл для игры\n` +
           `🔹 /skills on (или /skills_off) - включить/выключить оповещения о навыках\n` +
           `🔹 /delete_character <ID> - удалить персонажа по ID\n` +
           `🔹 /check - принудительно запустить проверку цен, проектов и навыков`;
  }

  if (command === '/add_character') {
    // Generate actual EVE SSO URL with both market, industry, and skills scopes
    const appUrl = lastKnownAppUrl || process.env.APP_URL || `http://localhost:3000`;
    const clientId = dbState.settings.eveClientId || process.env.EVE_CLIENT_ID || 'MOCK_CLIENT_ID';
    const scopes = 'esi-markets.read_character_orders.v1 esi-industry.read_character_jobs.v1 esi-industry.read_corporation_jobs.v1 esi-skills.read_skills.v1 esi-skills.read_skillqueue.v1';
    const ssoUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(appUrl + '/api/auth/eve/callback')}&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&state=${chatId}`;

    return `👤 *Добавление персонажа:*\n\n` +
           `Чтобы добавить персонажа, тебе нужно авторизовать его через официальный безопасный EVE SSO (Single Sign-On).\n\n` +
           `🔗 [Нажми сюда, чтобы войти с EVE SSO](${ssoUrl})\n\n` +
           `⚠️ *Важно:* Ссылка привяжет персонажа к твоему текущему Telegram-аккаунту (ID: \`${chatId}\`).\n` +
           `Если ты тестируешь в симуляторе, можешь добавить тестового персонажа прямо в веб-интерфейсе!`;
  }

  if (command === '/characters' || command === '/list') {
    // Filter characters connected to this chat ID (or show all if in simulation/fallback)
    const chatChars = dbState.characters.filter(c => (c as any).chatId === chatId || c.isSimulated);
    
    if (chatChars.length === 0) {
      return `❌ *Список пуст!*\n\nУ тебя пока нет привязанных персонажей. Используй /add_character, чтобы добавить персонажа.`;
    }

    let responseText = `👤 *Мои привязанные персонажи:*\n\n`;
    chatChars.forEach((char, index) => {
      const simBadge = char.isSimulated ? ' 🧪 (Демо)' : '';
      const corpInfo = char.corporationName ? ` | Корпорация: ${char.corporationName}` : '';
      responseText += `${index + 1}. *${char.name}* [ID: \`${char.id}\`]${simBadge}\n` +
                     `   └ Активных ордеров: ${char.activeOrdersCount}${corpInfo} | Статус: ${char.status === 'active' ? '🟢 Активен' : '🔴 Нужен перезапуск'}\n\n`;
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

  if (command === '/projects_on') {
    dbState.settings.industryNotificationsEnabled = true;
    saveDB();
    addLog('info', `Industry notifications enabled by user command /projects_on from chat ${chatId}`, 'bot');
    return `🔔 *Оповещения по индустриальным проектам включены!*\n\nЯ буду присылать уведомления в этот чат, когда твои проекты будут завершены.`;
  }

  if (command === '/projects_off') {
    dbState.settings.industryNotificationsEnabled = false;
    saveDB();
    addLog('info', `Industry notifications disabled by user command /projects_off from chat ${chatId}`, 'bot');
    return `🔕 *Оповещения по индустриальным проектам выключены!*\n\nЯ больше не буду присылать уведомления о завершении проектов. Но ты все еще можешь проверять их вручную командой /projects.`;
  }

  if (command === '/projects') {
    const subCommand = args[0]?.toLowerCase();
    if (subCommand === 'on') {
      dbState.settings.industryNotificationsEnabled = true;
      saveDB();
      addLog('info', `Industry notifications enabled by user command /projects on from chat ${chatId}`, 'bot');
      return `🔔 *Оповещения по индустриальным проектам включены!*\n\nЯ буду присылать уведомления в этот чат, когда твои проекты будут завершены.`;
    }
    if (subCommand === 'off') {
      dbState.settings.industryNotificationsEnabled = false;
      saveDB();
      addLog('info', `Industry notifications disabled by user command /projects off from chat ${chatId}`, 'bot');
      return `🔕 *Оповещения по индустриальным проектам выключены!*\n\nЯ больше не буду присылать уведомления о завершении проектов. Но ты все еще можешь проверять их вручную командой /projects.`;
    }

    // Ensure simulated projects exist in simulation mode
    if (dbState.settings.isSimulationMode && (!dbState.projects || dbState.projects.length === 0)) {
      await performIndustryCheck();
    }

    const chatChars = dbState.characters.filter(c => (c as any).chatId === chatId || c.isSimulated);
    const charIds = chatChars.map(c => c.id);

    // Get active projects of these characters
    const activeProjects = (dbState.projects || []).filter(p => charIds.includes(p.characterId) && p.status === 'active');

    if (activeProjects.length === 0) {
      return `ℹ️ *Активных проектов не найдено!*\n\nУ ваших персонажей нет запущенных проектов (производство, исследование, копирование) на данный момент.`;
    }

    // Sort/group by project types: Производство, Исследование, Копирование, etc.
    const groups: { [name: string]: typeof activeProjects } = {};
    activeProjects.forEach(p => {
      const gName = p.activityName || 'Другие проекты';
      if (!groups[gName]) {
        groups[gName] = [];
      }
      groups[gName].push(p);
    });

    let responseText = `⚙️ *АКТИВНЫЕ ПРОЕКТЫ ДЛЯ ВАШИХ ПЕРСОНАЖЕЙ (${activeProjects.length}):*\n\n`;

    const preferredOrder = [
      'Производство',
      'Исследование эффективности материалов (ME)',
      'Исследование дефицита времени (TE)',
      'Исследование эффективности времени (TE)',
      'Исследование технологий',
      'Копирование',
      'Изобретение',
      'Реакции'
    ];

    const allGroupNames = Object.keys(groups);
    allGroupNames.sort((a, b) => {
      const idxA = preferredOrder.findIndex(o => a.includes(o) || o.includes(a));
      const idxB = preferredOrder.findIndex(o => b.includes(o) || o.includes(b));
      
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      
      if (valA !== valB) return valA - valB;
      return a.localeCompare(b);
    });

    for (const gName of allGroupNames) {
      responseText += `📍 *${gName.toUpperCase()}*\n`;
      groups[gName].forEach(p => {
        const remainingMs = new Date(p.endDate).getTime() - Date.now();
        let remainingStr = 'Завершается...';
        if (remainingMs > 0) {
          const secs = Math.floor(remainingMs / 1000);
          const mins = Math.floor(secs / 60);
          const hours = Math.floor(mins / 60);
          const days = Math.floor(hours / 24);

          if (days > 0) {
            remainingStr = `${days}д ${hours % 24}ч ${mins % 60}м`;
          } else if (hours > 0) {
            remainingStr = `${hours}ч ${mins % 60}м ${secs % 60}с`;
          } else {
            remainingStr = `${mins}м ${secs % 60}с`;
          }
        } else {
          remainingStr = 'Завершен (Готов к получению!)';
        }

        const endDateObj = new Date(p.endDate);
        const formatZero = (num: number) => num < 10 ? '0' + num : num;
        const formattedEndDate = `${formatZero(endDateObj.getDate())}.${formatZero(endDateObj.getMonth() + 1)}.${endDateObj.getFullYear()} ${formatZero(endDateObj.getHours())}:${formatZero(endDateObj.getMinutes())}:${formatZero(endDateObj.getSeconds())}`;

        const isCorpBadge = p.isCorporation ? ' 🏢 [Corp]' : ' 👤 [Personal]';
        const nameLabel = p.productTypeName ? `${p.productTypeName} (${p.blueprintTypeName})` : p.blueprintTypeName;

        responseText += ` 📦 *${nameLabel}*\n` +
                       `  ├ Запустил: ${p.installerName}${isCorpBadge}\n` +
                       `  ├ Осталось: \`${remainingStr}\`\n` +
                       `  └ Окончание: \`${formattedEndDate}\`\n\n`;
      });
    }

    return responseText;
  }

  if (command === '/skills_on') {
    dbState.settings.skillsNotificationsEnabled = true;
    saveDB();
    addLog('info', `Skills notifications enabled by user command /skills_on from chat ${chatId}`, 'bot');
    return `🔔 *Оповещения по изучению навыков включены!*\n\nЯ буду присылать уведомления в этот чат, когда изучение навыков будет завершено.`;
  }

  if (command === '/skills_off') {
    dbState.settings.skillsNotificationsEnabled = false;
    saveDB();
    addLog('info', `Skills notifications disabled by user command /skills_off from chat ${chatId}`, 'bot');
    return `🔕 *Оповещения по изучению навыков выключены!*\n\nЯ больше не буду присылать уведомления о завершении изучения навыков. Но ты все еще можешь проверять статус командой /skills.`;
  }

  if (command === '/skills') {
    const subCommand = args[0]?.toLowerCase();
    if (subCommand === 'on') {
      dbState.settings.skillsNotificationsEnabled = true;
      saveDB();
      addLog('info', `Skills notifications enabled by user command /skills on from chat ${chatId}`, 'bot');
      return `🔔 *Оповещения по изучению навыков включены!*\n\nЯ буду присылать уведомления в этот чат, когда изучение навыков будет завершено.`;
    }
    if (subCommand === 'off') {
      dbState.settings.skillsNotificationsEnabled = false;
      saveDB();
      addLog('info', `Skills notifications disabled by user command /skills off from chat ${chatId}`, 'bot');
      return `🔕 *Оповещения по изучению навыков выключены!*\n\nЯ больше не буду присылать уведомления о завершении изучения навыков. Но ты все еще можешь проверять статус командой /skills.`;
    }

    const chatChars = dbState.characters.filter(c => (c as any).chatId === chatId || c.isSimulated);
    if (chatChars.length === 0) {
      return `❌ *Список пуст!*\n\nУ тебя пока нет привязанных персонажей. Используй /add_character, чтобы добавить персонажа.`;
    }

    let targetChar = chatChars[0];
    const searchArg = args.join(' ').toLowerCase().trim();

    if (searchArg) {
      const found = chatChars.find(c => c.name.toLowerCase().includes(searchArg) || c.id === searchArg);
      if (!found) {
        return `❌ *Персонаж "${args.join(' ')}" не найден!*\n\nДоступные пилоты: ${chatChars.map(c => c.name).join(', ')}`;
      }
      targetChar = found;
    } else if (chatChars.length > 1) {
      let selectPrompt = `👤 *У тебя привязано несколько персонажей:*\n\n`;
      chatChars.forEach(c => {
        selectPrompt += `🔹 \`/skills ${c.name}\`\n`;
      });
      selectPrompt += `\nПо умолчанию показываю навыки для первого персонажа (*${targetChar.name}*):\n\n`;
      
      const skillsText = await getCharacterSkillsString(targetChar, chatId, isRealTelegram);
      return selectPrompt + skillsText;
    }

    return await getCharacterSkillsString(targetChar, chatId, isRealTelegram);
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

    return `🔍 *Запущена принудительная проверка ордеров и проектов...*\n\n` +
           `Проверяю цены в регионе Jita на наличие перебитых ордеров, а также статус завершения ваших индустриальных проектов.\n\n` +
           `Если будут найдены перебитые ордера или завершенные проекты, я сразу пришлю оповещения!`;
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

// Register Telegram commands dynamically so they show up in the Telegram app user interface (menu / slash suggestions)
async function registerBotCommands(token: string) {
  try {
    const url = `https://api.telegram.org/bot${token}/setMyCommands`;
    const commands = [
      { command: 'start', description: 'Показать приветствие и список всех команд' },
      { command: 'list', description: 'Показать список персонажей и перебитых ордеров' },
      { command: 'projects', description: 'Показать активные индустриальные проекты' },
      { command: 'projects_on', description: 'Включить авто-уведомления по проектам' },
      { command: 'projects_off', description: 'Выключить авто-уведомления по проектам' },
      { command: 'skills', description: 'Показать навыки и очередь изучения персонажа' },
      { command: 'skills_on', description: 'Включить авто-уведомления по навыкам' },
      { command: 'skills_off', description: 'Выключить авто-уведомления по навыкам' },
      { command: 'add_character', description: 'Добавить нового персонажа через EVE SSO' },
      { command: 'delete_character', description: 'Удалить привязанного персонажа по ID' },
      { command: 'check', description: 'Запустить принудительную проверку ордеров и проектов' }
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands })
    });

    if (response.ok) {
      addLog('success', 'Telegram bot commands registered successfully in Telegram client UI.', 'bot');
    } else {
      const text = await response.text();
      addLog('error', `Failed to register Telegram commands in Telegram UI: ${response.status} (${text})`, 'bot');
    }
  } catch (err) {
    console.error('Error registering Telegram commands:', err);
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
    // Register commands in Telegram client menu dynamically
    registerBotCommands(token);
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
    projects: dbState.projects || [],
    logs: dbState.logs
  });
});

// Export character skills in EVE format (.txt file)
app.get('/api/skills/export/:characterId', async (req, res) => {
  const { characterId } = req.params;
  const char = dbState.characters.find(c => c.id === characterId);
  if (!char) {
    return res.status(404).send('Character not found');
  }

  try {
    const result = await fetchCharacterSkills(char);
    if (result.error) {
      return res.status(500).send(result.error);
    }

    const fileContent = formatSkillsForEVE(result.skillsList);
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${char.name.replace(/[^a-zA-Z0-9]/g, '_')}_skills.txt"`);
    res.send(fileContent);
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

// Update Settings
app.post('/api/settings', (req, res) => {
  const { telegramToken, intervalMinutes, isSimulationMode, eveClientId, eveClientSecret, industryNotificationsEnabled } = req.body;

  const oldToken = dbState.settings.telegramToken;
  const oldRunning = dbState.settings.isBotRunning;

  dbState.settings.telegramToken = telegramToken !== undefined ? telegramToken.trim() : dbState.settings.telegramToken;
  dbState.settings.intervalMinutes = intervalMinutes !== undefined ? Number(intervalMinutes) : dbState.settings.intervalMinutes;
  dbState.settings.isSimulationMode = isSimulationMode !== undefined ? Boolean(isSimulationMode) : dbState.settings.isSimulationMode;
  
  if (eveClientId !== undefined) dbState.settings.eveClientId = eveClientId.trim();
  if (eveClientSecret !== undefined) dbState.settings.eveClientSecret = eveClientSecret.trim();
  if (industryNotificationsEnabled !== undefined) dbState.settings.industryNotificationsEnabled = Boolean(industryNotificationsEnabled);

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
    projects: dbState.projects || [],
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

  const scopes = 'esi-markets.read_character_orders.v1 esi-industry.read_character_jobs.v1 esi-industry.read_corporation_jobs.v1 esi-skills.read_skills.v1 esi-skills.read_skillqueue.v1';
  const ssoUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(appUrl + '/api/auth/eve/callback')}&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&state=${userTelegramChatId}`;
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
