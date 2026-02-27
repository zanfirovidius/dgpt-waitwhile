'use server';


const WAITWHILE_URL = 'https://api.waitwhile.com/v2';

/**
 * Universal native fetch to replace the '@api/waitwhile' SDK
 */
async function waitwhileFetch(endpoint: string, method: string = 'GET', body?: any) {
  const API_KEY = process.env.WAITWHILE_API_KEY;
  if (!API_KEY) throw new Error('API Key missing');

  const url = endpoint.startsWith('http') ? endpoint : `${WAITWHILE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
    cache: 'no-store'
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    let errorObj;
    try { errorObj = JSON.parse(errorText); } catch(e) { errorObj = errorText; }
    throw { response: { data: errorObj } };
  }
  
  if (res.status === 204) return { data: null };
  const data = await res.json();
  return { data };
}

export interface Location {
  id: string;
  name: string;
}

export interface UserPayload {
  name: string;
  email: string;
  locationIds: string[];
  defaultLocationId: string;
  roles: string[];
  password?: string;
}

/**
 * Fetches all available locations from Waitwhile
 */
export async function getLocations(): Promise<{ success: boolean; data?: Location[]; error?: string }> {

  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) {
      console.error('[Waitwhile] API Key is missing');
      return { success: false, error: 'Server configuration error: Missing API Key' };
    }

    // Fetch locations with a limit of 20
    const response = await waitwhileFetch('/locations?limit=20');
    const data = response.data;

    // Use the array directly as provided by the SDK or fallback depending on SDK structure
    const locationData = Array.isArray(data) ? data : (data.results || data.data || []);
    
    if (!Array.isArray(locationData)) {
      console.error('[Waitwhile] Unexpected response format:', data);
      return { success: false, error: 'Unexpected response format from Waitwhile' };
    }
    
    const mappedLocations = locationData.map((loc: any) => ({
      id: loc.id,
      name: loc.name,
    }));
    
    return { success: true, data: mappedLocations };
  } catch (error: any) {
    console.error('[Waitwhile] System error in getLocations:', error.message);
    return { success: false, error: 'Failed to fetch locations from Waitwhile' };
  }
}

/**
 * Creates a new user in Waitwhile.
 * Returns { success: true, ... } if successful, or { success: false, error: ... } if failed.
 */
export async function createUser(payload: UserPayload): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) {
      return { success: false, error: 'Server configuration error: Missing API Key' };
    }

    // Send POST payload native
    const response = await waitwhileFetch('/users', 'POST', payload);

    return { success: true, data: response.data };
  } catch (error: any) {
    const errData = error.data || error.response?.data;
    console.error(`[Waitwhile] System error in createUser for ${payload.name}:`, errData || error.message);
    
    // Check if error is because user already exists
    if (errData?.errorCode === 'user_email_exists') {
      return { success: false, error: 'user_email_exists' };
    }
    
    return { 
      success: false, 
      error: errData?.message || error.message 
    };
  }
}

export interface WaitwhileUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  roles: string[];
  created: number;
}

export async function getAllUsers(limit: number = 100): Promise<{ success: boolean; data?: WaitwhileUser[]; error?: string }> {
  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) {
      return { success: false, error: 'Server configuration error' };
    }
    
    const response = await waitwhileFetch(`/users?limit=${limit}`);
    const data = response.data;

    const results = Array.isArray(data) ? data : (data.results || data.data || []);
    
    if (!Array.isArray(results)) {
      console.error('[Waitwhile] Unexpected GET /users format:', data);
      return { success: false, error: 'Unexpected response' };
    }

    const mappedUsers = results.map((u: any) => ({
      id: u.id,
      name: u.name,
      phone: u.phone || '',
      email: u.email || '',
      roles: u.roles || [],
      created: u.created
    }));

    return { success: true, data: mappedUsers };
  } catch (error: any) {
    console.error('[Waitwhile] Error fetching users:', error.message);
    return { success: false, error: 'Failed to fetch users' };
  }
}

export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) {
      return { success: false, error: 'Server configuration error' };
    }

    // We pass fb: true to delete from firebase too
    await waitwhileFetch(`/users/${userId}?fb=true`, 'DELETE');

    return { success: true };
  } catch (error: any) {
    console.error(`[Waitwhile] Error deleting user ${userId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// -------------------------------------------------------------------------------- //
// Sandbox Random Bookings Generators
// -------------------------------------------------------------------------------- //

const RESOURCES = [
  "2MGdAZNv8JxFOghRAqwg", "4u8H4d6tEzKRPG9dw6il", "8eE4aAnoHaOMWgpOoX1n",
  "91uY4AF4wvLj7b5NhmMw", "Arz6TO0ol768wLI1XwQ2", "BEeRNK5shEPuZZ3y4FBo",
  "BnQhfX2cITC467EhTsfC", "C07tRTo1TPWYQxPIG9iJ", "ERoztFt2AnPw2Z98dJFp",
  "EY2wKESEQfRscoPtgxS9", "Etl6ZHJKoSFRwyPQpIYJ", "H9VtaH94huQaLJrIu5rW",
  "KpLrPDkqLbH805bjKFhX", "L47HcNnamOOPgWcGamFJ", "L7JPyYLWQy9JiHx7R6FN",
  "SLC5gI810aIRC8Ew82zJ", "Srny6dkcx6AbxdFAjqvE", "UXAddFfLqhFplm8pJ7xg",
  "WuPoClbNPVOw62h7H9Dh", "XX6Bkv2OMmF1Wh52eAyZ", "XugQr6k08UJUboo4KwtI",
  "ZFjj2jRcfCq59sK6KVVh", "aD4WWO7Isi2ouUQq9cFL", "bwpeIJGbqixKhBttgswu",
  "dTPcua5qYnlHTkkVqCiI", "dcb32774nRMRPDc1d6tO", "hSujYUEKiyjOQvxJxht1",
  "ioQjPmBKTQ861eiuEuF2", "k4eyCpS97Lb8FG6JZgE7", "lRG0NskdJYtOvejRnpqh",
  "lxpUlmEpzyZrqSHoVD5x", "mF0xPFe4HuWGrDCNPg70", "pgXRS0p7rzXizKx0mAal",
  "vJnrOmMgtycBVidiZEuB", "xLd5dIuVqYoEA5KTWEoK"
];

const DUMMY_NAMES = ['John Doe', 'Jane Smith', 'Michael Johnson', 'Emily Davis', 'Daniel Brown'];
const DUMMY_EMAILS = ['john@example.com', 'jane@example.com', 'michael@example.com', 'emily@example.com', 'daniel@example.com'];
const DUMMY_PHONES = ['+40740000000', '+40741111111', '+40742222222', '+40743333333', '+40744444444'];

function padZe(n: number) { return String(n).padStart(2, '0'); }

export async function createSandboxBookings(locationId: string, dateStr: string, numberOfBookings: number): Promise<{ success: boolean; generated: number; error?: string }> {
  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) {
      return { success: false, generated: 0, error: 'Server configuration error' };
    }
    
    // Starting at 10:00 AM UTC
    let startTime = new Date(`${dateStr}T10:00:00Z`);

    for (let i = 0; i < numberOfBookings; i++) {
        const year = startTime.getUTCFullYear();
        const month = padZe(startTime.getUTCMonth() + 1);
        const day = padZe(startTime.getUTCDate());
        const hours = padZe(startTime.getUTCHours());
        const minutes = padZe(startTime.getUTCMinutes());
        const formattedStartTime = `${year}-${month}-${day}T${hours}:${minutes}`;

        const randomIndex = Math.floor(Math.random() * DUMMY_NAMES.length);
        const randomResourceIndex = Math.floor(Math.random() * RESOURCES.length);
        const cnp = (Math.floor(1000000000000 + Math.random() * 9000000000000)).toString();

        const bookingData = {
          state: 'BOOKED',
          locationId: locationId,
          firstName: DUMMY_NAMES[randomIndex].split(' ')[0],
          lastName: DUMMY_NAMES[randomIndex].split(' ')[1],
          email: DUMMY_EMAILS[randomIndex],
          phone: DUMMY_PHONES[randomIndex],
          resourceIds: RESOURCES[randomResourceIndex],
          dataFields: [
            {id: '7dsy6NYH61aB2xXfJpv4', values: [cnp]},
            {id: 'STmVEtw0mKrHC4rQvBT7', values: ['1960-12-22']},
            {id: 'niW2XJab2dSiNDdnLAeZ', values: ['true']},
            {id: 'CmhDfMvsFwDcvdyXTWH9', values: ['Cluj']},
            {id: '8qNAELLGaFBbGhZXHiDa', values: ['Cluj-Napoca']},
            {id: 'P6FYeFK2I2gExeT0pbIK', values: ['altele']}
          ],
          date: formattedStartTime,
          duration: 1200,
          isBlock: false,
          source: 'API',
          locale: 'en-US',
          policyConsent: true,
          messageInfo: {
            lastOutgoing: {channel: 'EMAIL', state: 'PENDING'},
            lastIncoming: {channel: 'EMAIL'}
          },
          addTag: 'NO-SHOW',
          removeTag: 'NO-SHOW',
      };

      await waitwhileFetch('/visits', 'POST', [bookingData]);
      
      // Increment time by 20 minutes
      startTime.setUTCMinutes(startTime.getUTCMinutes() + 20);
    }

    return { success: true, generated: numberOfBookings };
  } catch (error: any) {
    const errData = error.response ? error.response.data : error.message;
    console.error('[Waitwhile Sandbox Error]:', errData);
    return { success: false, generated: 0, error: errData ? JSON.stringify(errData) : "Failed to generate bookings" };
  }
}

// -------------------------------------------------------------------------------- //
// Location Details
// -------------------------------------------------------------------------------- //

export async function getLocationDetails(locationId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) return { success: false, error: 'API Key missing' };

    const res = await fetch(`https://api.waitwhile.com/v2/locations/${locationId}`, {
      method: 'GET',
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// -------------------------------------------------------------------------------- //
// Occupancy Rate Aggregation
// -------------------------------------------------------------------------------- //

export interface OccupancyData {
  resourceId: string;
  name: string;
  total: number;
  available: number;
  booked: number; // total - available
  occupancyPercent: number;
  daily: {
    [dateString: string]: {
      total: number;
      available: number;
      booked: number;
      occupancyPercent: number;
    }
  }
}

export async function getOccupancy(locationId: string, fromDateStr: string, toDateStr: string): Promise<{
  success: boolean;
  data?: Record<string, OccupancyData>;
  global?: { total: number, available: number, booked: number, occupancyPercent: number };
  error?: string;
}> {
  try {
    const API_KEY = process.env.WAITWHILE_API_KEY;
    if (!API_KEY) return { success: false, error: 'Server configuration error' };
    // 1. Fetch Resources to get mapping
    const resResponse = await waitwhileFetch(`/resources?locationId=${locationId}&limit=100`);
    const resData: any = resResponse.data;
    const resourcesList: any[] = Array.isArray(resData) ? resData : (resData?.results || resData?.data || []);
    
    // Mapping: resourceId -> starting skeleton
    const resources: Record<string, OccupancyData> = {};
    resourcesList.forEach((r: any) => {
      // API locations often group all cabinets into a 'Category' resource.
      // This causes duplicate / 200% tracking. Skip them!
      if (r.isCategory) return;

      resources[r.id] = {
        resourceId: r.id,
        name: r.name,
        total: 0,
        available: 0,
        booked: 0,
        occupancyPercent: 0,
        daily: {}
      };
    });

    // 2. Fetch Availability Slots
    // To match the legacy script: we need to pass strict 'YYYY-MM-DDTHH:mm' (no seconds, no Z)
    const fromDateISO = `${fromDateStr}T00:00`;
    const toDateISO = `${toDateStr}T23:59`;

    const q = new URLSearchParams({
      locationId,
      fromDate: fromDateISO,
      toDate: toDateISO,
      showRemoved: 'false',
      showPending: 'false',
      showDraft: 'false',
      showRejected: 'false',
      showBookings: 'true',
      showServices: 'false',
      showDetails: 'true',
      isPublic: 'false'
    });

    const visitsResp = await waitwhileFetch(`/visits/availability?${q.toString()}`);

    let visits: any[] = [];
    if (Array.isArray(visitsResp.data)) {
      visits = visitsResp.data;
    } else if (visitsResp.data && Array.isArray((visitsResp.data as any).results)) {
      visits = (visitsResp.data as any).results;
    } else {
      return { success: false, error: 'Failed to acquire availability slots from Waitwhile API.' };
    }

    // 3. Aggregate
    visits.forEach((visit: any) => {
      const bookings = Array.isArray(visit.bookings) ? visit.bookings : [];
      
      // Filter slots that are BLOCKS to ignore them from capacity fully
      const blockBookings = bookings.filter((b: any) => b?.isBlock === true || b?.type === 'BLOCK');
      const blockedResourceIds = new Set(
        blockBookings.flatMap((b: any) => Array.isArray(b?.resourceIds) ? b.resourceIds : [])
      );

      const availByRes = visit.numAvailableSpotsByResourceId || {};
      const totalByRes = visit.numSpotsByResourceId || {};
      
      const dateKey = visit.date ? String(visit.date).substring(0, 10) : '';

      Object.keys(availByRes).forEach(resourceKey => {
        // Skip blocked slots
        if (blockedResourceIds.has(resourceKey)) return;

        // Skip category umbrellas and unrecognized resources that were explicitly filtered out
        if (!resources[resourceKey]) return;

        const slotTotal = Math.max(0, totalByRes[resourceKey] || 0);
        const slotAvail = Math.max(0, availByRes[resourceKey] || 0);

        resources[resourceKey].available += slotAvail;
        resources[resourceKey].total += slotTotal;

        if (dateKey) {
          if (!resources[resourceKey].daily[dateKey]) {
            resources[resourceKey].daily[dateKey] = {
              total: 0, available: 0, booked: 0, occupancyPercent: 0
            };
          }
          resources[resourceKey].daily[dateKey].available += slotAvail;
          resources[resourceKey].daily[dateKey].total += slotTotal;
        }
      });
    });

    // 4. Calculate Final Percentages & Booked
    let globalTotal = 0;
    let globalAvail = 0;

    Object.keys(resources).forEach(key => {
      const res = resources[key];

      res.booked = Math.max(0, res.total - res.available);
      res.occupancyPercent = res.total > 0 ? (res.booked / res.total) * 100 : 0;
      globalTotal += res.total;
      globalAvail += res.available;

      Object.values(res.daily).forEach(day => {
        day.booked = Math.max(0, day.total - day.available);
        day.occupancyPercent = day.total > 0 ? (day.booked / day.total) * 100 : 0;
      });
    });

    const globalBooked = Math.max(0, globalTotal - globalAvail);
    const globalPercent = globalTotal > 0 ? (globalBooked / globalTotal) * 100 : 0;

    return { 
      success: true, 
      data: resources, 
      global: { 
        total: globalTotal, 
        available: globalAvail, 
        booked: globalBooked, 
        occupancyPercent: globalPercent 
      } 
    };
  } catch (error: any) {
    const errData = error.response ? error.response.data : error.message;
    console.error('[Occupancy Error Details]:', errData);
    return { success: false, error: error.response?.data?.message || errData?.message || 'Failed to calculate occupancy. See server logs.' };
  }
}
