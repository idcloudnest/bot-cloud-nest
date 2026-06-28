import dotenv from 'dotenv';

dotenv.config();

export const config = {
  appPort: Number(process.env.APP_PORT || 3000),
  botName: process.env.BOT_NAME || 'Cloud Nest Bot',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  ignoreGroups: process.env.IGNORE_GROUPS === 'true',
  ignorePrivates: process.env.IGNORE_PRIVATES === 'true',
  logLimit: Number(process.env.LOG_LIMIT || 100),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE || 'bot_cloud_nest',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
  },
};
