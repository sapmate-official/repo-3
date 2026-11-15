import axios from 'axios';
import { prisma } from '../db/prisma.js';

const CALENDARIFIC_API_KEY =
  process.env.CALENDARIFIC_API_KEY ?? 'TaJ4HfICjs5du1cMOs6V1xA7mDQ89Hup';

interface CalendarificHoliday {
  name: string;
  description?: string;
  date: {
    iso: string;
    datetime: {
      year: number;
      month: number;
      day: number;
    };
  };
  type: string[];
  primary_type?: string;
}

interface HolidayToSeed {
  name: string;
  date: string; // YYYY-MM-DD
  description: string;
  isNational: boolean;
  isOptional: boolean;
}

export async function fetchCalendarificHolidays(
  country: string,
  year: number,
  apiKey: string
): Promise<CalendarificHoliday[]> {
  const url = `https://calendarific.com/api/v2/holidays?api_key=${apiKey}&country=${country}&year=${year}`;
  const response = await axios.get<{
    meta: { code: number };
    response: { holidays: CalendarificHoliday[] };
  }>(url);

  if (response.data.meta.code !== 200 || !response.data.response?.holidays) {
    throw new Error(`Calendarific API returned error code ${response.data.meta.code}`);
  }

  return response.data.response.holidays;
}

export async function syncHolidaysForOrg(params: {
  orgId: string;
  year: number;
  country: string;
  apiKey?: string;
}) {
  const { orgId, year, country, apiKey = CALENDARIFIC_API_KEY } = params;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { holidayTypes: true }
  });

  if (!org) {
    throw new Error(`Organization ${orgId} not found`);
  }

  console.log(`\n========================================`);
  console.log(`Syncing holidays for Organization: "${org.name}" (${org.id})`);
  console.log(`Target Year: ${year}, Country: ${country}`);
  console.log(`========================================`);

  // Ensure "Public Holiday" and "National Holiday" types exist
  let publicType = org.holidayTypes.find(
    (t) => t.name.toLowerCase() === 'public holiday'
  );
  if (!publicType) {
    publicType = await prisma.holidayType.create({
      data: {
        orgId: org.id,
        name: 'Public Holiday',
        policy:
          'The company observes public holidays. The office is closed on these days and employees are not expected to work.'
      }
    });
    console.log(`Created HolidayType "Public Holiday" (${publicType.id})`);
  }

  let nationalType = org.holidayTypes.find(
    (t) => t.name.toLowerCase() === 'national holiday'
  );
  if (!nationalType) {
    nationalType = await prisma.holidayType.create({
      data: {
        orgId: org.id,
        name: 'National Holiday',
        policy: 'Mandatory national holiday observance across all offices.'
      }
    });
    console.log(`Created HolidayType "National Holiday" (${nationalType.id})`);
  }

  // Fetch from Calendarific
  console.log(`Fetching ${year} holidays from Calendarific for country "${country}"...`);
  const rawHolidays = await fetchCalendarificHolidays(country, year, apiKey);
  console.log(`Received ${rawHolidays.length} raw holiday entries from Calendarific.`);

  // Curate major Gazetted & Public company holidays for India
  // Matches existing company calendar: New Year, Republic Day, Holi, Eid, Bakrid, Independence Day, Dussehra, Diwali, Christmas, etc.
  const isTargetHoliday = (h: CalendarificHoliday): boolean => {
    const nameLower = h.name.toLowerCase();
    const types = h.type.map((t) => t.toLowerCase());
    const isGazetted =
      (h.primary_type?.toLowerCase().includes('gazetted') ?? false) ||
      types.includes('national holiday');

    // Always include New Year's Day (which Calendarific marks as restricted/optional in India)
    if (nameLower.includes("new year's day") && !nameLower.includes('substitute') && !nameLower.includes('eve')) {
      return true;
    }

    // Gazetted holidays
    if (isGazetted) {
      return true;
    }

    return false;
  };

  const filtered = rawHolidays.filter(isTargetHoliday);

  // Clean and deduplicate by date (YYYY-MM-DD), prioritizing National holidays
  const dateMap = new Map<string, HolidayToSeed>();

  for (const h of filtered) {
    const dateStr = h.date.iso.split('T')[0]!;
    const nameLower = h.name.toLowerCase();

    // Friendly clean naming
    let cleanName = h.name.replace(/\s*\(provisional forecast\)/i, '').replace(/\s*\(provisional\)/i, '').trim();
    if (cleanName === 'Ramzan Id') cleanName = 'Eid-ul-Fitar (Ramzan Id)';
    if (cleanName === 'Bakrid') cleanName = 'Bakrid-Eid';
    if (cleanName === 'Dussehra') cleanName = 'Dasara (Dussehra)';
    if (cleanName === 'Diwali/Deepavali') cleanName = 'Diwali';
    if (cleanName === 'Maha Shivaratri/Shivaratri') cleanName = 'Maha Shivaratri';

    const isNational =
      nameLower.includes('republic day') ||
      nameLower.includes('independence day') ||
      nameLower.includes('gandhi jayanti');

    const entry: HolidayToSeed = {
      name: cleanName,
      date: dateStr,
      description: h.description ?? '',
      isNational,
      isOptional: false
    };

    // If collision exists on date, prefer National Holiday over religious/festival holiday
    const existing = dateMap.get(dateStr);
    if (!existing || (!existing.isNational && isNational)) {
      dateMap.set(dateStr, entry);
    }
  }

  // Sort by date
  const holidaysToInsert = Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  console.log(`\nUpserting ${holidaysToInsert.length} curated holidays for ${year}:`);

  const results = [];
  for (const item of holidaysToInsert) {
    const typeId = item.isNational ? nationalType.id : publicType.id;
    const typeName = item.isNational ? 'National Holiday' : 'Public Holiday';
    const holidayDate = new Date(`${item.date}T00:00:00.000Z`);

    const upserted = await prisma.holiday.upsert({
      where: {
        orgId_date: {
          orgId: org.id,
          date: holidayDate
        }
      },
      update: {
        name: item.name,
        description: item.description,
        type: typeId,
        isOptional: item.isOptional
      },
      create: {
        orgId: org.id,
        name: item.name,
        date: holidayDate,
        description: item.description,
        type: typeId,
        isOptional: item.isOptional
      }
    });

    results.push({
      date: item.date,
      name: item.name,
      type: typeName,
      id: upserted.id
    });
    console.log(`  ✓ ${item.date} | ${item.name.padEnd(28)} | ${typeName}`);
  }

  return results;
}

async function runCli() {
  const targetYear = 2027;
  const targetCountry = 'IN';
  const targetOrgId = 'cm7ukscsi0000p8ujzrr7di2o'; // Sapmate Training

  try {
    const results = await syncHolidaysForOrg({
      orgId: targetOrgId,
      year: targetYear,
      country: targetCountry
    });
    console.log(`\nSuccessfully updated ${results.length} holidays for 2027!`);
  } catch (err) {
    console.error('Error syncing holidays:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('sync-holidays.ts')) {
  runCli();
}
