import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG } from '../constants/config';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${APP_CONFIG.serverUrl}/api${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'حدث خطأ في الاتصال');
  }
  return data;
}

// Auth
export async function login(username: string, password: string, device_id?: string) {
  const data = await request('/users/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, device_id }),
  });
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function logout() {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

export async function getStoredUser() {
  const userStr = await AsyncStorage.getItem(USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
}

// Vehicles
export const getVehicles = () => request('/vehicles');
export const createVehicle = (data: { plate_number: string; description?: string }) =>
  request('/vehicles', { method: 'POST', body: JSON.stringify(data) });
export const updateVehicle = (id: number, data: { plate_number?: string; description?: string }) =>
  request(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteVehicle = (id: number) =>
  request(`/vehicles/${id}`, { method: 'DELETE' });
export const importVehicles = (vehicles: { plate_number: string; description?: string }[]) =>
  request('/vehicles/import', { method: 'POST', body: JSON.stringify({ vehicles }) });
export const importVehiclesFile = (fileData: string) =>
  request('/vehicles/import-file', { method: 'POST', body: JSON.stringify({ fileData }) });

// Shifts
export const getShifts = (date?: string) =>
  request(`/shifts${date ? `?date=${date}` : ''}`);
export const getShift = (id: number) => request(`/shifts/${id}`);
export const getTodayShift = () => request('/shifts/today/active');
export const createShift = (data: { date: string; name: string; vehicle_ids: any[] }) =>
  request('/shifts', { method: 'POST', body: JSON.stringify(data) });
export const updateShiftVehicles = (id: number, vehicle_ids: any[]) =>
  request(`/shifts/${id}/vehicles`, { method: 'PUT', body: JSON.stringify({ vehicle_ids }) });
export const deleteShift = (id: number) =>
  request(`/shifts/${id}`, { method: 'DELETE' });

// Scan & Reports
export const startScan = (options?: { latitude?: number; longitude?: number }) =>
  request('/reports/scan/start', { method: 'POST', body: JSON.stringify(options || {}) });
export const submitPlate = (session_id: number, plate_number: string, location?: { latitude: number; longitude: number }) =>
  request('/reports/scan/plate', { method: 'POST', body: JSON.stringify({ session_id, plate_number, ...location }) });
export const completeScan = (session_id: number) =>
  request('/reports/scan/complete', { method: 'POST', body: JSON.stringify({ session_id }) });
export const getReport = (sessionId: number) => request(`/reports/scan/${sessionId}`);
export const getReports = (date?: string) =>
  request(`/reports${date ? `?date=${date}` : ''}`);
export const getReportPdf = (sessionId: number) => request(`/reports/pdf/${sessionId}`);

// Users
export const getUsers = () => request('/users');
export const createUser = (data: { username: string; password: string; name: string; role: string }) =>
  request('/users', { method: 'POST', body: JSON.stringify(data) });
export const deleteUser = (id: number) =>
  request(`/users/${id}`, { method: 'DELETE' });
export const resetUserDevice = (id: number) =>
  request(`/users/${id}/reset-device`, { method: 'PUT' });

// Reports Excel
export const getReportExcel = (sessionId: number) => request(`/reports/excel/${sessionId}`);

// App Settings
export const getAppSettings = () => request('/settings');
export const updateAppSettings = (data: { appName?: string; companyName?: string }) =>
  request('/settings', { method: 'PUT', body: JSON.stringify(data) });
export const uploadLogo = (logo: string) =>
  request('/settings/logo', { method: 'POST', body: JSON.stringify({ logo }) });
