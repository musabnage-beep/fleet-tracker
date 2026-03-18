// Saudi License Plate Arabic <-> Latin letter mapping
// Official Saudi plate mapping: https://www.moi.gov.sa

const AR_TO_EN = {
  'أ': 'A', 'ا': 'A',
  'ب': 'B',
  'ح': 'H',
  'د': 'D',
  'ر': 'R',
  'س': 'S',
  'ص': 'X',
  'ط': 'T',
  'ع': 'E',
  'ق': 'G',
  'ك': 'K',
  'ل': 'L',
  'م': 'Z',
  'ن': 'N',
  'ه': 'U',
  'و': 'W',
  'ي': 'V',
};

const EN_TO_AR = {};
for (const [ar, en] of Object.entries(AR_TO_EN)) {
  // Only set if not already set (avoid overwriting أ with ا)
  if (!EN_TO_AR[en]) EN_TO_AR[en] = ar;
}

// Convert Arabic digits to Western digits
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/**
 * Normalize a plate number to a standard format: "DIGITS LETTERS" in Latin
 * Examples:
 *   "ر ص ب 1527" -> "1527 RSB"
 *   "1527 RSB"    -> "1527 RSB"
 *   "RSB 1527"    -> "1527 RSB"
 *   "ر ص ب1527"  -> "1527 RSB"
 *   "٦٢٥١ أ ج ع" -> "6251 EJA" (if Arabic digits)
 */
function normalizePlate(plate) {
  if (!plate) return '';
  let p = String(plate).trim();

  // Convert Arabic digits to Western
  for (const [ar, en] of Object.entries(AR_DIGITS)) {
    p = p.replace(new RegExp(ar, 'g'), en);
  }

  // Convert Arabic letters to Latin
  let converted = '';
  for (const ch of p) {
    if (AR_TO_EN[ch]) {
      converted += AR_TO_EN[ch];
    } else {
      converted += ch;
    }
  }

  // Remove extra spaces, dashes
  converted = converted.replace(/[\s\-]+/g, ' ').trim().toUpperCase();

  // Extract digits and letters separately
  const digits = converted.replace(/[^0-9]/g, '');
  const letters = converted.replace(/[^A-Z]/g, '');

  if (!digits || !letters) return converted; // fallback

  // Standard format: DIGITS + space + LETTERS
  return `${digits} ${letters}`;
}

/**
 * Check if two plate numbers match (comparing normalized forms)
 */
function platesMatch(plate1, plate2) {
  return normalizePlate(plate1) === normalizePlate(plate2);
}

/**
 * Find a vehicle by plate number, trying normalized matching
 */
async function findVehicleByPlate(db, plateNumber) {
  const normalized = normalizePlate(plateNumber);

  // First try exact match
  let vehicle = await db.prepare(
    'SELECT * FROM vehicles WHERE plate_number = ? AND is_active = 1'
  ).get(plateNumber.trim().toUpperCase());

  if (vehicle) return vehicle;

  // Try normalized match - get all active vehicles and compare
  const allVehicles = await db.prepare(
    'SELECT * FROM vehicles WHERE is_active = 1'
  ).all();

  for (const v of allVehicles) {
    if (normalizePlate(v.plate_number) === normalized) {
      return v;
    }
  }

  return null;
}

module.exports = { normalizePlate, platesMatch, findVehicleByPlate, AR_TO_EN, EN_TO_AR };
