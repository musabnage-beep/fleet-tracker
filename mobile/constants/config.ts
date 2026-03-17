// ========================================
// قم بتغيير هذه الإعدادات حسب شركتك
// ========================================

export const APP_CONFIG = {
  // اسم التطبيق (يظهر في الشاشات)
  appName: 'Fleet Tracker',

  // اسم الشركة - اتركه فارغ إذا لا تريد عرضه
  companyName: '',

  // عنوان الخادم - غيّره حسب طريقة التشغيل:
  // محلي: 'localhost' أو '192.168.1.100'
  // سحابي: 'fleet-tracker-api.onrender.com'
  serverHost: 'fleet-tracker-api.onrender.com',

  // المنفذ - للسيرفر المحلي: '3000'، للسحابي: '443'
  serverPort: '443',

  get serverUrl() {
    // استخدم https تلقائياً للمنفذ 443 (السيرفر السحابي)
    if (this.serverPort === '443') {
      return `https://${this.serverHost}`;
    }
    return `http://${this.serverHost}:${this.serverPort}`;
  },
};
